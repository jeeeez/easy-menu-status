import { ipcMain } from 'electron';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import stripJsonComments from 'strip-json-comments';
import {
  EasyTrayEditorConfig,
  SettingsConfigResult,
  SettingsConfigSnapshot,
} from '../shared/config';
import { Logger } from './utils/Logger';
import { TrayController } from './tray';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class SettingsController {
  // eslint-disable-next-line no-use-before-define
  private static $instance: SettingsController | null = null;

  static instance() {
    if (!SettingsController.$instance) {
      SettingsController.$instance = new SettingsController();
    }
    return SettingsController.$instance;
  }

  private readonly configPath = TrayController.PATH;
  private readonly backupPath = `${TrayController.PATH}.bak`;
  private readonly temporaryPath = `${TrayController.PATH}.tmp`;

  private constructor() {
    ipcMain.handle('settings:get-config', () => this.loadConfig());
    ipcMain.handle('settings:save-config', (_event, config: unknown) =>
      this.saveConfig(config),
    );
  }

  private readSnapshot(): SettingsConfigSnapshot {
    const source = readFileSync(this.configPath, 'utf8');
    const config = JSON.parse(
      stripJsonComments(source, { trailingCommas: true }),
    ) as EasyTrayEditorConfig;

    if (!isRecord(config)) {
      throw new Error('Configuration root must be an object');
    }

    return {
      path: this.configPath,
      backupPath: this.backupPath,
      config,
    };
  }

  loadConfig(): SettingsConfigResult {
    try {
      return { ok: true, snapshot: this.readSnapshot() };
    } catch (error: any) {
      Logger.error(`Load settings failed: ${error.message}`);
      return { ok: false, error: error.message };
    }
  }

  async saveConfig(config: unknown): Promise<SettingsConfigResult> {
    try {
      if (!isRecord(config)) {
        throw new Error('Configuration root must be an object');
      }

      // Preserve only the existing permission bits when replacing the file.
      const fileMode = existsSync(this.configPath)
        ? // eslint-disable-next-line no-bitwise
          statSync(this.configPath).mode & 0o777
        : 0o600;
      const serializedConfig = `${JSON.stringify(config, null, 2)}\n`;

      if (existsSync(this.configPath)) {
        copyFileSync(this.configPath, this.backupPath);
      }
      writeFileSync(this.temporaryPath, serializedConfig, {
        encoding: 'utf8',
        mode: fileMode,
      });
      renameSync(this.temporaryPath, this.configPath);

      const trayController = TrayController.instance();
      await trayController.parseTrayConfig();
      trayController.createOrUpdateTray();
      Logger.info(`Settings saved: ${this.configPath}`);

      return { ok: true, snapshot: this.readSnapshot() };
    } catch (error: any) {
      if (existsSync(this.temporaryPath)) {
        unlinkSync(this.temporaryPath);
      }
      Logger.error(`Save settings failed: ${error.message}`);
      return { ok: false, error: error.message };
    }
  }
}
