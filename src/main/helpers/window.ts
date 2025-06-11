import path from 'path';
import { app, BrowserWindow } from 'electron';
import { resolveHtmlPath } from '../util';

export const createWindow = async (
  url: string,
  options: Partial<{
    width: number;
    height: number;
    icon: string;
    fullscreen: boolean;
  }> = {},
): Promise<BrowserWindow> => {
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
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
    ...options,
  });

  browserWindow.loadURL(resolveHtmlPath(url));

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
