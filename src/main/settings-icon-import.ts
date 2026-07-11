import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { open, unlink, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import path from 'node:path';
import { clipboard, nativeImage, NativeImage } from 'electron';
import { SETTINGS_ICON_MAX_INPUT_BYTES } from '../shared/icon-import';
import {
  CONFIGURED_ICON_EXTENSIONS,
  getPersistentIconDirectory,
} from './configured-icon';

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_EDGE = 8192;
const MAX_SOURCE_PIXELS = 16 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 512;
const MAX_REMOTE_REDIRECTS = 3;
const REMOTE_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_REMOTE_IMPORTS = 2;

let activeRemoteImports = 0;

const REMOTE_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/png': ['.png'],
  'image/x-png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/pjpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'image/x-icon': ['.ico'],
  'image/vnd.microsoft.icon': ['.ico'],
  'image/tiff': ['.tif', '.tiff'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'image/avif': ['.avif'],
};

interface ImportedBytes {
  bytes: Buffer;
  extension: string;
  suggestedName: string;
}

interface RemoteResponse {
  bytes?: Buffer;
  contentType?: string;
  redirect?: string;
}

export class IconImportError extends Error {}

function ensureInputSize(byteLength: number) {
  if (byteLength <= 0) {
    throw new IconImportError('The selected image is empty.');
  }
  if (byteLength > SETTINGS_ICON_MAX_INPUT_BYTES) {
    throw new IconImportError('The image must be 10 MB or smaller.');
  }
}

function getRasterExtension(bytes: Buffer) {
  if (
    bytes.length >= 24 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return '.png';
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return '.jpg';
  }
  if (
    bytes.length >= 10 &&
    ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))
  ) {
    return '.gif';
  }
  if (
    bytes.length >= 16 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  if (bytes.length >= 26 && bytes.subarray(0, 2).toString('ascii') === 'BM') {
    return '.bmp';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0 &&
    bytes[1] === 0 &&
    bytes[2] === 1 &&
    bytes[3] === 0
  ) {
    return '.ico';
  }
  if (
    bytes.length >= 8 &&
    (bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
      bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))
  ) {
    return '.tiff';
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = bytes.subarray(8, 12).toString('ascii').toLowerCase();
    if (['avif', 'avis'].includes(brand)) return '.avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return '.heic';
    }
  }
  return undefined;
}

function getJpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
    } else {
      const marker = bytes[offset + 1];
      const segmentLength = bytes.readUInt16BE(offset + 2);
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isStartOfFrame && segmentLength >= 7) {
        return {
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }
      if (segmentLength < 2) break;
      offset += segmentLength + 2;
    }
  }
  return undefined;
}

