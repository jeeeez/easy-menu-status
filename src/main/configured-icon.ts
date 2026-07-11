import { lstat, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { app, nativeImage, NativeImage } from 'electron';

export const CONFIGURED_ICON_EXTENSIONS = [
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.icns',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.avif',
];

export const DEFAULT_CONFIGURED_ICON_NAME = 'cat';
const MAX_PERSISTENT_ICON_PREVIEW_BYTES = 5 * 1024 * 1024;

let persistentIconDirectoryPromise: Promise<string> | null = null;

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const characterCode = character.charCodeAt(0);
    return characterCode <= 31 || characterCode === 127;
  });
}

export function getBundledIconDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'icons')
    : path.join(app.getAppPath(), 'assets', 'icons');
}

export async function getPersistentIconDirectory() {
  if (!persistentIconDirectoryPromise) {
    const directory = path.join(
      app.getPath('appData'),
      'easy-menu-status',
      'icons',
    );
    persistentIconDirectoryPromise = mkdir(directory, {
      recursive: true,
      mode: 0o700,
    })
      .then(() => directory)
      .catch((error) => {
        persistentIconDirectoryPromise = null;
        throw error;
      });
  }

  try {
    const directory = await persistentIconDirectoryPromise;
    const directoryStats = await lstat(directory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
      throw new Error('The persistent icon directory is invalid.');
    }
    return directory;
  } catch (error) {
    persistentIconDirectoryPromise = null;
    throw error;
  }
}

export function isPersistentIconFileName(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 255 ||
    value !== value.trim() ||
    value === '.' ||
    value === '..' ||
    value.startsWith('.') ||
    value.includes('\0') ||
    value.includes('/') ||
    value.includes('\\') ||
    hasControlCharacter(value) ||
    path.basename(value) !== value
  ) {
    return false;
  }

  return CONFIGURED_ICON_EXTENSIONS.includes(path.extname(value).toLowerCase());
}

async function getPersistentIconPath(fileName: string) {
  if (!isPersistentIconFileName(fileName)) {
    throw new Error('The persistent icon filename is invalid.');
  }

  const directory = path.resolve(await getPersistentIconDirectory());
  const candidate = path.resolve(directory, fileName);
  const relativePath = path.relative(directory, candidate);
  if (
    path.dirname(candidate) !== directory ||
    relativePath !== fileName ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('The persistent icon path is invalid.');
  }
  return candidate;
}

export async function listPersistentIcons() {
  const directory = await getPersistentIconDirectory();
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isPersistentIconFileName(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    );
}

export async function deletePersistentIcon(fileName: string) {
  const iconPath = await getPersistentIconPath(fileName);
  try {
    const iconStats = await lstat(iconPath);
    if (!iconStats.isFile() || iconStats.isSymbolicLink()) {
      throw new Error('The persistent icon is not a regular file.');
    }
    await unlink(iconPath);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return false;
    throw error;
  }
}

async function loadIconFromPath(
  iconPath: string,
  size: { width: number; height: number },
) {
  try {
    const image = await nativeImage.createThumbnailFromPath(iconPath, size);
    return image.isEmpty() ? undefined : image;
  } catch {
    return undefined;
  }
}

export async function loadPersistentIcon(
  fileName: string,
  size: { width: number; height: number },
) {
  try {
    const iconPath = await getPersistentIconPath(fileName);
    const iconStats = await lstat(iconPath);
    if (
      !iconStats.isFile() ||
      iconStats.isSymbolicLink() ||
      iconStats.size > MAX_PERSISTENT_ICON_PREVIEW_BYTES
    ) {
      return undefined;
    }
    return loadIconFromPath(iconPath, size);
  } catch {
    return undefined;
  }
}

export function loadBundledDefaultIcon(size: {
  width: number;
  height: number;
}) {
  return loadIconFromPath(
    path.join(getBundledIconDirectory(), `${DEFAULT_CONFIGURED_ICON_NAME}.svg`),
    size,
  );
}

function expandHomeDirectory(icon: string) {
  if (icon === '~') return homedir();
  if (icon.startsWith('~/')) return path.join(homedir(), icon.slice(2));
  return icon;
}

function getIconPathCandidates(iconPath: string) {
  const extension = path.extname(iconPath).toLowerCase();
  if (CONFIGURED_ICON_EXTENSIONS.includes(extension)) return [iconPath];

  return [
    iconPath,
    ...CONFIGURED_ICON_EXTENSIONS.map((suffix) => `${iconPath}${suffix}`),
  ];
}

async function isFile(filePath: string) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function resolveConfiguredIconPath(icon: string) {
  const configuredIcon = icon?.trim();
  if (!configuredIcon) return undefined;

  const expandedIcon = expandHomeDirectory(configuredIcon);
  let iconPaths: string[];
  if (path.isAbsolute(expandedIcon)) {
    iconPaths = [expandedIcon];
  } else {
    iconPaths = [path.join(getBundledIconDirectory(), expandedIcon)];
    try {
      const persistentIconDirectory = await getPersistentIconDirectory();
      const legacyIconDirectory = path.join(app.getPath('userData'), 'icons');
      if (legacyIconDirectory !== persistentIconDirectory) {
        iconPaths.unshift(path.join(legacyIconDirectory, expandedIcon));
      }
      iconPaths.unshift(path.join(persistentIconDirectory, expandedIcon));
    } catch {
      // Bundled icons should remain available if the user directory is read-only.
    }
  }

  const candidates = iconPaths.flatMap((iconPath) =>
    getIconPathCandidates(iconPath),
  );
  const candidateMatches = await Promise.all(candidates.map(isFile));
  return candidates.find((_candidate, index) => candidateMatches[index]);
}

export async function loadConfiguredIcon(
  icon: string,
  size: { width: number; height: number },
): Promise<NativeImage | undefined> {
  try {
    const iconPath = await resolveConfiguredIconPath(icon);
    if (!iconPath) return undefined;

    return loadIconFromPath(iconPath, size);
  } catch {
    return undefined;
  }
}
