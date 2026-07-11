// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  webUtils,
} from 'electron';
import type {
  QuickCommandResult,
  QuickCommandViewConfig,
} from './quick-command';
import type { ApplicationSearchResult } from './application-search';
import type {
  EasyTrayEditorConfig,
  SettingsConfigResult,
} from '../shared/config';
import {
  SETTINGS_ICON_MAX_INPUT_BYTES,
  type SettingsIconImportRequest,
  type SettingsIconImportResult,
  type SettingsLocalIconDeleteResult,
  type SettingsLocalIconListResult,
  type SettingsIconPreviewResult,
} from '../shared/icon-import';

export type Channels = 'quick-command:show' | 'quick-command:update-config';
export type InvokeChannels =
  | 'quick-command:get-config'
  | 'quick-command:execute'
  | 'quick-command:search-applications'
  | 'quick-command:open-application'
  | 'settings:get-config'
  | 'settings:save-config'
  | 'settings:import-icon'
  | 'settings:preview-icon'
  | 'settings:list-local-icons'
  | 'settings:delete-local-icon';

function importIcon(request: SettingsIconImportRequest) {
  return ipcRenderer.invoke(
    'settings:import-icon',
    request,
  ) as Promise<SettingsIconImportResult>;
}

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke(channel: InvokeChannels, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
  quickCommand: {
    getConfig() {
      return ipcRenderer.invoke(
        'quick-command:get-config',
      ) as Promise<QuickCommandViewConfig>;
    },
    execute(input: string) {
      return ipcRenderer.invoke(
        'quick-command:execute',
        input,
      ) as Promise<QuickCommandResult>;
    },
    searchApplications(query: string) {
      return ipcRenderer.invoke(
        'quick-command:search-applications',
        query,
      ) as Promise<ApplicationSearchResult[]>;
    },
    openApplication(applicationPath: string) {
      return ipcRenderer.invoke(
        'quick-command:open-application',
        applicationPath,
      ) as Promise<QuickCommandResult>;
    },
    hide() {
      ipcRenderer.send('quick-command:hide');
    },
    onShow(func: (config: QuickCommandViewConfig) => void) {
      const subscription = (
        _event: IpcRendererEvent,
        config: QuickCommandViewConfig,
      ) => func(config);
      ipcRenderer.on('quick-command:show', subscription);

      return () => {
        ipcRenderer.removeListener('quick-command:show', subscription);
      };
    },
    onConfigUpdate(func: (config: QuickCommandViewConfig) => void) {
      const subscription = (
        _event: IpcRendererEvent,
        config: QuickCommandViewConfig,
      ) => func(config);
      ipcRenderer.on('quick-command:update-config', subscription);

      return () => {
        ipcRenderer.removeListener('quick-command:update-config', subscription);
      };
    },
  },
  settings: {
    load() {
      return ipcRenderer.invoke(
        'settings:get-config',
      ) as Promise<SettingsConfigResult>;
    },
    save(config: EasyTrayEditorConfig) {
      return ipcRenderer.invoke(
        'settings:save-config',
        config,
      ) as Promise<SettingsConfigResult>;
    },
    chooseIcon() {
      return importIcon({ source: 'picker' });
    },
    pasteIcon() {
      return importIcon({ source: 'clipboard' });
    },
    async importDroppedFile(file: File) {
      if (file.size > SETTINGS_ICON_MAX_INPUT_BYTES) {
        return {
          ok: false,
          error: 'The image must be 10 MB or smaller.',
        } as const;
      }
      let filePath = '';
      try {
        filePath = webUtils.getPathForFile(file);
      } catch {
        // Webpage-created File objects have no local path; import their bytes.
      }
      if (filePath) return importIcon({ source: 'path', path: filePath });

      const bytes = new Uint8Array(await file.arrayBuffer());
      return importIcon({
        source: 'bytes',
        bytes,
        fileName: file.name,
        mimeType: file.type,
      });
    },
    importIconBytes(bytes: Uint8Array, fileName?: string, mimeType?: string) {
      if (bytes.byteLength > SETTINGS_ICON_MAX_INPUT_BYTES) {
        return Promise.resolve({
          ok: false,
          error: 'The image must be 10 MB or smaller.',
        } as const);
      }
      return importIcon({ source: 'bytes', bytes, fileName, mimeType });
    },
    importIconUrl(url: string) {
      return importIcon({ source: 'url', url });
    },
    previewIcon(icon: string) {
      return ipcRenderer.invoke(
        'settings:preview-icon',
        icon,
      ) as Promise<SettingsIconPreviewResult>;
    },
    listLocalIcons() {
      return ipcRenderer.invoke(
        'settings:list-local-icons',
      ) as Promise<SettingsLocalIconListResult>;
    },
    deleteLocalIcon(fileName: string) {
      return ipcRenderer.invoke(
        'settings:delete-local-icon',
        fileName,
      ) as Promise<SettingsLocalIconDeleteResult>;
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
