import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { open, unlink, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';
import { clipboard, nativeImage, NativeImage, ClipboardItem } from 'electron';
import { SETTINGS_ICON_MAX_INPUT_BYTES } from '../shared/icon-import';
import {
  CONFIGURED_ICON_EXTENSIONS,
  getPersistentIconDirectory,
} from './configured-icon';

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_EDGE = 8192;
const MAX_SOURCE_PIXELS = 16 * 1024 * 1024;
const MAX_OUTPUT_EDGE = 512;
const MAX_SVG_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_SVG_NESTING_DEPTH = 256;
const MAX_SVG_ELEMENTS = 4096;
const MAX_SVG_TOTAL_ATTRIBUTES = 16_384;
const MAX_SVG_ATTRIBUTES_PER_ELEMENT = 128;
const MAX_SVG_ATTRIBUTE_VALUE_CHARS = 64 * 1024;
const MAX_SVG_PATH_DATA_CHARS = 512 * 1024;
const MAX_SVG_COORDINATE = 1_000_000;
const MIN_SVG_DIMENSION = 0.001;
const MAX_REMOTE_REDIRECTS = 3;
const REMOTE_TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_REMOTE_IMPORTS = 2;
const MAX_CONCURRENT_IMAGE_DECODES = 2;
const SVG_CLIPBOARD_FORMATS = new Set([
  'image/svg+xml',
  'public.svg',
  'public.svg-image',
]);
const FORBIDDEN_SVG_ELEMENTS = new Set([
  'animate',
  'animatecolor',
  'animatemotion',
  'animatetransform',
  'audio',
  'base',
  'canvas',
  'discard',
  'embed',
  'foreignobject',
  'handler',
  'iframe',
  'link',
  'listener',
  'meta',
  'object',
  'pattern',
  'script',
  'set',
  'style',
  'use',
  'video',
]);

let activeRemoteImports = 0;
let activeImageDecodes = 0;

const REMOTE_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/svg+xml': ['.svg'],
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

interface SvgAttribute {
  name: string;
  value: string;
}

interface ParsedSvgTag {
  attributes: SvgAttribute[];
  closing: boolean;
  name: string;
  selfClosing: boolean;
}

interface SanitizedSvg {
  bytes: Buffer;
  size: { width: number; height: number };
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

function invalidSvg(
  message = 'The selected file is not a valid SVG image.',
): never {
  throw new IconImportError(message);
}

function hasInvalidXmlControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const characterCode = character.charCodeAt(0);
    return (
      (characterCode <= 31 && ![9, 10, 13].includes(characterCode)) ||
      characterCode === 127
    );
  });
}

function stripSvgComments(source: string) {
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<!--', cursor);
    if (start < 0) {
      parts.push(source.slice(cursor));
      cursor = source.length;
    } else {
      const end = source.indexOf('-->', start + 4);
      if (end < 0 || source.slice(start + 4, end).includes('--')) {
        invalidSvg();
      }
      parts.push(source.slice(cursor, start), ' ');
      cursor = end + 3;
    }
  }
  const stripped = parts.join('');
  if (stripped.includes('-->')) invalidSvg();
  return stripped;
}

function stripSvgDoctype(source: string) {
  const match = /<!doctype\b/i.exec(source);
  if (!match) return source;

  let quote = '';
  let end = -1;
  let cursor = match.index + match[0].length;
  while (cursor < source.length && end < 0) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[') {
      invalidSvg('SVG files with embedded declarations are not supported.');
    } else if (character === '>') {
      end = cursor;
    }
    cursor += 1;
  }
  if (end < 0) invalidSvg();

  const stripped = `${source.slice(0, match.index)} ${source.slice(end + 1)}`;
  if (/<!doctype\b/i.test(stripped)) {
    invalidSvg('SVG files with multiple declarations are not supported.');
  }
  return stripped;
}

