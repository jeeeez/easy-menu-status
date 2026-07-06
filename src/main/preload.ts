// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  QuickCommandResult,
  QuickCommandViewConfig,
} from './quick-command';

export type Channels = 'ipc-example' | 'quick-command:show';
export type InvokeChannels =
  | 'quick-command:get-config'
  | 'quick-command:execute';

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
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
