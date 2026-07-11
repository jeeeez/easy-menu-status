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
// App icons render at 34 CSS pixels, so keep a 2x bitmap for Retina displays.
const APPLICATION_ICON_PIXEL_SIZE = 68;

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

export interface TextMatchRange {
  start: number;
  end: number;
}

export interface ApplicationSearchResult extends IndexedApplication {
  icon?: string;
  matchRanges: TextMatchRange[];
  score: number;
}

interface NormalizedSearchUnit {
  character: string;
  sourceStart: number;
  sourceEnd: number;
}

interface NormalizedSearchProjection {
  text: string;
  units: NormalizedSearchUnit[];
}

interface LowercaseSourceSpan {
  normalizedStart: number;
  normalizedEnd: number;
  sourceStart: number;
  sourceEnd: number;
}

interface ApplicationMatch {
  matchRanges: TextMatchRange[];
  score: number;
}

const SEARCH_SEPARATOR_PATTERN = /[\s._:/-]/;

function lowercaseSearchUnits(units: NormalizedSearchUnit[]) {
  const sourceText = units.map(({ character }) => character).join('');
  const normalizedText = sourceText.toLowerCase();
  const spans: LowercaseSourceSpan[] = [];
  let sourcePrefix = '';
  let normalizedOffset = 0;
  units.forEach((unit) => {
    sourcePrefix += unit.character;
    const normalizedEnd = sourcePrefix.toLowerCase().length;
    spans.push({
      normalizedStart: normalizedOffset,
      normalizedEnd,
      sourceStart: unit.sourceStart,
      sourceEnd: unit.sourceEnd,
    });
    normalizedOffset = normalizedEnd;
  });

  const normalizedUnits: NormalizedSearchUnit[] = [];
  normalizedOffset = 0;
  Array.from(normalizedText).forEach((character) => {
    const normalizedEnd = normalizedOffset + character.length;
    const overlappingSpans = spans.filter(
      (span) =>
        span.normalizedEnd > normalizedOffset &&
        span.normalizedStart < normalizedEnd,
    );
    if (overlappingSpans.length) {
      normalizedUnits.push({
        character,
        sourceStart: Math.min(
          ...overlappingSpans.map(({ sourceStart }) => sourceStart),
        ),
        sourceEnd: Math.max(
          ...overlappingSpans.map(({ sourceEnd }) => sourceEnd),
        ),
      });
    }
    normalizedOffset = normalizedEnd;
  });
  return normalizedUnits;
}

function normalizeSearchProjection(value: string): NormalizedSearchProjection {
  const decomposedUnits: NormalizedSearchUnit[] = [];
  let sourceOffset = 0;
  Array.from(value).forEach((character) => {
    const sourceStart = sourceOffset;
    sourceOffset += character.length;
    const normalizedCharacters = Array.from(
      character.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''),
    );
    if (!normalizedCharacters.length && decomposedUnits.length > 0) {
      decomposedUnits[decomposedUnits.length - 1].sourceEnd = sourceOffset;
    }
    normalizedCharacters.forEach((normalizedCharacter) => {
      decomposedUnits.push({
        character: normalizedCharacter,
        sourceStart,
        sourceEnd: sourceOffset,
      });
    });
  });

  const units = lowercaseSearchUnits(decomposedUnits);

  let start = 0;
  let end = units.length;
  while (start < end && !units[start].character.trim()) start += 1;
  while (end > start && !units[end - 1].character.trim()) end -= 1;
  const trimmedUnits = units.slice(start, end);
  return {
    text: trimmedUnits.map(({ character }) => character).join(''),
    units: trimmedUnits,
  };
}

function normalizeSearchText(value: string) {
  return normalizeSearchProjection(value).text;
}

function splitProjectionWords(projection: NormalizedSearchProjection) {
  const words: NormalizedSearchUnit[][] = [];
  let currentWord: NormalizedSearchUnit[] = [];
  projection.units.forEach((unit) => {
    if (SEARCH_SEPARATOR_PATTERN.test(unit.character)) {
      if (currentWord.length) words.push(currentWord);
      currentWord = [];
    } else {
      currentWord.push(unit);
    }
  });
  if (currentWord.length) words.push(currentWord);
  return words;
}

function projectUnits(
  units: NormalizedSearchUnit[],
): NormalizedSearchProjection {
  return {
    text: units.map(({ character }) => character).join(''),
    units,
  };
}

