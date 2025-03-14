import { BrowserWindow } from 'electron';
import { createWindow } from '../helpers/window';
import { getScreenSize } from '../util';

export class WindowInstance {
  window: BrowserWindow | null = null;
  private $initPromise: Promise<BrowserWindow> | null = null;

  async init(url: string) {
    if (!this.$initPromise) {
      this.$initPromise = createWindow(url, {
        ...getScreenSize(),
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
