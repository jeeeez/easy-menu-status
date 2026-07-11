import path from 'node:path';
import { execFile } from 'node:child_process';
import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { app, nativeImage, shell } from 'electron';

const APPLICATION_ROOTS = [
  path.join(homedir(), 'Applications'),
  '/Applications',
  '/System/Applications',
];
const MAX_SCAN_DEPTH = 3;
const INDEX_TTL = 5 * 60 * 1000;
const MAX_SEARCH_RESULTS = 10;

interface IndexedApplication {
  name: string;
  path: string;
}

const ADDITIONAL_APPLICATIONS: IndexedApplication[] = [
  {
    name: 'Finder',
    path: '/System/Library/CoreServices/Finder.app',
  },
];

export interface ApplicationSearchResult extends IndexedApplication {
  icon?: string;
  score: number;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function splitSearchWords(value: string) {
  return value.split(/[\s._:/-]+/).filter(Boolean);
}

function isSubsequence(query: string, value: string) {
  let queryIndex = 0;
  for (let valueIndex = 0; valueIndex < value.length; valueIndex += 1) {
    if (value[valueIndex] === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return true;
      }
    }
  }
  return false;
}

function getApplicationMatchScore(name: string, query: string) {
  const normalizedName = normalizeSearchText(name);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;
  if (normalizedName === normalizedQuery) return 990;
  if (normalizedName.startsWith(normalizedQuery)) return 860;

  const nameWords = splitSearchWords(normalizedName);
  if (nameWords.some((word) => word.startsWith(normalizedQuery))) return 820;

  const compactName = nameWords.join('');
  const compactQuery = splitSearchWords(normalizedQuery).join('');
  const initials = nameWords.map((word) => word[0]).join('');
  if (compactQuery.length > 1 && initials.startsWith(compactQuery)) return 780;
  if (normalizedName.includes(normalizedQuery)) return 620;
  if (compactName.includes(compactQuery)) return 580;
  if (compactQuery.length > 1 && isSubsequence(compactQuery, compactName)) {
    return 380;
  }
  return 0;
}

function getBundleIconName(infoPlistPath: string) {
  return new Promise<string>((resolve) => {
    execFile(
      '/usr/bin/plutil',
      ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', infoPlistPath],
      { encoding: 'utf8' },
      (error, stdout) => resolve(error ? '' : stdout.trim()),
    );
  });
}

async function scanApplicationDirectory(
  directory: string,
  depth = 0,
): Promise<IndexedApplication[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const nestedApplications = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith('.')) return [];

      const applicationPath = path.join(directory, entry.name);
      const isApplication =
        entry.name.toLowerCase().endsWith('.app') &&
        (entry.isDirectory() || entry.isSymbolicLink());
      if (isApplication) {
        return [
          {
            name: entry.name.slice(0, -'.app'.length),
            path: applicationPath,
          },
        ];
      }

      if (!entry.isDirectory() || depth >= MAX_SCAN_DEPTH) return [];
      return scanApplicationDirectory(applicationPath, depth + 1);
    }),
  );

  return nestedApplications.flat();
}

async function scanApplications() {
  const applicationsByRoot = await Promise.all(
    APPLICATION_ROOTS.map((root) => scanApplicationDirectory(root)),
  );
  const seenNames = new Set<string>();

  return applicationsByRoot
    .flat()
    .concat(ADDITIONAL_APPLICATIONS)
    .filter((application) => {
      const key = normalizeSearchText(application.name);
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export class ApplicationSearchService {
  private applications: IndexedApplication[] = [];
  private indexedAt = 0;
  private indexPromise: Promise<IndexedApplication[]> | null = null;
  private readonly iconCache = new Map<string, string | undefined>();

  warm() {
    return this.getApplications().then((applications) => applications.length);
  }

  private async getApplications() {
    const indexIsFresh =
      this.applications.length > 0 && Date.now() - this.indexedAt < INDEX_TTL;
    if (indexIsFresh) return this.applications;

    if (!this.indexPromise) {
      this.indexPromise = scanApplications()
        .then((applications) => {
          this.applications = applications;
          this.indexedAt = Date.now();
          return applications;
        })
        .finally(() => {
          this.indexPromise = null;
        });
    }
    return this.indexPromise;
  }

  private async getApplicationIcon(applicationPath: string) {
    if (this.iconCache.has(applicationPath)) {
      return this.iconCache.get(applicationPath);
    }

    let icon: string | undefined;
    try {
      const resolvedPath = await realpath(applicationPath);
      const iconName = await getBundleIconName(
        path.join(resolvedPath, 'Contents', 'Info.plist'),
      );
      const iconFileName =
        iconName && path.extname(iconName) ? iconName : `${iconName}.icns`;
      let applicationIcon = iconName
        ? await nativeImage.createThumbnailFromPath(
            path.join(resolvedPath, 'Contents', 'Resources', iconFileName),
            { width: 32, height: 32 },
          )
        : nativeImage.createEmpty();
      if (applicationIcon.isEmpty()) {
        applicationIcon = await app.getFileIcon(resolvedPath, {
          size: 'normal',
        });
      }
      if (!applicationIcon.isEmpty()) {
        icon = applicationIcon
          .resize({ width: 32, height: 32, quality: 'best' })
          .toDataURL();
      }
    } catch {
      icon = undefined;
    }
    this.iconCache.set(applicationPath, icon);
    return icon;
  }

  async search(
    query: string,
    limit: number,
  ): Promise<ApplicationSearchResult[]> {
    if (process.platform !== 'darwin' || !query.trim()) return [];

    const applications = await this.getApplications();
    const resultLimit = Math.min(
      MAX_SEARCH_RESULTS,
      Math.max(1, Math.floor(limit)),
    );
    const matches = applications
      .map((application) => ({
        ...application,
        score: getApplicationMatchScore(application.name, query),
      }))
      .filter((application) => application.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.name.localeCompare(right.name),
      )
      .slice(0, resultLimit);

    return Promise.all(
      matches.map(async (application) => ({
        ...application,
        icon: await this.getApplicationIcon(application.path),
      })),
    );
  }

  async open(applicationPath: string) {
    if (process.platform !== 'darwin') {
      throw new Error('Application search is only supported on macOS');
    }

    const applications = await this.getApplications();
    const application = applications.find(
      (candidate) => candidate.path === applicationPath,
    );
    if (!application) {
      throw new Error('Application is not in the EasyTray application index');
    }

    const openError = await shell.openPath(application.path);
    if (openError) throw new Error(openError);
    return application;
  }
}
