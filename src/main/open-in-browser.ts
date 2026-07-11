import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserProfileConfig,
  OpenInBrowserConfig,
} from '../shared/browser-routing';
import { Logger } from './utils/Logger';

function normalizeHttpUrl(url: string) {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
  }
  return parsedUrl.toString();
}

function normalizeInputUrl(input: string) {
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

function domainMatches(hostname: string, pattern: string) {
  const host = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase().trim();

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }

  return host === normalizedPattern;
}

function expandHomePath(filePath: string) {
  return filePath.startsWith('~/')
    ? `${homedir()}/${filePath.slice(2)}`
    : filePath;
}

function findProfile(profiles: BrowserProfileConfig[], profileId: string) {
  const normalizedId = profileId.toLowerCase();
  return profiles.find((profile) => profile.id.toLowerCase() === normalizedId);
}

export function resolveBrowserProfile(
  hostname: string,
  config: OpenInBrowserConfig,
) {
  const profiles = config.profiles ?? [];
  const domainProfile = config.domainProfiles?.find((rule) =>
    rule.domains.some((domain) => domainMatches(hostname, domain)),
  );
  const profileId =
    domainProfile?.profileId || config.defaultProfileId || profiles[0]?.id;

  if (!profileId) {
    throw new Error('No browser profile configured');
  }

  const profile = findProfile(profiles, profileId);
  if (!profile) {
    throw new Error(`Browser profile '${profileId}' is not configured`);
  }
  if (!profile.path.trim()) {
    throw new Error(`Browser path is missing for profile '${profile.name}'`);
  }
  if (!profile.profileDirectory.trim()) {
    throw new Error(
      `Profile directory is missing for browser profile '${profile.name}'`,
    );
  }

  return profile;
}

export function openUrlInBrowser(
  input: string,
  config: OpenInBrowserConfig,
  sourceName: string,
) {
  const url = normalizeInputUrl(input);
  const { hostname } = new URL(url);
  const profile = resolveBrowserProfile(hostname, config);
  const browserPath = expandHomePath(profile.path.trim());
  const profileDirectory = profile.profileDirectory.trim();

  Logger.info(
    `Browser route '${sourceName}': ${hostname || 'local file'} -> ${profile.name} (${profileDirectory})`,
  );
  const browserProcess = spawn(
    browserPath,
    [`--profile-directory=${profileDirectory}`, url],
    {
      detached: true,
      stdio: 'ignore',
    },
  );
  browserProcess.on('error', (error) => {
    Logger.error(`Open browser failed: ${error.message}`);
  });
  browserProcess.unref();

  return {
    url,
    hostname,
    profileId: profile.id,
    profile: profile.name,
    profileDirectory,
    path: browserPath,
  };
}
