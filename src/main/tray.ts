import {
  app,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  MenuItemConstructorOptions,
  NativeImage,
} from 'electron';
import { execSync } from 'node:child_process';
import { spawn } from 'child_process';
import { readFileSync, watchFile } from 'node:fs';
import { resolve } from 'node:path';
import stripJsonComments from 'strip-json-comments';
import { WindowManager } from './windows/window-manager';
import { Logger } from './utils/Logger';
import { WindowSizeProp } from './types';
import { QuickCommandConfig, QuickCommandController } from './quick-command';
import { LinkInterceptorController } from './link-interceptor';
import { loadBundledDefaultIcon, loadConfiguredIcon } from './configured-icon';

function pbcopy(data: string) {
  const proc = spawn('pbcopy', [], {
    env: { ...process.env, LANG: 'en_US.UTF-8' },
  });
  proc.stdin.write(data, 'utf8');
  proc.stdin.end();
}

interface BaseMenuItem {
  label: string;
  command?: string;
  maxLabelLength?: number;
  type?: MenuItemConstructorOptions['type'];
}

interface BrowserWindowMenuItem extends BaseMenuItem {
  action: 'browser-window';
  url: string;
  size?: WindowSizeProp;
}

interface CopyValueMenuItem extends BaseMenuItem {
  action: 'copy-value';
  value: string;
}
interface ExecuteCommandMenuItem extends BaseMenuItem {
  action: 'execute-command';
  command: string;
  value: string;
}
interface QuitAppMenuItem extends BaseMenuItem {
  action: 'quit-app';
}

type MenuItem =
  | (BrowserWindowMenuItem & { submenu: MenuItem[] })
  | (CopyValueMenuItem & { submenu: MenuItem[] })
  | (ExecuteCommandMenuItem & { submenu: MenuItem[] })
  | (QuitAppMenuItem & { submenu: MenuItem[] });

interface TrayMenuConfig {
  icon: NativeImage;
  title: string;
  description: string;
  quickCommand?: QuickCommandConfig;
  menus: MenuItem[];
}

export class TrayController {
  static PATH = resolve(process.env.HOME ?? '', 'easy-tray.config.json');
  // eslint-disable-next-line no-use-before-define
  private static $instance: TrayController | null = null;
  static instance(): TrayController {
    if (!TrayController.$instance) {
      TrayController.$instance = new TrayController();
    }
    return TrayController.$instance;
  }
  tray: Tray | null = null;
  trayMenu: Menu | null = null;
  config: TrayMenuConfig | null = null;
  private configRevision = 0;
  private iconRefreshRevision = 0;

  constructor() {
    app
      .whenReady()
      .then(async () => {
        await this.parseTrayConfig();
        this.createOrUpdateTray();
        watchFile(TrayController.PATH, { interval: 100 }, async () => {
          await this.parseTrayConfig();
          this.createOrUpdateTray();
          Logger.info('Tray config file changed');
        });
      })
      .catch((error) => Logger.error(error.message));
    app.on('will-quit', () => globalShortcut.unregisterAll());
  }

  createOrUpdateTray() {
    try {
      if (!this.config) {
        return;
      }
      if (!this.tray) {
        this.tray = new Tray(nativeImage.createEmpty());
        this.tray.addListener('click', () => {
          this.createOrUpdateTray();
        });
      }
      this.tray.setImage(this.config.icon);
      this.tray.setTitle(this.config.title);
      this.tray.setToolTip(this.config.description);
      const menus: MenuItemConstructorOptions[] = this.config.menus.map(
        (menu) => this.calculateMenu(menu),
      );
      this.trayMenu = Menu.buildFromTemplate(menus);
      this.tray.setContextMenu(this.trayMenu);
    } catch (error: any) {
      Logger.error(error.message);
    }
  }

  async parseTrayConfig() {
    this.configRevision += 1;
    const revision = this.configRevision;
    try {
      const jsonWithComments = readFileSync(TrayController.PATH, 'utf-8');
      const jsonWithoutComments = stripJsonComments(jsonWithComments, {
        trailingCommas: true,
      });
      const config = JSON.parse(jsonWithoutComments);
      const title = config.icon ? config.title : config.title || 'Untitled';
      config.title = title;
      config.description = config.description || '';
      config.menus = config.menus || [];
      config.icon = await this.calculateTrayIcon(config.icon);
      if (revision !== this.configRevision) return;
      await QuickCommandController.instance().setConfig(config.quickCommand);
      if (revision !== this.configRevision) return;
      this.config = config;
      this.iconRefreshRevision += 1;
      LinkInterceptorController.instance().setConfig(
        config.quickCommand?.openInBrowser,
      );
    } catch (error: any) {
      if (revision !== this.configRevision) return;
      Logger.error(error.message);
      await QuickCommandController.instance().setConfig({ enabled: false });
      if (revision !== this.configRevision) return;
      LinkInterceptorController.instance().setConfig({
        interceptSystemLinks: false,
      });
      this.config = {
        icon: nativeImage.createEmpty(),
        title: 'Error',
        description: error.message,
        menus: [],
      };
      this.iconRefreshRevision += 1;
    }
  }

