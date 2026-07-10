// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  QuickCommandResult,
  QuickCommandViewConfig,
} from './quick-command';
import type {
  EasyTrayEditorConfig,
  SettingsConfigResult,
} from '../shared/config';

export type Channels = 'quick-command:show' | 'quick-command:update-config';
export type InvokeChannels =
  | 'quick-command:get-config'
  | 'quick-command:execute'
  | 'settings:get-config'
  | 'settings:save-config';

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
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
