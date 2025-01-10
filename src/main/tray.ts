import {
  app,
  Menu,
  Tray,
  nativeImage,
  MenuItemConstructorOptions,
} from 'electron';
import { execSync } from 'node:child_process';
import { spawn } from 'child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// import { TrayMenuWindow } from './windows/tray-menu-window';

function pbcopy(data: string) {
  const proc = spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
}

interface TrayMenuConfig {
  title: string;
  description: string;
  menus: {
    label: string;
    command: string;
    maxValueLength?: number;
    updateWhenClicking?: boolean;
  }[];
}

export class TrayController {
  static PATH = resolve(process.env.HOME ?? '', 'tray-menu.config.json');
  // eslint-disable-next-line no-use-before-define
  private static $instance: TrayController | null = null;
  static instance(): TrayController {
    if (!TrayController.$instance) {
      TrayController.$instance = new TrayController();
    }
    return TrayController.$instance;
  }
  tray: Tray | null = null;

  constructor() {
    app
      .whenReady()
      .then(() => {
        this.tray = new Tray(nativeImage.createEmpty());
        const trayMenu = this.loadTrayMenu();
        this.tray.setTitle(trayMenu.title);
        this.tray.setToolTip(trayMenu.description);
        this.tray.on('click', () => {
          this.updateValues();
        });
        this.updateValues();
      })
      .catch(() => undefined);
  }

  updateValues() {
    try {
      const trayMenu = this.loadTrayMenu();
      this.tray?.setTitle(trayMenu.title);
      this.tray?.setToolTip(trayMenu.description);
      const menus: MenuItemConstructorOptions[] = trayMenu.menus.map((item) => {
        const value = this.getOutputFromCommand(item.command);
        const maxValueLength = item.maxValueLength || 50;
        const valueInLabel =
          value.length > maxValueLength
            ? value.slice(0, maxValueLength)
            : value;
        return {
          label: `${item.label}: ${valueInLabel}`,
          type: 'normal',
          click: () => {
            this.updateValues();
            const newValue = item.updateWhenClicking
              ? this.getOutputFromCommand(item.command)
              : value;
            pbcopy(newValue);
          },
        };
      });
      menus.push({
        label: 'Edit',
        type: 'normal',
        click: async () => {
          execSync(`open ${TrayController.PATH}`);
          // await TrayMenuWindow.instance().init();
          // TrayMenuWindow.instance().window?.webContents.executeJavaScript(
          //   `window.config = ${JSON.stringify(trayMenu)};
          //    window.forceUpdate();
          //   `,
          // );
        },
      });
      this.tray?.setContextMenu(Menu.buildFromTemplate(menus));
    } catch (error) {
      console.error(error);
    }
  }

  loadTrayMenu(): TrayMenuConfig {
    try {
      const trayMenu = JSON.parse(readFileSync(TrayController.PATH, 'utf-8'));
      trayMenu.title = trayMenu.title || 'Code';
      trayMenu.description = trayMenu.description || 'Click to copy.';
      trayMenu.menus = trayMenu.menus || [];
      return trayMenu;
    } catch (error) {
      return {
        title: 'Code',
        description: 'Click to copy.',
        menus: [],
      };
    }
  }

  getOutputFromCommand(command: string): string {
    try {
      return execSync(command).toString().trim();
    } catch (error: any) {
      return error.message;
    }
  }
}
