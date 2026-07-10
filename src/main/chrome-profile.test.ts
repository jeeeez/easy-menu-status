import { homedir } from 'node:os';

const mockSpawn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('node:child_process', () => ({
  spawn: mockSpawn,
}));

jest.mock('./utils/Logger', () => ({
  Logger: {
    info: jest.fn(),
    error: mockLoggerError,
  },
}));

// Jest must install the process and logger mocks before loading this module.
// eslint-disable-next-line import/first
import {
  DEFAULT_CHROME_PATH,
  domainMatches,
  normalizeHttpUrl,
  normalizeInputUrl,
  openChromeProfileUrl,
  resolveChromeProfile,
} from './chrome-profile';

describe('Chrome profile target normalization', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockLoggerError.mockReset();
  });

  it('converts an absolute file path into a file URL', () => {
    expect(
      normalizeInputUrl('/Users/jeff.li/Documents/Release Notes.html'),
    ).toBe('file:///Users/jeff.li/Documents/Release%20Notes.html');
  });

  it('accepts an existing file URL', () => {
    expect(
      normalizeInputUrl('file:///Users/jeff.li/Documents/Release%20Notes.html'),
    ).toBe('file:///Users/jeff.li/Documents/Release%20Notes.html');
  });

  it('expands a home-relative file path', () => {
    expect(normalizeInputUrl('~/Documents/Release Notes.html')).toBe(
      `file://${homedir()}/Documents/Release%20Notes.html`,
    );
  });

  it('normalizes web URLs and rejects unsupported protocols', () => {
    expect(normalizeInputUrl('example.com/docs')).toBe(
      'https://example.com/docs',
    );
    expect(normalizeHttpUrl('https://example.com')).toBe(
      'https://example.com/',
    );
    expect(() => normalizeHttpUrl('ftp://example.com/file')).toThrow(
      'Unsupported URL protocol: ftp:',
    );
  });

  it('matches exact and wildcard domains without matching partial domains', () => {
    expect(domainMatches('APP.RINGCENTRAL.COM', '*.ringcentral.com')).toBe(
      true,
    );
    expect(domainMatches('ringcentral.com', '*.ringcentral.com')).toBe(true);
    expect(domainMatches('notringcentral.com', '*.ringcentral.com')).toBe(
      false,
    );
    expect(domainMatches('example.com', 'example.com')).toBe(true);
  });

  it('uses the default profile when the target has no domain', () => {
    expect(
      resolveChromeProfile('', {
        defaultProfile: 'Profile 9',
        profiles: [{ domains: ['*.ringcentral.com'], profile: 'Profile 11' }],
      }),
    ).toBe('Profile 9');
  });

  it('opens a local file in Chrome with the default profile', () => {
    const on = jest.fn();
    const unref = jest.fn();
    mockSpawn.mockReturnValue({ on, unref });

    const result = openChromeProfileUrl(
      '/Users/jeff.li/Documents/Release Notes.html',
      { defaultProfile: 'Profile 9' },
      'System file',
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      DEFAULT_CHROME_PATH,
      [
        '--profile-directory=Profile 9',
        'file:///Users/jeff.li/Documents/Release%20Notes.html',
      ],
      { detached: true, stdio: 'ignore' },
    );
    expect(unref).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      url: 'file:///Users/jeff.li/Documents/Release%20Notes.html',
      hostname: '',
      profile: 'Profile 9',
    });

    const errorListener = on.mock.calls.find(
      ([eventName]) => eventName === 'error',
    )?.[1];
    errorListener(new Error('Chrome unavailable'));
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Open Chrome failed: Chrome unavailable',
    );
  });

  it('uses a domain-specific profile for web URLs', () => {
    mockSpawn.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

    expect(
      openChromeProfileUrl(
        'app.ringcentral.com',
        {
          defaultProfile: 'Profile 9',
          profiles: [{ domains: ['*.ringcentral.com'], profile: 'Profile 11' }],
        },
        'System link',
      ).profile,
    ).toBe('Profile 11');
  });

  it('rejects a local file when no Chrome profile is configured', () => {
    expect(() =>
      openChromeProfileUrl(
        '/Users/jeff.li/Documents/test.html',
        {},
        'System file',
      ),
    ).toThrow('No Chrome profile configured for local files');
  });
});
