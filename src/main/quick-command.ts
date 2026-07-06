import path from 'path';
import {
  app,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from 'electron';
import { execSync, spawn } from 'node:child_process';
import { resolveHtmlPath } from './util';
import { WindowSizeProp } from './types';
import { WindowManager } from './windows/window-manager';
import { Logger } from './utils/Logger';
import {
  ChromeProfileMapping,
  ChromeProfileRoutingConfig,
  openChromeProfileUrl,
} from './chrome-profile';

type WebSearchOpenTarget = 'external' | 'browser-window';
type QuickCommandAction =
  | 'web-search'
  | 'browser-window'
  | 'copy-value'
  | 'execute-command'
  | 'open-chrome-profile'
  | 'quit-app';

function pbcopy(data: string) {
  const proc = spawn('pbcopy', [], {
    env: { ...process.env, LANG: 'en_US.UTF-8' },
  });
  proc.stdin.write(data, 'utf8');
  proc.stdin.end();
}

export interface QuickCommandWebSearchEngine {
  name: string;
  command?: string;
  aliases?: string[];
  url: string;
  openIn?: WebSearchOpenTarget;
  size?: WindowSizeProp;
}

export interface QuickCommandConfiguredCommand {
  name: string;
  command?: string;
  aliases?: string[];
  description?: string;
  action: QuickCommandAction;
  url?: string;
  openIn?: WebSearchOpenTarget;
  size?: WindowSizeProp;
  value?: string;
  shellCommand?: string;
  chromePath?: string;
  defaultProfile?: string;
  profiles?: ChromeProfileMapping[];
  requiresInput?: boolean;
}

export interface QuickCommandConfig {
  enabled?: boolean;
  shortcut?: string;
  defaultCommand?: string;
  commands?: QuickCommandConfiguredCommand[];
  webSearch?: {
    enabled?: boolean;
    defaultEngine?: string;
    engines?: QuickCommandWebSearchEngine[];
  };
}

interface NormalizedWebSearchEngine extends QuickCommandWebSearchEngine {
  command: string;
  aliases: string[];
  openIn: WebSearchOpenTarget;
}

interface NormalizedQuickCommandCommand {
  name: string;
  command: string;
  aliases: string[];
  description?: string;
  action: QuickCommandAction;
  url?: string;
  openIn?: WebSearchOpenTarget;
  size?: WindowSizeProp;
  value?: string;
  shellCommand?: string;
  chromePath?: string;
  defaultProfile?: string;
  profiles?: ChromeProfileMapping[];
  requiresInput?: boolean;
}

interface NormalizedQuickCommandConfig {
  enabled: boolean;
  shortcut: string;
  defaultCommand: string;
  commands: NormalizedQuickCommandCommand[];
}

export interface QuickCommandViewConfig {
  shortcut: string;
  defaultCommand: string;
  commands: Array<{
    name: string;
    command: string;
    aliases: string[];
    description?: string;
    action: QuickCommandAction;
    requiresInput?: boolean;
  }>;
}

export type QuickCommandResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space';
const QUICK_COMMAND_WIDTH = 760;
const QUICK_COMMAND_HEIGHT = 450;

const DEFAULT_WEB_SEARCH_ENGINES: NormalizedWebSearchEngine[] = [
  {
    name: 'Google',
    command: 'g',
    aliases: ['google', 'web', 'search'],
    url: 'https://www.google.com/search?q={{query}}',
    openIn: 'external',
  },
];

const ACTION_LABELS: Record<QuickCommandAction, string> = {
  'web-search': 'Search',
  'browser-window': 'Open',
  'copy-value': 'Copy',
  'execute-command': 'Run',
  'open-chrome-profile': 'Chrome',
  'quit-app': 'Quit',
};

export class QuickCommandController {
  // eslint-disable-next-line no-use-before-define
  private static $instance: QuickCommandController | null = null;
  static instance(): QuickCommandController {
    if (!QuickCommandController.$instance) {
      QuickCommandController.$instance = new QuickCommandController();
    }
    return QuickCommandController.$instance;
  }

  private window: BrowserWindow | null = null;
  private initPromise: Promise<BrowserWindow> | null = null;
  private registeredShortcut: string | null = null;
  private config: NormalizedQuickCommandConfig =
    QuickCommandController.normalizeConfig();

  private constructor() {
    ipcMain.handle('quick-command:get-config', () => this.getViewConfig());
    ipcMain.handle('quick-command:execute', (_event, input: unknown) =>
      this.execute(typeof input === 'string' ? input : ''),
    );
    ipcMain.on('quick-command:hide', () => this.hide());
  }

  setConfig(config?: QuickCommandConfig) {
    this.config = QuickCommandController.normalizeConfig(config);
    this.updateShortcut();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('quick-command:show', this.getViewConfig());
    }
  }

  private static normalizeConfig(
    config: QuickCommandConfig = {},
  ): NormalizedQuickCommandConfig {
    const configuredCommands = (config.commands ?? [])
      .map((command) =>
        QuickCommandController.normalizeConfiguredCommand(command),
      )
      .filter((command): command is NormalizedQuickCommandCommand =>
        Boolean(command),
      );
    const webSearchCommands =
      config.webSearch?.enabled === false
        ? []
        : QuickCommandController.normalizeWebSearchCommands(config.webSearch);
    const commands = QuickCommandController.dedupeCommands([
      ...configuredCommands,
      ...webSearchCommands,
    ]);
    const firstCommand = commands[0];

    return {
      enabled: config.enabled ?? true,
      shortcut: config.shortcut || DEFAULT_SHORTCUT,
      defaultCommand:
        config.defaultCommand ||
        config.webSearch?.defaultEngine ||
        firstCommand?.command ||
        '',
      commands,
    };
  }

  private static normalizeWebSearchCommands(webSearch?: {
    defaultEngine?: string;
    engines?: QuickCommandWebSearchEngine[];
  }) {
    const configuredEngines = (webSearch?.engines ?? [])
      .map((engine) => QuickCommandController.normalizeEngine(engine))
      .filter((engine): engine is NormalizedWebSearchEngine =>
        Boolean(engine?.name && engine.url),
      );
    const engines =
      configuredEngines.length > 0
        ? configuredEngines
        : DEFAULT_WEB_SEARCH_ENGINES;

    return engines.map((engine) =>
      QuickCommandController.webSearchEngineToCommand(engine),
    );
  }

  private static normalizeEngine(
    engine: QuickCommandWebSearchEngine,
  ): NormalizedWebSearchEngine | null {
    if (!engine || !engine.name || !engine.url) {
      return null;
    }

    return {
      ...engine,
      command: engine.command || engine.name.toLowerCase().replace(/\s+/g, '-'),
      aliases: engine.aliases ?? [],
      openIn: engine.openIn ?? 'external',
    };
  }

  private static normalizeConfiguredCommand(
    command: QuickCommandConfiguredCommand,
  ): NormalizedQuickCommandCommand | null {
    if (!command || !command.name || !command.action) {
      return null;
    }

    const normalizedCommand: NormalizedQuickCommandCommand = {
      ...command,
      command:
        command.command ||
        command.name.toLowerCase().trim().replace(/\s+/g, '-'),
      aliases: command.aliases ?? [],
      openIn: command.openIn ?? 'external',
      description: command.description || ACTION_LABELS[command.action],
    };

    if (
      ['web-search', 'browser-window'].includes(normalizedCommand.action) &&
      !normalizedCommand.url
    ) {
      return null;
    }

    if (
      normalizedCommand.action === 'execute-command' &&
      !normalizedCommand.shellCommand
    ) {
      return null;
    }

    if (
      normalizedCommand.action === 'copy-value' &&
      !normalizedCommand.value &&
      !normalizedCommand.shellCommand
    ) {
      return null;
    }

    if (
      normalizedCommand.action === 'open-chrome-profile' &&
      !normalizedCommand.defaultProfile &&
      !normalizedCommand.profiles?.length
    ) {
      return null;
    }

    return normalizedCommand;
  }

  private static webSearchEngineToCommand(
    engine: NormalizedWebSearchEngine,
  ): NormalizedQuickCommandCommand {
    return {
      name: engine.name,
      command: engine.command,
      aliases: engine.aliases,
      action: 'web-search',
      description: ACTION_LABELS['web-search'],
      url: engine.url,
      openIn: engine.openIn,
      size: engine.size,
      requiresInput: true,
    };
  }

  private static dedupeCommands(commands: NormalizedQuickCommandCommand[]) {
    const seen = new Set<string>();
    return commands.filter((command) => {
      const key = command.command.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private getViewConfig(): QuickCommandViewConfig {
    return {
      shortcut: this.config.shortcut,
      defaultCommand: this.config.defaultCommand,
      commands: this.config.commands.map((command) => ({
        name: command.name,
        command: command.command,
        aliases: command.aliases,
        description: command.description,
        action: command.action,
        requiresInput: this.commandRequiresInput(command),
      })),
    };
  }

  private updateShortcut() {
    if (this.registeredShortcut) {
      globalShortcut.unregister(this.registeredShortcut);
      this.registeredShortcut = null;
    }

    if (!this.config.enabled) {
      return;
    }

    const target = this.config.shortcut;
    try {
      const ok = globalShortcut.register(target, () => {
        this.show();
      });
      this.registeredShortcut = ok ? target : null;
      Logger.info(
        ok
          ? `Quick command shortcut registered: ${target}`
          : `Quick command shortcut register failed: ${target}`,
      );
    } catch (error: any) {
      this.registeredShortcut = null;
      Logger.error(
        `Register quick command shortcut '${target}' failed: ${error.message}`,
      );
    }
  }

  private async initWindow() {
    if (!this.initPromise) {
      this.initPromise = this.createWindow();
    }
    return this.initPromise;
  }

  private async createWindow() {
    const quickWindow = new BrowserWindow({
      ...this.getWindowBounds(),
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: app.isPackaged
          ? path.join(__dirname, 'preload.js')
          : path.join(__dirname, '../../.erb/dll/preload.js'),
      },
    });

    this.configureWindowForCurrentWorkspace(quickWindow);
    quickWindow.loadURL(resolveHtmlPath('index.html?page=quick-command'));
    quickWindow.on('blur', () => this.hide());
    quickWindow.on('closed', () => {
      this.window = null;
      this.initPromise = null;
    });
    quickWindow.webContents.on('did-finish-load', () => {
      quickWindow.webContents.send('quick-command:show', this.getViewConfig());
    });
    this.window = quickWindow;
    return quickWindow;
  }

  private configureWindowForCurrentWorkspace(quickWindow: BrowserWindow) {
    quickWindow.setAlwaysOnTop(
      true,
      process.platform === 'darwin' ? 'screen-saver' : 'floating',
    );

    if (process.platform === 'darwin') {
      quickWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
    }
  }

  private getWindowBounds(): Pick<
    BrowserWindowConstructorOptions,
    'width' | 'height' | 'x' | 'y'
  > {
    const cursor = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(cursor);
    const width = Math.min(
      QUICK_COMMAND_WIDTH,
      Math.round(workArea.width * 0.8),
    );
    const height = QUICK_COMMAND_HEIGHT;

    return {
      width,
      height,
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + workArea.height * 0.18),
    };
  }

  async show() {
    if (!this.config.enabled) {
      return;
    }

    const quickWindow = await this.initWindow();
    quickWindow.setBounds(this.getWindowBounds());
    this.configureWindowForCurrentWorkspace(quickWindow);
    quickWindow.showInactive();
    quickWindow.moveTop();
    quickWindow.focus();
    quickWindow.webContents.send('quick-command:show', this.getViewConfig());
  }

  hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  private getDefaultCommand() {
    const defaultCommandKey = this.config.defaultCommand.toLowerCase();
    return (
      this.config.commands.find((command) =>
        this.getCommandIdentifiers(command).includes(defaultCommandKey),
      ) ?? this.config.commands[0]
    );
  }

  private getCommandIdentifiers(command: NormalizedQuickCommandCommand) {
    return [command.command, command.name, ...command.aliases]
      .filter(Boolean)
      .map((identifier) => identifier.toLowerCase());
  }

  private resolveCommand(input: string) {
    const words = input.split(/\s+/);
    const firstWord = words[0]?.toLowerCase();
    const matchedCommand = this.config.commands.find((command) =>
      this.getCommandIdentifiers(command).includes(firstWord),
    );

    if (matchedCommand) {
      return {
        command: matchedCommand,
        query: input.slice(words[0].length).trim(),
        explicit: true,
      };
    }

    return {
      command: this.getDefaultCommand(),
      query: input,
      explicit: false,
    };
  }

  private applyTemplate(
    template: string,
    query: string,
    encodedQueryByDefault: boolean,
  ) {
    const encodedQuery = encodeURIComponent(query);
    return template
      .replace(/\{\{encodedQuery\}\}/g, () => encodedQuery)
      .replace(/\{\{rawQuery\}\}/g, () => query)
      .replace(/\{\{query\}\}/g, () =>
        encodedQueryByDefault ? encodedQuery : query,
      );
  }

  private buildUrl(urlTemplate: string, query: string, appendQuery: boolean) {
    const encodedQuery = encodeURIComponent(query);

    if (/\{\{(encodedQuery|query|rawQuery)\}\}/.test(urlTemplate)) {
      return this.applyTemplate(urlTemplate, query, true);
    }

    if (!appendQuery) {
      return urlTemplate;
    }

    const separator = urlTemplate.includes('?') ? '&' : '?';
    return `${urlTemplate}${separator}q=${encodedQuery}`;
  }

  private normalizeHttpUrl(url: string) {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported web search protocol: ${parsedUrl.protocol}`);
    }
    return parsedUrl.toString();
  }

  private runShellCommand(shellCommand: string): string {
    try {
      return execSync(shellCommand).toString().trim();
    } catch (error: any) {
      Logger.error(
        `Execute command '${shellCommand}' failed: ${error.message}`,
      );
      throw new Error(error.message);
    }
  }

  private commandRequiresInput(command: NormalizedQuickCommandCommand) {
    if (typeof command.requiresInput === 'boolean') {
      return command.requiresInput;
    }
    return ['web-search', 'open-chrome-profile'].includes(command.action);
  }

  private async executeResolvedCommand(
    command: NormalizedQuickCommandCommand,
    query: string,
  ) {
    if (this.commandRequiresInput(command) && !query) {
      throw new Error(`Type input for ${command.name}`);
    }

    if (command.action === 'web-search') {
      const url = this.normalizeHttpUrl(
        this.buildUrl(command.url || '', query, true),
      );
      Logger.info(`Quick command web search '${command.name}': ${query}`);

      if (command.openIn === 'browser-window') {
        await WindowManager.instance(`Web Search: ${command.name}`).init(
          url,
          command.size,
        );
      } else {
        await shell.openExternal(url);
      }
      return;
    }

    if (command.action === 'browser-window') {
      const url = this.normalizeHttpUrl(
        this.buildUrl(command.url || '', query, false),
      );
      Logger.info(`Quick command open '${command.name}': ${url}`);
      await WindowManager.instance(command.name).init(url, command.size);
      return;
    }

    if (command.action === 'copy-value') {
      const commandValue = command.shellCommand
        ? this.runShellCommand(
            this.applyTemplate(command.shellCommand, query, false),
          )
        : '';
      const valueTemplate = command.value || commandValue || query;
      const value = this.applyTemplate(valueTemplate, query, false).replace(
        /\{\{CommandValue\}\}/g,
        () => commandValue,
      );
      Logger.info(`Quick command copy '${command.name}'`);
      pbcopy(value);
      return;
    }

    if (command.action === 'execute-command') {
      const shellCommand = this.applyTemplate(
        command.shellCommand || '',
        query,
        false,
      );
      Logger.info(`Quick command execute '${command.name}': ${shellCommand}`);
      this.runShellCommand(shellCommand);
      return;
    }

    if (command.action === 'open-chrome-profile') {
      const chromeUrl = command.url
        ? this.buildUrl(command.url, query, false)
        : query;
      openChromeProfileUrl(
        chromeUrl,
        command as ChromeProfileRoutingConfig,
        command.name,
      );
      return;
    }

    if (command.action === 'quit-app') {
      Logger.info(`Quick command quit '${command.name}'`);
      app.quit();
    }
  }

  async execute(rawInput: string): Promise<QuickCommandResult> {
    const input = rawInput.trim();
    if (!input) {
      return {
        ok: false,
        error: 'Type a search term',
      };
    }

    try {
      const { command, query } = this.resolveCommand(input);
      if (!command) {
        return {
          ok: false,
          error: 'No quick command configured',
        };
      }
      await this.executeResolvedCommand(command, query);

      this.hide();
      return {
        ok: true,
      };
    } catch (error: any) {
      Logger.error(`Quick command failed: ${error.message}`);
      return {
        ok: false,
        error: error.message,
      };
    }
  }
}
