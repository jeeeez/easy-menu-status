import { app, Menu, Tray, nativeImage } from 'electron';
import { execSync } from 'node:child_process';
import { spawn } from 'child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TrayMenuWindow } from './windows/tray-menu-window';

function pbcopy(data: string) {
  const proc = spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
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
  count = 0;
  tray: Tray | null = null;

  constructor() {
    app
      .whenReady()
      .then(() => {
        this.tray = new Tray(nativeImage.createEmpty());
        this.tray.setTitle(`Code`);
        this.tray.setToolTip('Click to copy.');
        this.tray.on('click', () => {
          this.updateValues();
        });
        this.updateValues();
      })
      .catch(() => undefined);
  }

  updateValues() {
    try {
      this.count += 1;
      this.tray?.setTitle(`Code`);
      const trayMenu = JSON.parse(readFileSync(TrayController.PATH, 'utf-8'));
      const menus = trayMenu.menus.map((item) => {
        const value = execSync(item.command).toString().trim();
        return {
          label: `${item.label}: ${value}`,
          type: 'normal',
          click: () => {
            this.updateValues();
            const newValue = item.updateWhenClicking
              ? execSync(item.command).toString().trim()
              : value;
            pbcopy(newValue);
          },
        };
      });
      menus.push({
        label: 'Edit',
        type: 'normal',
        click: async () => {
          execSync(`open -a "Visual Studio Code" ${TrayController.PATH}`);
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
}