function getEncodedDimensions(bytes: Buffer, extension: string) {
  if (extension === '.png' && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (extension === '.jpg') return getJpegDimensions(bytes);
  if (extension === '.gif' && bytes.length >= 10) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (extension === '.bmp' && bytes.length >= 26) {
    return {
      width: Math.abs(bytes.readInt32LE(18)),
      height: Math.abs(bytes.readInt32LE(22)),
    };
  }
  if (extension === '.ico' && bytes.length >= 8) {
    return {
      width: bytes[6] || 256,
      height: bytes[7] || 256,
    };
  }
  return undefined;
}

function validateDimensions(size: { width: number; height: number }) {
  const { width, height } = size;
  if (!width || !height) {
    throw new IconImportError('The selected file is not a valid image.');
  }
  if (
    width > MAX_SOURCE_EDGE ||
    height > MAX_SOURCE_EDGE ||
    width * height > MAX_SOURCE_PIXELS
  ) {
    throw new IconImportError(
      'The image dimensions are too large. Use an image up to 8192 px and 16 megapixels.',
    );
  }
}

async function decodeBytes(bytes: Buffer, extension: string) {
  const encodedSize = getEncodedDimensions(bytes, extension);
  if (encodedSize) validateDimensions(encodedSize);

  let image = nativeImage.createEmpty();
  const directory = await getPersistentIconDirectory();
  const temporaryPath = path.join(
    directory,
    `.icon-import-${randomUUID()}${extension}`,
  );
  try {
    await writeFile(temporaryPath, bytes, { flag: 'wx', mode: 0o600 });
    if (['darwin', 'win32'].includes(process.platform)) {
      try {
        image = await nativeImage.createThumbnailFromPath(temporaryPath, {
          width: MAX_OUTPUT_EDGE * 2,
          height: MAX_OUTPUT_EDGE * 2,
        });
      } catch {
        image = nativeImage.createEmpty();
      }
    } else if (encodedSize) {
      image = nativeImage.createFromBuffer(bytes);
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
  return image;
}

function normalizeImage(image: NativeImage) {
  if (image.isEmpty()) {
    throw new IconImportError('The selected file is not a valid image.');
  }
  const size = image.getSize();
  validateDimensions(size);

  const scale = Math.min(
    1,
    MAX_OUTPUT_EDGE / Math.max(size.width, size.height),
  );
  const normalized =
    scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: 'best',
        })
      : image;
  const png = normalized.toPNG();
  if (!png.length || png.length > MAX_OUTPUT_BYTES) {
    throw new IconImportError(
      'The image could not be converted to a PNG icon.',
    );
  }
  return png;
}

function sanitizeStem(fileName: string) {
  const stem = path
    .parse(path.basename(fileName))
    .name.normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return stem || 'icon';
}

async function persistPng(png: Buffer, suggestedName: string) {
  const directory = await getPersistentIconDirectory();
  const fileName = `${sanitizeStem(suggestedName)}-${randomUUID().slice(0, 8)}.png`;
  const destination = path.resolve(directory, fileName);
  if (path.dirname(destination) !== path.resolve(directory)) {
    throw new IconImportError('The icon destination is invalid.');
  }
  await writeFile(destination, png, { flag: 'wx', mode: 0o600 });
  return fileName;
}

async function persistBytes(imported: ImportedBytes) {
  ensureInputSize(imported.bytes.length);
  const image = await decodeBytes(imported.bytes, imported.extension);
  return persistPng(normalizeImage(image), imported.suggestedName);
}

export async function importConfiguredIconFromPath(sourcePath: string) {
  if (!sourcePath || sourcePath.includes('\0')) {
    throw new IconImportError('The selected image path is invalid.');
  }
  const extension = path.extname(sourcePath).toLowerCase();
  if (!CONFIGURED_ICON_EXTENSIONS.includes(extension)) {
    throw new IconImportError('Select a supported image file.');
  }

  let handle;
  try {
    handle = await open(sourcePath, 'r');
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new IconImportError('The selected item is not a file.');
    }
    ensureInputSize(stats.size);
    const bytes = await handle.readFile();
    ensureInputSize(bytes.length);
    return await persistBytes({
      bytes,
      extension,
      suggestedName: path.basename(sourcePath),
    });
  } catch (error) {
    if (error instanceof IconImportError) throw error;
    throw new IconImportError('The selected image could not be read.');
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function importConfiguredIconFromBytes(
  value: Uint8Array,
  fileName = 'web-image',
  mimeType = '',
) {
  const bytes = Buffer.from(value);
  ensureInputSize(bytes.length);
  const extension = getRasterExtension(bytes);
  if (!extension) {
    throw new IconImportError(
      'Only PNG, JPEG, GIF, WebP, BMP, ICO, TIFF, HEIC, or AVIF image data is supported.',
    );
  }
  const normalizedMimeType = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
    const allowedExtensions = REMOTE_MIME_EXTENSIONS[normalizedMimeType];
    if (!allowedExtensions?.includes(extension)) {
      throw new IconImportError(
        'The dropped content is not a supported image.',
      );
    }
  }
  return persistBytes({ bytes, extension, suggestedName: fileName });
}

export async function importConfiguredIconFromClipboard() {
  const image = clipboard.readImage();
  if (image.isEmpty()) {
    throw new IconImportError('The clipboard does not contain an image.');
  }
  return persistPng(normalizeImage(image), 'clipboard-icon');
}

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && [18, 19].includes(b)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase().split('%', 1)[0];
  return (
    /^[23]/.test(normalized) &&
    !normalized.startsWith('2001:2:') &&
    !normalized.startsWith('2001:10:') &&
    !normalized.startsWith('2001:20:') &&
    !normalized.startsWith('2001:db8:')
  );
}

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function remoteTimeoutError() {
  return new IconImportError('Downloading the webpage image timed out.');
}

function remainingRemoteTime(deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw remoteTimeoutError();
  return remaining;
}

async function resolveRemoteAddress(url: URL, deadline: number) {
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    isIP(hostname)
  ) {
    throw new IconImportError('That webpage image address is not allowed.');
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(remoteTimeoutError()),
        remainingRemoteTime(deadline),
      );
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new IconImportError('That webpage image address is not allowed.');
  }
  return addresses.find(({ family }) => family === 4) ?? addresses[0];
}