function prepareSvgMarkup(bytes: Buffer) {
  if (bytes.length > MAX_SVG_INPUT_BYTES) {
    invalidSvg('SVG images must be 2 MB or smaller.');
  }

  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    invalidSvg('SVG images must use UTF-8 text encoding.');
  }
  source = source.replace(/^\uFEFF/, '');
  if (hasInvalidXmlControlCharacter(source)) invalidSvg();

  source = stripSvgComments(source);
  if (/<!entity\b/i.test(source)) {
    invalidSvg('SVG files with entities are not supported.');
  }
  source = stripSvgDoctype(source);

  const xmlDeclaration = /^\s*<\?xml\b[^<>]*\?>/i.exec(source);
  if (xmlDeclaration) source = source.slice(xmlDeclaration[0].length);
  if (/<\?|\?>|<!|&/.test(source)) {
    invalidSvg(
      'SVG files with XML declarations or entities are not supported.',
    );
  }
  return source.trim();
}

function isXmlWhitespace(character: string) {
  return [' ', '\t', '\n', '\r'].includes(character);
}

function parseSvgAttributes(source: string) {
  const attributes: SvgAttribute[] = [];
  const names = new Set<string>();
  let cursor = 0;

  while (cursor < source.length) {
    while (cursor < source.length && isXmlWhitespace(source[cursor])) {
      cursor += 1;
    }
    if (cursor >= source.length) break;

    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(source.slice(cursor));
    if (!nameMatch) invalidSvg();
    const name = nameMatch[0];
    cursor += name.length;

    while (cursor < source.length && isXmlWhitespace(source[cursor])) {
      cursor += 1;
    }
    if (source[cursor] !== '=') invalidSvg();
    cursor += 1;
    while (cursor < source.length && isXmlWhitespace(source[cursor])) {
      cursor += 1;
    }

    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") invalidSvg();
    const valueStart = cursor + 1;
    const valueEnd = source.indexOf(quote, valueStart);
    if (valueEnd < 0) invalidSvg();
    const value = source.slice(valueStart, valueEnd);
    if (value.includes('<')) invalidSvg();

    const normalizedName = name.toLowerCase();
    const localName = normalizedName.split(':').at(-1) ?? normalizedName;
    const maxValueLength =
      localName === 'd'
        ? MAX_SVG_PATH_DATA_CHARS
        : MAX_SVG_ATTRIBUTE_VALUE_CHARS;
    if (value.length > maxValueLength) {
      invalidSvg('An SVG attribute is too large.');
    }
    if (names.has(normalizedName)) invalidSvg();
    names.add(normalizedName);
    attributes.push({ name, value });
    if (attributes.length > MAX_SVG_ATTRIBUTES_PER_ELEMENT) {
      invalidSvg('An SVG element has too many attributes.');
    }
    cursor = valueEnd + 1;
  }
  return attributes;
}

function findSvgTagEnd(source: string, start: number) {
  let quote = '';
  let cursor = start + 1;
  while (cursor < source.length) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '<') {
      invalidSvg();
    } else if (character === '>') {
      return cursor;
    }
    cursor += 1;
  }
  return invalidSvg();
}

function parseSvgTag(source: string, start: number, end: number): ParsedSvgTag {
  let body = source.slice(start + 1, end).trim();
  const closing = body.startsWith('/');
  if (closing) body = body.slice(1).trimStart();

  const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(body);
  if (!nameMatch) invalidSvg();
  const name = nameMatch[0];
  let remainder = body.slice(name.length).trim();
  if (closing) {
    if (remainder) invalidSvg();
    return { attributes: [], closing, name, selfClosing: false };
  }

  const selfClosing = remainder.endsWith('/');
  if (selfClosing) remainder = remainder.slice(0, -1).trimEnd();
  return {
    attributes: parseSvgAttributes(remainder),
    closing,
    name,
    selfClosing,
  };
}

