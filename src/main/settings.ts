import {
  BrowserWindow,
  dialog,
  ipcMain,
  IpcMainInvokeEvent,
  MessageBoxOptions,
  OpenDialogOptions,
} from 'electron';
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
import {
  SETTINGS_ICON_MAX_INPUT_BYTES,
  SettingsIconImportRequest,
  SettingsIconImportResult,
  SettingsLocalIconDeleteResult,
  SettingsLocalIconListResult,
  SettingsIconPreviewResult,
} from '../shared/icon-import';
import {
  CONFIGURED_ICON_EXTENSIONS,
  deletePersistentIcon,
  isPersistentIconFileName,
  listPersistentIcons,
  loadConfiguredIcon,
  loadPersistentIcon,
} from './configured-icon';
import {
  IconImportError,
  importConfiguredIconFromBytes,
  importConfiguredIconFromClipboard,
  importConfiguredIconFromPath,
  importConfiguredIconFromUrl,
} from './settings-icon-import';
import { Logger } from './utils/Logger';
import { TrayController } from './tray';
import { TrayMenuWindow } from './windows/tray-menu-window';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIconImportRequest(
  value: unknown,
): value is SettingsIconImportRequest {
  if (!isRecord(value) || typeof value.source !== 'string') return false;
  if (['picker', 'clipboard'].includes(value.source)) return true;
  if (value.source === 'path') {
    return typeof value.path === 'string' && value.path.length <= 4096;
  }
  if (value.source === 'url') {
    return typeof value.url === 'string' && value.url.length <= 2048;
  }
  return (
    value.source === 'bytes' &&
    value.bytes instanceof Uint8Array &&
    value.bytes.byteLength <= SETTINGS_ICON_MAX_INPUT_BYTES &&
    (value.fileName === undefined ||
      (typeof value.fileName === 'string' && value.fileName.length <= 255)) &&
    (value.mimeType === undefined ||
      (typeof value.mimeType === 'string' && value.mimeType.length <= 128))
  );
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
    ipcMain.handle('settings:get-config', (event: IpcMainInvokeEvent) =>
      this.isTrustedSettingsSender(event)
        ? this.loadConfig()
        : { ok: false, error: 'Settings request denied.' },
    );
    ipcMain.handle(
      'settings:save-config',
      (event: IpcMainInvokeEvent, config: unknown) =>
        this.isTrustedSettingsSender(event)
          ? this.saveConfig(config)
          : { ok: false, error: 'Settings request denied.' },
    );
    ipcMain.handle(
      'settings:import-icon',
      (event: IpcMainInvokeEvent, request: unknown) =>
        this.importIcon(event, request),
    );
    ipcMain.handle(
      'settings:preview-icon',
      (event: IpcMainInvokeEvent, icon: unknown) =>
        this.previewIcon(event, icon),
    );
    ipcMain.handle('settings:list-local-icons', (event: IpcMainInvokeEvent) =>
      this.listLocalIcons(event),
    );
    ipcMain.handle(
      'settings:delete-local-icon',
      (event: IpcMainInvokeEvent, fileName: unknown) =>
        this.deleteLocalIcon(event, fileName),
    );
  }

  private isTrustedSettingsSender(event: IpcMainInvokeEvent) {
    const settingsWindow = TrayMenuWindow.instance().window;
    if (
      !settingsWindow ||
      settingsWindow.isDestroyed() ||
      event.sender.id !== settingsWindow.webContents.id ||
      event.senderFrame !== event.sender.mainFrame
    ) {
      return false;
    }

    try {
      const senderUrl = new URL(event.senderFrame.url);
      if (senderUrl.searchParams.get('page') !== 'setting') return false;
      if (senderUrl.protocol === 'file:') return true;
      const developmentPort = process.env.PORT || '1212';
      return (
        process.env.NODE_ENV === 'development' &&
        senderUrl.protocol === 'http:' &&
        senderUrl.hostname === 'localhost' &&
        senderUrl.port === developmentPort
      );
    } catch {
      return false;
    }
  }

  private async chooseIcon(event: IpcMainInvokeEvent) {
    const options: OpenDialogOptions = {
      title: 'Choose an icon image',
      buttonLabel: 'Import Icon',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: CONFIGURED_ICON_EXTENSIONS.map((extension) =>
            extension.slice(1),
          ),
        },
      ],
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  }

  private async importIcon(
    event: IpcMainInvokeEvent,
    value: unknown,
  ): Promise<SettingsIconImportResult> {
    try {
      if (!this.isTrustedSettingsSender(event)) {
        throw new IconImportError('Icon imports must start from Settings.');
      }
      if (!isIconImportRequest(value)) {
        throw new IconImportError('The icon import request is invalid.');
      }

      let fileName: string | undefined;
      switch (value.source) {
        case 'picker': {
          const sourcePath = await this.chooseIcon(event);
          if (!sourcePath) return { ok: false, error: '', canceled: true };
          fileName = await importConfiguredIconFromPath(sourcePath);
          break;
        }
        case 'clipboard':
          fileName = await importConfiguredIconFromClipboard();
          break;
        case 'path':
          fileName = await importConfiguredIconFromPath(value.path);
          break;
        case 'bytes':
          fileName = await importConfiguredIconFromBytes(
            value.bytes,
            value.fileName,
            value.mimeType,
          );
          break;
        case 'url':
          fileName = await importConfiguredIconFromUrl(value.url);
          break;
        default:
          throw new IconImportError('The icon import request is invalid.');
      }
      return { ok: true, fileName };
    } catch (error) {
      const message =
        error instanceof IconImportError
          ? error.message
          : 'The image could not be imported.';
      Logger.error(
        `Icon import failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      return { ok: false, error: message };
    }
  }

  private async previewIcon(
    event: IpcMainInvokeEvent,
    value: unknown,
  ): Promise<SettingsIconPreviewResult> {
    if (!this.isTrustedSettingsSender(event)) {
      return { ok: false, error: 'Icon preview request denied.' };
    }
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > 4096 ||
      value.includes('\0')
    ) {
      return { ok: false, error: 'Select an icon to preview.' };
    }

    try {
      const size = { width: 96, height: 96 };
      const image = await loadConfiguredIcon(value, size);
      if (!image) {
        return { ok: true, fallback: true };
      }
      return { ok: true, dataUrl: image.toDataURL() };
    } catch {
      return { ok: false, error: 'Icon could not be found or decoded.' };
    }
  }

  private async listLocalIcons(
    event: IpcMainInvokeEvent,
  ): Promise<SettingsLocalIconListResult> {
    if (!this.isTrustedSettingsSender(event)) {
      return { ok: false, error: 'Local icon request denied.' };
    }

    try {
      const fileNames = await listPersistentIcons();
      const icons = await Promise.all(
        fileNames.map(async (fileName) => {
          const image = await loadPersistentIcon(fileName, {
            width: 48,
            height: 48,
          });
          return {
            fileName,
            dataUrl: image?.toDataURL(),
          };
        }),
      );
      return { ok: true, icons };
    } catch (error) {
      Logger.error(
        `List local icons failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      return { ok: false, error: 'Local icons could not be loaded.' };
    }
  }

  private async deleteLocalIcon(
    event: IpcMainInvokeEvent,
    value: unknown,
  ): Promise<SettingsLocalIconDeleteResult> {
    if (!this.isTrustedSettingsSender(event)) {
      return { ok: false, error: 'Local icon deletion denied.' };
    }
    if (!isPersistentIconFileName(value)) {
      return { ok: false, error: 'Select a local icon to delete.' };
    }

    const options: MessageBoxOptions = {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Delete Local Icon',
      message: `Delete “${value}”?`,
      detail:
        'This removes the local image immediately. Existing configuration references will remain and use a default icon.',
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const confirmation = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (confirmation.response !== 1) {
      return { ok: false, error: '', canceled: true };
    }

    try {
      await deletePersistentIcon(value);
      await TrayController.instance().refreshConfiguredIcons();
      return { ok: true, fileName: value };
    } catch (error) {
      Logger.error(
        `Delete local icon failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      return { ok: false, error: 'The local icon could not be deleted.' };
    }
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