function parseRemoteUrl(value: string) {
  if (!value || value.length > 2048 || value.includes('\0')) {
    throw new IconImportError('The webpage image URL is invalid.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IconImportError('The webpage image URL is invalid.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  ) {
    throw new IconImportError(
      'Only public HTTPS webpage images are supported.',
    );
  }
  return url;
}

function getResponseHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function requestRemoteImage(
  url: URL,
  deadline: number,
): Promise<RemoteResponse> {
  const address = await resolveRemoteAddress(url, deadline);
  const remaining = remainingRemoteTime(deadline);
  return new Promise((resolve, reject) => {
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const clearDeadlineTimer = () => {
      if (deadlineTimer) clearTimeout(deadlineTimer);
    };
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        clearDeadlineTimer();
        reject(error);
      }
    };
    const succeed = (response: RemoteResponse) => {
      if (!settled) {
        settled = true;
        clearDeadlineTimer();
        resolve(response);
      }
    };
    const request = https.request(
      {
        method: 'GET',
        hostname: address.address,
        family: address.family,
        port: 443,
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: {
          Accept:
            'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon,image/tiff,image/heic,image/heif,image/avif',
          'Accept-Encoding': 'identity',
          Host: url.host,
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = getResponseHeader(response.headers.location);
        if (statusCode >= 300 && statusCode < 400 && location) {
          succeed({ redirect: location });
          response.destroy();
          request.destroy();
          return;
        }
        if (statusCode !== 200) {
          fail(
            new IconImportError('The webpage image could not be downloaded.'),
          );
          response.destroy();
          request.destroy();
          return;
        }

        const contentEncoding = getResponseHeader(
          response.headers['content-encoding'],
        );
        if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
          fail(
            new IconImportError(
              'The webpage returned an unsupported image response.',
            ),
          );
          response.destroy();
          request.destroy();
          return;
        }
        const contentType = (
          getResponseHeader(response.headers['content-type']) ?? ''
        )
          .split(';', 1)[0]
          .trim()
          .toLowerCase();
        if (!REMOTE_MIME_EXTENSIONS[contentType]) {
          fail(
            new IconImportError(
              'The webpage did not return a supported image.',
            ),
          );
          response.destroy();
          request.destroy();
          return;
        }
        const contentLength = Number(
          getResponseHeader(response.headers['content-length']) ?? 0,
        );
        if (
          Number.isFinite(contentLength) &&
          contentLength > SETTINGS_ICON_MAX_INPUT_BYTES
        ) {
          fail(
            new IconImportError('The webpage image must be 10 MB or smaller.'),
          );
          response.destroy();
          request.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;
        response.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > SETTINGS_ICON_MAX_INPUT_BYTES) {
            fail(
              new IconImportError(
                'The webpage image must be 10 MB or smaller.',
              ),
            );
            response.destroy();
            request.destroy();
          } else {
            chunks.push(Buffer.from(chunk));
          }
        });
        response.on('end', () => {
          succeed({ bytes: Buffer.concat(chunks), contentType });
        });
        response.on('error', (error) => fail(error));
      },
    );
    deadlineTimer = setTimeout(() => {
      fail(remoteTimeoutError());
      request.destroy();
    }, remaining);
    request.setTimeout(remaining, () => {
      fail(remoteTimeoutError());
      request.destroy();
    });
    request.on('error', (error) => fail(error));
    request.end();
  });
}

async function downloadRemoteImage(
  value: string,
  redirectCount = 0,
  deadline = Date.now() + REMOTE_TIMEOUT_MS,
): Promise<{ bytes: Buffer; contentType: string; url: URL }> {
  remainingRemoteTime(deadline);
  if (redirectCount > MAX_REMOTE_REDIRECTS) {
    throw new IconImportError('The webpage image redirected too many times.');
  }
  const url = parseRemoteUrl(value);
  let response: RemoteResponse;
  try {
    response = await requestRemoteImage(url, deadline);
  } catch (error) {
    if (error instanceof IconImportError) throw error;
    throw new IconImportError('The webpage image could not be downloaded.');
  }
  if (response.redirect) {
    return downloadRemoteImage(
      new URL(response.redirect, url).toString(),
      redirectCount + 1,
      deadline,
    );
  }
  if (!response.bytes || !response.contentType) {
    throw new IconImportError('The webpage image could not be downloaded.');
  }
  return { bytes: response.bytes, contentType: response.contentType, url };
}

export async function importConfiguredIconFromUrl(value: string) {
  if (activeRemoteImports >= MAX_CONCURRENT_REMOTE_IMPORTS) {
    throw new IconImportError(
      'Another webpage image is already being imported. Try again shortly.',
    );
  }
  activeRemoteImports += 1;
  try {
    const response = await downloadRemoteImage(value);
    return await importConfiguredIconFromBytes(
      response.bytes,
      path.basename(response.url.pathname) || 'web-image',
      response.contentType,
    );
  } finally {
    activeRemoteImports -= 1;
  }
}
