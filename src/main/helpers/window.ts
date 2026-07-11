import path from 'path';
import { app, BrowserWindow } from 'electron';
import type { Event as ElectronEvent } from 'electron';
import { resolveHtmlPath } from '../util';

function normalizeAllowedNavigationUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value;
  }
}

export function restrictWindowNavigation(
  browserWindow: BrowserWindow,
  allowedUrl: string,
) {
  const normalizedAllowedUrl = normalizeAllowedNavigationUrl(allowedUrl);
  const preventUnexpectedNavigation = (
    event: ElectronEvent,
    navigationUrl: string,
  ) => {
    if (normalizeAllowedNavigationUrl(navigationUrl) !== normalizedAllowedUrl) {
      event.preventDefault();
    }
  };
  browserWindow.webContents.on('will-navigate', preventUnexpectedNavigation);
  browserWindow.webContents.on('will-redirect', preventUnexpectedNavigation);
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

export const createWindow = async (
  url: string,
  options: Partial<{
    width: number;
    height: number;
    icon: string;
    fullscreen: boolean;
    withPreload: boolean;
  }> = {},
): Promise<BrowserWindow> => {
  const { withPreload = false, ...windowOptions } = options;
  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  const browserWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(withPreload
        ? {
            preload: app.isPackaged
              ? path.join(__dirname, 'preload.js')
              : path.join(__dirname, '../../.erb/dll/preload.js'),
          }
        : {}),
    },
    ...windowOptions,
  });

  const windowUrl = resolveHtmlPath(url);
  if (withPreload) restrictWindowNavigation(browserWindow, windowUrl);
  browserWindow.loadURL(windowUrl);

  browserWindow.on('ready-to-show', () => {
    if (!browserWindow) {
      throw new Error('"Window" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      browserWindow.minimize();
    } else {
      browserWindow.show();
    }
  });

  return browserWindow;
};
