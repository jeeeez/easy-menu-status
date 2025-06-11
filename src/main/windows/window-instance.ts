import { BrowserWindow } from 'electron';
import { createWindow } from '../helpers/window';
import { calculateWindowSize } from '../util';
import { WindowSizeAlias } from '../types';

export class WindowInstance {
  window: BrowserWindow | null = null;
  private $initPromise: Promise<BrowserWindow> | null = null;

  async init(url: string, size?: WindowSizeAlias) {
    if (!this.$initPromise) {
      this.$initPromise = createWindow(url, {
        ...calculateWindowSize(size),
      }).then((window) => {
        this.window = window;
        window.on('closed', () => {
          this.window = null;
          this.$initPromise = null;
        });
        return window;
      });
    }

    await this.$initPromise.then((window) => window.show());
    return this.window;
  }
}
