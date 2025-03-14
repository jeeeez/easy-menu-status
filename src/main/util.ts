import { screen } from 'electron';
import { URL } from 'url';
import path from 'path';

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
