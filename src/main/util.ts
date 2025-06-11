import { screen } from 'electron';
import { URL } from 'url';
import path from 'path';
import { WindowSizeAlias, WindowSizeProp } from './types';

export function resolveHtmlPath(htmlFileName: string) {
  if (htmlFileName.startsWith('http')) {
    return htmlFileName;
  }
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    const [pathname, search] = htmlFileName.split('?');
    url.pathname = pathname;
    url.search = search;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

export function getScreenSize() {
  try {
    return screen.getPrimaryDisplay().workAreaSize;
  } catch (error) {
    return {
      width: 960,
      height: 540,
    };
  }
}

export function calculateWindowSize(size?: WindowSizeProp) {
  if (typeof size === 'object') {
    return size;
  }
  const screenSize = getScreenSize();
  if (size === WindowSizeAlias.FULLSCREEN) {
    return screenSize;
  }
  if (size === WindowSizeAlias.MAXIMIZED) {
    return {
      width: screenSize.width / 2,
      height: screenSize.height / 2,
      fullscreen: true,
    };
  }
  if (size === WindowSizeAlias.MINIMIZED) {
    return screenSize;
  }
  if (size === WindowSizeAlias.LEFT) {
    return {
      width: screenSize.width / 2,
      height: screenSize.height,
      x: 0,
      y: 0,
    };
  }
  if (size === WindowSizeAlias.RIGHT) {
    return {
      width: screenSize.width / 2,
      height: screenSize.height,
      x: screenSize.width / 2,
      y: 0,
    };
  }
  if (size === WindowSizeAlias.TOP) {
    return {
      width: screenSize.width,
      height: screenSize.height / 2,
      x: 0,
      y: 0,
    };
  }
  if (size === WindowSizeAlias.BOTTOM) {
    return {
      width: screenSize.width,
      height: screenSize.height / 2,
      x: 0,
      y: screenSize.height / 2,
    };
  }
  return screenSize;
}
