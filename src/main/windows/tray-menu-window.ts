import { BrowserWindow } from 'electron';
import { createWindow } from '../helpers/window';

export class TrayMenuWindow {
  // eslint-disable-next-line no-use-before-define
  private static $instance: TrayMenuWindow | null = null;
  static instance(): TrayMenuWindow {
    if (!TrayMenuWindow.$instance) {
      const window = new TrayMenuWindow();
      TrayMenuWindow.$instance = window;
    }
    return TrayMenuWindow.$instance;
  }

  window: BrowserWindow | null = null;
  private $initPromise: Promise<BrowserWindow> | null = null;

  async init() {
    if (!this.$initPromise) {
      this.$initPromise = createWindow('index.html?page=setting', {
        width: 500,
        height: 350,
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
