import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from './utils/Logger';

export interface ChromeProfileMapping {
  domains: string[];
  profile: string;
}

export interface ChromeProfileRoutingConfig {
  chromePath?: string;
  defaultProfile?: string;
  profiles?: ChromeProfileMapping[];
}

export const DEFAULT_CHROME_PATH =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function normalizeHttpUrl(url: string) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
  }
  return parsedUrl.toString();
}

export function normalizeInputUrl(input: string) {
  const trimmedInput = input.trim();
  const filePath = trimmedInput.startsWith('~/')
    ? path.join(homedir(), trimmedInput.slice(2))
    : trimmedInput;

  if (path.isAbsolute(filePath)) {
    return pathToFileURL(filePath).toString();
  }

  const url = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmedInput)
    ? trimmedInput
    : `https://${trimmedInput}`;

  if (new URL(url).protocol === 'file:') {
    return new URL(url).toString();
  }

  return normalizeHttpUrl(url);
}

export function domainMatches(hostname: string, pattern: string) {
  const host = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase().trim();

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === normalizedPattern;
}

export function resolveChromeProfile(
  hostname: string,
  config: ChromeProfileRoutingConfig,
) {
  const matchedProfile = config.profiles?.find((profileMapping) =>
    profileMapping.domains.some((domain) => domainMatches(hostname, domain)),
  );
  return (
    matchedProfile?.profile ||
    config.defaultProfile ||
    config.profiles?.[0]?.profile
  );
}

export function openChromeProfileUrl(
  input: string,
  config: ChromeProfileRoutingConfig,
  sourceName: string,
) {
  const url = normalizeInputUrl(input);
  const { hostname } = new URL(url);
  const profile = resolveChromeProfile(hostname, config);

  if (!profile) {
    throw new Error(
      hostname
        ? `No Chrome profile matched ${hostname}`
        : 'No Chrome profile configured for local files',
    );
  }

  const chromePath = config.chromePath || DEFAULT_CHROME_PATH;
  Logger.info(
    `Chrome profile route '${sourceName}': ${hostname || 'local file'} -> ${profile}`,
  );
  const chromeProcess = spawn(
    chromePath,
    [`--profile-directory=${profile}`, url],
    {
      detached: true,
      stdio: 'ignore',
    },
  );
  chromeProcess.on('error', (error) => {
    Logger.error(`Open Chrome failed: ${error.message}`);
  });
  chromeProcess.unref();

  return {
    url,
    hostname,
    profile,
  };
}