function validateSvgAttribute(attribute: SvgAttribute) {
  const normalizedName = attribute.name.toLowerCase();
  const localName = normalizedName.split(':').at(-1) ?? normalizedName;
  const value = attribute.value.trim();

  if (localName.startsWith('on')) {
    invalidSvg('SVG event handler attributes are not supported.');
  }
  if (localName === 'style') {
    invalidSvg('Inline SVG style attributes are not supported.');
  }
  if (
    localName === 'srcset' ||
    normalizedName === 'xml:base' ||
    normalizedName.endsWith(':base')
  ) {
    invalidSvg(
      'SVG files with external resource attributes are not supported.',
    );
  }
  if (localName === 'href' || localName === 'src') {
    if (!/^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value)) {
      invalidSvg(
        'SVG files may only reference elements inside the same image.',
      );
    }
  }

  if (
    /\\|\/\*|\*\/|@import\b|expression\s*\(|image-set\s*\(|-moz-binding|behavior\s*:/i.test(
      value,
    )
  ) {
    invalidSvg('SVG files with active style content are not supported.');
  }
  const withoutLocalUrls = value.replace(
    /url\s*\(\s*(?:#[A-Za-z_][A-Za-z0-9_.:-]*|(["'])#[A-Za-z_][A-Za-z0-9_.:-]*\1)\s*\)/gi,
    '',
  );
  if (/url\s*\(/i.test(withoutLocalUrls)) {
    invalidSvg('SVG files may only reference elements inside the same image.');
  }

  const isNamespace =
    normalizedName === 'xmlns' || normalizedName.startsWith('xmlns:');
  if (
    !isNamespace &&
    (/(?:https?|file|ftp|data|javascript)\s*:/i.test(value) ||
      value.startsWith('//'))
  ) {
    invalidSvg('SVG files with external resources are not supported.');
  }
}

function validateSvgElement(name: string, attributes: SvgAttribute[]) {
  const localName = name.toLowerCase().split(':').at(-1) ?? name.toLowerCase();
  if (
    FORBIDDEN_SVG_ELEMENTS.has(localName) ||
    localName === 'filter' ||
    localName.startsWith('fe')
  ) {
    invalidSvg(
      'SVG scripts, animation, and embedded documents are not supported.',
    );
  }
  attributes.forEach(validateSvgAttribute);
}

function parseSvgNumber(value: string) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseSvgLength(value: string) {
  const match =
    /^((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|pt|pc|in|cm|mm|q)?$/i.exec(
      value.trim(),
    );
  if (!match) invalidSvg('The SVG width and height are invalid.');
  const unit = match[2]?.toLowerCase() ?? 'px';
  const scale = (
    {
      cm: 96 / 2.54,
      in: 96,
      mm: 96 / 25.4,
      pc: 16,
      pt: 96 / 72,
      px: 1,
      q: 96 / 101.6,
    } as Record<string, number>
  )[unit];
  const length = Number(match[1]) * scale;
  if (!Number.isFinite(length) || length <= 0) invalidSvg();
  return length;
}

function getSvgSize(attributes: SvgAttribute[]) {
  const values = new Map(
    attributes.map(({ name, value }) => [name.toLowerCase(), value]),
  );
  const viewBox = values.get('viewbox');
  if (viewBox !== undefined) {
    const parts = viewBox.trim().split(/[\s,]+/);
    const numbers = parts.map(parseSvgNumber);
    if (numbers.length !== 4 || numbers.some((value) => value === undefined)) {
      invalidSvg('The SVG viewBox is invalid.');
    }
    if (
      numbers.some((value) => Math.abs(value as number) > MAX_SVG_COORDINATE)
    ) {
      invalidSvg('The SVG viewBox is outside the supported range.');
    }
    const viewBoxWidth = numbers[2] as number;
    const viewBoxHeight = numbers[3] as number;
    if (viewBoxWidth < MIN_SVG_DIMENSION || viewBoxHeight < MIN_SVG_DIMENSION) {
      invalidSvg();
    }
    const viewBoxSize = { width: viewBoxWidth, height: viewBoxHeight };
    validateDimensions(viewBoxSize);
    return viewBoxSize;
  }

  const widthValue = values.get('width');
  const heightValue = values.get('height');
  const width =
    widthValue === undefined ? undefined : parseSvgLength(widthValue);
  const height =
    heightValue === undefined ? undefined : parseSvgLength(heightValue);
  if (width !== undefined && height !== undefined) {
    validateDimensions({ width, height });
    return { width, height };
  }
  return invalidSvg('SVG images must declare a width and height or a viewBox.');
}

function quoteSvgAttributeValue(value: string) {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return invalidSvg();
}

function normalizeSvgRootSize(
  source: string,
  size: { width: number; height: number },
) {
  const end = findSvgTagEnd(source, 0);
  const root = parseSvgTag(source, 0, end);
  const attributes = root.attributes.filter(
    ({ name }) => !['width', 'height'].includes(name.toLowerCase()),
  );
  attributes.push(
    { name: 'width', value: String(size.width) },
    { name: 'height', value: String(size.height) },
  );
  const serializedAttributes = attributes
    .map(({ name, value }) => `${name}=${quoteSvgAttributeValue(value)}`)
    .join(' ');
  return `<svg ${serializedAttributes}${root.selfClosing ? ' /' : ''}>${source.slice(end + 1)}`;
}

function parseAndValidateSvg(source: string) {
  const stack: string[] = [];
  let cursor = 0;
  let elementCount = 0;
  let attributeCount = 0;
  let rootAttributes: SvgAttribute[] | undefined;
  let rootClosed = false;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    const textEnd = start < 0 ? source.length : start;
    if (!stack.length && source.slice(cursor, textEnd).trim()) invalidSvg();
    if (start < 0) {
      cursor = source.length;
    } else {
      const end = findSvgTagEnd(source, start);
      const tag = parseSvgTag(source, start, end);
      if (tag.closing) {
        if (stack.at(-1) !== tag.name) invalidSvg();
        stack.pop();
        if (!stack.length) rootClosed = true;
      } else {
        if (rootClosed) invalidSvg();
        elementCount += 1;
        attributeCount += tag.attributes.length;
        if (
          elementCount > MAX_SVG_ELEMENTS ||
          attributeCount > MAX_SVG_TOTAL_ATTRIBUTES
        ) {
          invalidSvg('The SVG image is too complex.');
        }
        if (!stack.length) {
          if (tag.name !== 'svg' || rootAttributes) invalidSvg();
          rootAttributes = tag.attributes;
        }
        validateSvgElement(tag.name, tag.attributes);
        if (!tag.selfClosing) {
          stack.push(tag.name);
          if (stack.length > MAX_SVG_NESTING_DEPTH) {
            invalidSvg('The SVG image is nested too deeply.');
          }
        } else if (!stack.length) {
          rootClosed = true;
        }
      }
      cursor = end + 1;
    }
  }
  if (!rootAttributes || !rootClosed || stack.length) invalidSvg();
  return getSvgSize(rootAttributes);
}

function sanitizeSvg(bytes: Buffer): SanitizedSvg {
  const source = prepareSvgMarkup(bytes);
  const size = parseAndValidateSvg(source);
  const normalizedSource = normalizeSvgRootSize(source, size);
  return { bytes: Buffer.from(normalizedSource, 'utf8'), size };
}

function isPotentialSvg(bytes: Buffer) {
  const prefix = bytes
    .subarray(0, Math.min(bytes.length, 64 * 1024))
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  return (
    prefix.startsWith('<svg') ||
    prefix.startsWith('<?xml') ||
    prefix.startsWith('<!--') ||
    prefix.startsWith('<!doctype')
  );
}

function getImageExtension(bytes: Buffer) {
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
  if (isPotentialSvg(bytes)) return '.svg';
  return undefined;
}

function canonicalImageExtension(extension: string) {
  if (extension === '.jpeg') return '.jpg';
  if (extension === '.tif') return '.tiff';
  if (extension === '.heif') return '.heic';
  return extension;
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

async function decodeBytes(
  bytes: Buffer,
  extension: string,
  knownSize?: { width: number; height: number },
) {
  if (activeImageDecodes >= MAX_CONCURRENT_IMAGE_DECODES) {
    throw new IconImportError(
      'Another image is already being processed. Try again shortly.',
    );
  }
  activeImageDecodes += 1;
  try {
    const encodedSize = knownSize ?? getEncodedDimensions(bytes, extension);
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
  } finally {
    activeImageDecodes -= 1;
  }
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
  const extension = canonicalImageExtension(imported.extension);
  const detectedExtension = getImageExtension(imported.bytes);
  if (
    detectedExtension &&
    canonicalImageExtension(detectedExtension) !== extension
  ) {
    throw new IconImportError(
      'The selected image contents do not match its file type.',
    );
  }

  const svg = extension === '.svg' ? sanitizeSvg(imported.bytes) : undefined;
  const image = await decodeBytes(
    svg?.bytes ?? imported.bytes,
    extension,
    svg?.size,
  );
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
  const extension = getImageExtension(bytes);
  if (!extension) {
    throw new IconImportError(
      'Only SVG, PNG, JPEG, GIF, WebP, BMP, ICO, TIFF, HEIC, or AVIF image data is supported.',
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

function normalizeClipboardFormat(type: string) {
  const osFormat = /^electron application\/osclipboard;format="([^"]+)"$/i.exec(
    type,
  );
  return (osFormat?.[1] ?? type).toLowerCase();
}

async function readClipboardBytes(item: ClipboardItem, type: string) {
  let payload;
  try {
    payload = await item.getType(type);
  } catch {
    // A clipboard owner may withdraw a representation while it is being read.
    return undefined;
  }
  if (!(payload instanceof Blob) || !payload.size) return undefined;
  ensureInputSize(payload.size);
  return Buffer.from(await payload.arrayBuffer());
}

function importFirstClipboardValue<T>(
  values: T[],
  importValue: (value: T) => Promise<string | undefined>,
) {
  // Import representations sequentially so only the first match is persisted.
  return values.reduce<Promise<string | undefined>>(async (previous, value) => {
    const imported = await previous;
    return imported ?? importValue(value);
  }, Promise.resolve(undefined));
}

export async function importConfiguredIconFromClipboard() {
  const items = await clipboard.read();
  const formats = items.flatMap((item) =>
    item.types.map((type) => ({
      item,
      type,
      format: normalizeClipboardFormat(type),
    })),
  );
  const rasterFormats = formats.filter(
    ({ format }) =>
      format.startsWith('image/') &&
      format !== 'image/svg+xml' &&
      REMOTE_MIME_EXTENSIONS[format],
  );
  const rasterIcon = await importFirstClipboardValue(
    rasterFormats,
    async ({ item, type, format }) => {
      const bytes = await readClipboardBytes(item, type);
      return bytes
        ? importConfiguredIconFromBytes(bytes, 'clipboard-icon', format)
        : undefined;
    },
  );
  if (rasterIcon) return rasterIcon;

  const fileUrlFormats = formats.filter(
    ({ format }) => format === 'text/uri-list' || format === 'public.file-url',
  );
  const fileIcon = await importFirstClipboardValue(
    fileUrlFormats,
    async ({ item, type }) => {
      const bytes = await readClipboardBytes(item, type);
      if (!bytes) return undefined;
      const fileUrls = bytes
        .toString('utf8')
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => value && !value.startsWith('#'));
      return importFirstClipboardValue(fileUrls, async (fileUrl) => {
        try {
          const sourcePath = fileURLToPath(new URL(fileUrl));
          if (
            CONFIGURED_ICON_EXTENSIONS.includes(
              path.extname(sourcePath).toLowerCase(),
            )
          ) {
            return await importConfiguredIconFromPath(sourcePath);
          }
        } catch {
          // Other clipboard representations may still contain the image.
        }
        return undefined;
      });
    },
  );
  if (fileIcon) return fileIcon;

  const svgFormats = formats.filter(({ format }) =>
    SVG_CLIPBOARD_FORMATS.has(format),
  );
  const svgIcon = await importFirstClipboardValue(
    svgFormats,
    async ({ item, type }) => {
      const bytes = await readClipboardBytes(item, type);
      return bytes
        ? importConfiguredIconFromBytes(
            bytes,
            'clipboard-icon.svg',
            'image/svg+xml',
          )
        : undefined;
    },
  );
  if (svgIcon) return svgIcon;

  const textFormats = formats.filter(({ format }) => format === 'text/plain');
  const textIcon = await importFirstClipboardValue(
    textFormats,
    async ({ item, type }) => {
      const bytes = await readClipboardBytes(item, type);
      return bytes && isPotentialSvg(bytes)
        ? importConfiguredIconFromBytes(
            bytes,
            'clipboard-icon.svg',
            'image/svg+xml',
          )
        : undefined;
    },
  );
  if (textIcon) return textIcon;
  throw new IconImportError('The clipboard does not contain an image.');
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
            'image/svg+xml,image/png,image/jpeg,image/gif,image/webp,image/bmp,image/x-icon,image/tiff,image/heic,image/heif,image/avif',
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