function findContiguousUnitStart(
  valueUnits: NormalizedSearchUnit[],
  queryUnits: NormalizedSearchUnit[],
) {
  if (!queryUnits.length) return -1;
  let result = -1;
  for (
    let valueIndex = 0;
    valueIndex <= valueUnits.length - queryUnits.length && result < 0;
    valueIndex += 1
  ) {
    let matches = true;
    for (
      let queryIndex = 0;
      queryIndex < queryUnits.length && matches;
      queryIndex += 1
    ) {
      matches =
        valueUnits[valueIndex + queryIndex].character ===
        queryUnits[queryIndex].character;
    }
    if (matches) result = valueIndex;
  }
  return result;
}

function unitsToMatchRanges(units: NormalizedSearchUnit[]) {
  const ranges: TextMatchRange[] = [];
  [...units]
    .sort((left, right) => left.sourceStart - right.sourceStart)
    .forEach((unit) => {
      const previousRange = ranges.at(-1);
      if (!previousRange || unit.sourceStart > previousRange.end) {
        ranges.push({ start: unit.sourceStart, end: unit.sourceEnd });
      } else {
        previousRange.end = Math.max(previousRange.end, unit.sourceEnd);
      }
    });
  return ranges;
}

function createApplicationMatch(
  score: number,
  units: NormalizedSearchUnit[],
): ApplicationMatch {
  return { score, matchRanges: unitsToMatchRanges(units) };
}

function getApplicationMatch(name: string, query: string): ApplicationMatch {
  const nameProjection = normalizeSearchProjection(name);
  const queryProjection = normalizeSearchProjection(query);
  const normalizedName = nameProjection.text;
  const normalizedQuery = queryProjection.text;
  if (!normalizedQuery) return { score: 0, matchRanges: [] };
  if (normalizedName === normalizedQuery) {
    return createApplicationMatch(990, nameProjection.units);
  }
  if (
    findContiguousUnitStart(nameProjection.units, queryProjection.units) === 0
  ) {
    return createApplicationMatch(
      860,
      nameProjection.units.slice(0, queryProjection.units.length),
    );
  }

  const nameWords = splitProjectionWords(nameProjection);
  const matchingWord = nameWords.find(
    (word) => findContiguousUnitStart(word, queryProjection.units) === 0,
  );
  if (matchingWord) {
    return createApplicationMatch(
      820,
      matchingWord.slice(0, queryProjection.units.length),
    );
  }

  const compactNameProjection = projectUnits(nameWords.flat());
  const compactQueryProjection = projectUnits(
    splitProjectionWords(queryProjection).flat(),
  );
  const initialsProjection = projectUnits(nameWords.map((word) => word[0]));
  if (
    compactQueryProjection.text.length > 1 &&
    findContiguousUnitStart(
      initialsProjection.units,
      compactQueryProjection.units,
    ) === 0
  ) {
    return createApplicationMatch(
      780,
      initialsProjection.units.slice(0, compactQueryProjection.units.length),
    );
  }

  const nameContainsIndex = findContiguousUnitStart(
    nameProjection.units,
    queryProjection.units,
  );
  if (nameContainsIndex >= 0) {
    return createApplicationMatch(
      620,
      nameProjection.units.slice(
        nameContainsIndex,
        nameContainsIndex + queryProjection.units.length,
      ),
    );
  }

  const compactContainsIndex = findContiguousUnitStart(
    compactNameProjection.units,
    compactQueryProjection.units,
  );
  if (compactContainsIndex >= 0) {
    return createApplicationMatch(
      580,
      compactNameProjection.units.slice(
        compactContainsIndex,
        compactContainsIndex + compactQueryProjection.units.length,
      ),
    );
  }

  return { score: 0, matchRanges: [] };
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
            {
              width: APPLICATION_ICON_PIXEL_SIZE,
              height: APPLICATION_ICON_PIXEL_SIZE,
            },
          )
        : nativeImage.createEmpty();
      let iconScaleFactor = 1;
      if (applicationIcon.isEmpty()) {
        applicationIcon = await app.getFileIcon(resolvedPath, {
          size: 'normal',
        });
        if (applicationIcon.getScaleFactors().includes(2)) {
          iconScaleFactor = 2;
        }
      }
      if (!applicationIcon.isEmpty()) {
        icon = applicationIcon.toDataURL({ scaleFactor: iconScaleFactor });
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
      .map((application) => {
        const match = getApplicationMatch(application.name, query);
        return {
          ...application,
          score: match.score,
          matchRanges: match.matchRanges,
        };
      })
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
