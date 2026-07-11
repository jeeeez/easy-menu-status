import { QuickCommandCustomTheme } from './quick-command-theme';
import { OpenInBrowserConfig } from './browser-routing';

export type {
  BrowserProfileConfig,
  DomainProfileConfig,
  OpenInBrowserConfig,
} from './browser-routing';

export const WINDOW_SIZE_PRESETS = [
  'fullscreen',
  'maximized',
  'minimized',
  'left',
  'right',
  'top',
  'bottom',
] as const;

export type WindowSizePreset = (typeof WINDOW_SIZE_PRESETS)[number];

export interface CustomWindowSize {
  width: number;
  height: number;
  x?: number;
  y?: number;
  fullscreen?: boolean;
}

export type ConfigWindowSize = WindowSizePreset | CustomWindowSize;

export const QUICK_COMMAND_ACTIONS = [
  'web-search',
  'browser-window',
  'copy-value',
  'execute-command',
  'open-in-browser',
  'open-settings',
  'quit-app',
] as const;

export type QuickCommandEditorAction = (typeof QUICK_COMMAND_ACTIONS)[number];

export const BUILT_IN_ICON_NAMES = [
  'cat',
  'flame',
  'snowflake',
  'figure.run.circle.fill',
] as const;

export interface QuickCommandEditorEntry {
  name: string;
  label: string;
  icon?: string;
  command?: string;
  aliases?: string[];
  description?: string;
  action: QuickCommandEditorAction;
  url?: string;
  openIn?: 'external' | 'browser-window';
  size?: ConfigWindowSize;
  value?: string;
  requiresInput?: boolean;
  autoUpdateInterval?: number;
  [key: string]: unknown;
}

export interface WebSearchEngineEditorConfig {
  id?: string;
  name: string;
  command?: string;
  aliases?: string[];
  url: string;
  openIn?: 'external' | 'browser-window';
  size?: ConfigWindowSize;
  [key: string]: unknown;
}

export const BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE_ID = 'google';

export const BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE: WebSearchEngineEditorConfig = {
  id: BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE_ID,
  name: 'Google',
  command: 'g',
  aliases: ['google', 'web', 'search'],
  url: 'https://www.google.com/search?q={{query}}',
  openIn: 'external',
};

export interface WebSearchEditorConfig {
  enabled?: boolean;
  defaultEngine?: string;
  engines?: WebSearchEngineEditorConfig[];
  [key: string]: unknown;
}

export interface AppSearchEditorConfig {
  enabled?: boolean;
  [key: string]: unknown;
}

export interface QuickCommandEditorConfig {
  enabled?: boolean;
  shortcut?: string;
  defaultCommand?: string;
  theme?: string;
  themes?: Record<string, QuickCommandCustomTheme>;
  commands?: QuickCommandEditorEntry[];
  appSearch?: AppSearchEditorConfig;
  openInBrowser?: OpenInBrowserConfig;
  webSearch?: WebSearchEditorConfig;
  [key: string]: unknown;
}

export const MENU_ITEM_KINDS = [
  'browser-window',
  'copy-value',
  'execute-command',
  'quit-app',
  'submenu',
  'separator',
] as const;

export type MenuItemKind = (typeof MENU_ITEM_KINDS)[number];

export interface MenuItemEditorConfig {
  label: string;
  action?: Exclude<MenuItemKind, 'submenu' | 'separator'>;
  type?: 'normal' | 'separator' | 'submenu';
  url?: string;
  size?: ConfigWindowSize;
  command?: string;
  value?: string;
  maxLabelLength?: number;
  autoUpdateInterval?: number;
  submenu?: MenuItemEditorConfig[];
  [key: string]: unknown;
}

export interface TrayIconEditorConfig {
  name: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface EasyTrayEditorConfig {
  icon?: string | TrayIconEditorConfig;
  title?: string;
  description?: string;
  menus?: MenuItemEditorConfig[];
  quickCommand?: QuickCommandEditorConfig;
  [key: string]: unknown;
}

export interface SettingsConfigSnapshot {
  path: string;
  backupPath: string;
  config: EasyTrayEditorConfig;
}

export type SettingsConfigResult =
  | { ok: true; snapshot: SettingsConfigSnapshot }
  | { ok: false; error: string };
