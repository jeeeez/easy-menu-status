export interface BrowserProfileConfig {
  id: string;
  name: string;
  profileDirectory: string;
  path: string;
  [key: string]: unknown;
}

export interface DomainProfileConfig {
  domains: string[];
  profileId: string;
  [key: string]: unknown;
}

export interface OpenInBrowserConfig {
  interceptSystemLinks?: boolean;
  registerAsDefaultBrowser?: boolean;
  profiles?: BrowserProfileConfig[];
  domainProfiles?: DomainProfileConfig[];
  defaultProfileId?: string;
  [key: string]: unknown;
}

export function isBrowserUrlInput(input: string) {
  const value = input.trim();
  if (!value || /\s/.test(value)) {
    return false;
  }

  if (/^(?:~\/|\/)/.test(value)) {
    return true;
  }

  const hasSupportedProtocol = /^(?:https?|file):\/\//i.test(value);
  if (!hasSupportedProtocol && value.includes('@')) {
    return false;
  }

  try {
    const parsedUrl = new URL(
      hasSupportedProtocol ? value : `https://${value}`,
    );
    if (!['http:', 'https:', 'file:'].includes(parsedUrl.protocol)) {
      return false;
    }
    if (parsedUrl.protocol === 'file:') {
      return Boolean(parsedUrl.pathname);
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hasSupportedProtocol) {
      return Boolean(hostname);
    }
    return (
      hostname === 'localhost' ||
      hostname.includes('.') ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}