  executeCommand(command: string): string {
    try {
      return execSync(command).toString().trim();
    } catch (error: any) {
      Logger.error(`Execute command '${command}' failed: ${error.message}`);
      return error.message;
    }
  }

  async calculateTrayIcon(
    icon?: string | { name: string; width: number; height: number },
  ) {
    try {
      if (icon) {
        const iconName = typeof icon === 'string' ? icon : icon.name;
        const size =
          typeof icon === 'string'
            ? { width: 16, height: 16 }
            : { width: icon.width, height: icon.height };

        if (typeof iconName !== 'string' || !iconName.trim()) {
          return nativeImage.createEmpty();
        }

        return (
          (await loadConfiguredIcon(iconName, size)) ??
          (await loadBundledDefaultIcon(size)) ??
          nativeImage.createEmpty()
        );
      }
      return nativeImage.createEmpty();
    } catch (error: any) {
      Logger.error(error.message);
      return nativeImage.createEmpty();
    }
  }

  async refreshConfiguredIcons() {
    this.iconRefreshRevision += 1;
    const iconRevision = this.iconRefreshRevision;
    const { configRevision, config } = this;
    await QuickCommandController.instance().refreshConfiguredIcons();
    if (
      !config ||
      iconRevision !== this.iconRefreshRevision ||
      configRevision !== this.configRevision ||
      config !== this.config
    ) {
      return;
    }

    try {
      const jsonWithComments = readFileSync(TrayController.PATH, 'utf-8');
      const jsonWithoutComments = stripJsonComments(jsonWithComments, {
        trailingCommas: true,
      });
      const configuredIcon = JSON.parse(jsonWithoutComments).icon;
      const icon = await this.calculateTrayIcon(configuredIcon);
      if (
        iconRevision !== this.iconRefreshRevision ||
        configRevision !== this.configRevision ||
        config !== this.config
      ) {
        return;
      }
      config.icon = icon;
      this.createOrUpdateTray();
    } catch (error: any) {
      Logger.error(`Refresh configured icons failed: ${error.message}`);
    }
  }

  calculateMenu(item: MenuItem): MenuItemConstructorOptions {
    const { labelValue, commandValue } = this.calculateMenuLabel(item);
    const type: MenuItemConstructorOptions['type'] = item.type ?? 'normal';
    return {
      id: labelValue,
      label: labelValue,
      type,
      click:
        type === 'normal'
          ? () => {
              this.executeClickEvent(item, commandValue);
            }
          : undefined,
      submenu: item.submenu?.map((subitem) => this.calculateMenu(subitem)),
    };
  }

  calculateMenuLabel(item: MenuItem) {
    const { label, command, maxLabelLength = 50 } = item;

    if (label.includes('{{CommandValue}}') && command) {
      const commandValue = this.executeCommand(command);
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
    if (item.action === 'browser-window' && item.url) {
      Logger.info(`Click '${item.label}', open '${item.url}'`);
      WindowManager.instance(item.label).init(item.url, item.size);
      return;
    }

    if (item.action === 'execute-command' && item.command) {
      Logger.info(`Click '${item.label}', execute '${item.command}'`);
      this.executeCommand(item.command);
      return;
    }

    if (item.action === 'copy-value') {
      const valueTemplate = item.value || '';
      let newValue = valueTemplate;
      if (newValue.includes('{{CommandValue}}') && item.command) {
        const commandValue = this.executeCommand(item.command);
        newValue = newValue.replace(/\{\{CommandValue\}\}/g, commandValue);
      }
      if (newValue.includes('{{CommandValueInLabel}}')) {
        newValue = newValue.replace(
          /\{\{CommandValueInLabel\}\}/g,
          CommandValueInLabel,
        );
      }

      Logger.info(`Click '${item.label}', copy '${newValue}'`);
      pbcopy(newValue);
      return;
    }

    if (item.action === 'quit-app') {
      Logger.info(`Click '${item.label}', quit app.`);
      app.quit();
    }
  }
}
