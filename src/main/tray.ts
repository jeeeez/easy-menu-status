import {
  app,
  Menu,
  Tray,
  nativeImage,
  MenuItemConstructorOptions,
  NativeImage,
} from 'electron';
import { execSync } from 'node:child_process';
import { spawn } from 'child_process';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { WindowManager } from './windows/window-manager';

function pbcopy(data: string) {
  const proc = spawn('pbcopy');
  proc.stdin.write(data);
  proc.stdin.end();
}

interface BaseMenuItem {
  label: string;
  command?: string;
  maxLabelLength?: number;
}

interface BrowserWindowMenuItem extends BaseMenuItem {
  type: 'browser-window';
  url: string;
}

interface CopyValueMenuItem extends BaseMenuItem {
  type: 'copy-value';
  value: string;
}
interface ExecuteCommandMenuItem extends BaseMenuItem {
  type: 'execute-command';
  command: string;
  value: string;
}

type MenuItem =
  | BrowserWindowMenuItem
  | CopyValueMenuItem
  | ExecuteCommandMenuItem;

interface TrayMenuConfig {
  icon: NativeImage;
  title: string;
  description: string;
  menus: MenuItem[];
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
      .then(async () => {
        const trayMenu = await this.parseMenuConfig();
        this.tray = new Tray(trayMenu.icon);
        this.tray.setTitle(trayMenu.title);
        this.tray.setToolTip(trayMenu.description);

        this.tray.on('click', () => {
          this.updateMenuValues();
        });
        await this.updateMenuValues();
      })
      .catch(() => undefined);
  }

  async updateMenuValues() {
    try {
      const trayMenu = await this.parseMenuConfig();
      this.tray?.setImage(trayMenu.icon);
      this.tray?.setTitle(trayMenu.title);
      this.tray?.setToolTip(trayMenu.description);
      const menus: MenuItemConstructorOptions[] = trayMenu.menus.map((item) => {
        const { labelValue, commandValue } = this.calculateMenuLabel(item);
        return {
          label: labelValue,
          type: 'normal',
          click: () => {
            this.updateMenuValues();
            this.executeClickEvent(item, commandValue);
          },
        };
      });
      this.tray?.setContextMenu(Menu.buildFromTemplate(menus));
    } catch (error) {
      console.error(error);
    }
  }

  async parseMenuConfig(): Promise<TrayMenuConfig> {
    try {
      const trayMenu = JSON.parse(readFileSync(TrayController.PATH, 'utf-8'));
      const title = trayMenu.icon
        ? trayMenu.title
        : trayMenu.title || 'Untitled';
      trayMenu.title = title;
      trayMenu.description = trayMenu.description || '';
      trayMenu.menus = trayMenu.menus || [];
      trayMenu.icon = await this.calculateTrayIcon(trayMenu.icon);
      return trayMenu;
    } catch (error: any) {
      return {
        icon: nativeImage.createEmpty(),
        title: 'Error',
        description: error.message,
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

  async calculateTrayIcon(
    icon: string | { name: string; width: number; height: number },
  ) {
    try {
      if (icon) {
        const iconName = typeof icon === 'string' ? icon : icon.name;
        const iconPath = iconName.startsWith('/')
          ? iconName
          : path.resolve(process.resourcesPath, `assets/icons/${iconName}.svg`);
        const size =
          typeof icon === 'string'
            ? { width: 16, height: 16 }
            : { width: icon.width, height: icon.height };

        return await nativeImage.createThumbnailFromPath(iconPath, size);
      }
      return nativeImage.createEmpty();
    } catch (error) {
      return nativeImage.createEmpty();
    }
  }

  calculateMenuLabel(item: MenuItem) {
    const { label, command, maxLabelLength = 50 } = item;

    if (label.includes('{{CommandValue}}') && command) {
      const commandValue = this.getOutputFromCommand(command);
      const labelValue = label
        .replace(/\{\{CommandValue\}\}/g, commandValue)
        .slice(0, maxLabelLength);
      return {
        labelValue,
        commandValue,
      };
    }

    return {
      labelValue: label.slice(0, maxLabelLength),
      commandValue: '',
    };
  }

  executeClickEvent(item: MenuItem, CommandValueInLabel: string) {
    if (item.type === 'browser-window' && item.url) {
      WindowManager.instance(item.label).init(item.url);
      return;
    }

    if (item.type === 'execute-command' && item.command) {
      this.getOutputFromCommand(item.command);
      return;
    }

    if (item.type === 'copy-value') {
      const valueTemplate = item.value || '';
      let newValue = valueTemplate;
      if (newValue.includes('{{CommandValue}}') && item.command) {
        const commandValue = this.getOutputFromCommand(item.command);
        newValue = newValue.replace(/\{\{CommandValue\}\}/g, commandValue);
      }
      if (newValue.includes('{{CommandValueInLabel}}')) {
        newValue = newValue.replace(
          /\{\{CommandValueInLabel\}\}/g,
          CommandValueInLabel,
        );
      }

      pbcopy(newValue);
    }
  }
}
