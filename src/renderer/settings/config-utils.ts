import {
  BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE,
  BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE_ID,
  EasyTrayEditorConfig,
  MenuItemEditorConfig,
  WebSearchEngineEditorConfig,
} from '../../shared/config';
import { DEFAULT_QUICK_COMMAND_THEME } from '../../shared/quick-command-theme';

export type MenuPath = number[];

export interface FlatMenuItem {
  depth: number;
  item: MenuItemEditorConfig;
  path: MenuPath;
}

export function cloneConfigValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function formatStringList(values?: string[]) {
  return values?.join(', ') ?? '';
}

export function parseStringList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function moveArrayItem<T>(items: T[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(targetIndex, 0, item);
  return nextItems;
}

export function createUniqueName(baseName: string, existingNames: string[]) {
  const names = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!names.has(baseName.toLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (names.has(`${baseName}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${baseName}-${suffix}`;
}

function normalizeWebSearchEngines(
  engines: WebSearchEngineEditorConfig[] | undefined,
) {
  const configuredEngines = Array.isArray(engines) ? engines : [];
  if (
    configuredEngines.some(
      (engine) => engine.id === BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE_ID,
    )
  ) {
    return configuredEngines;
  }

  const legacyGoogleIndex = configuredEngines.findIndex((engine) => {
    const command = engine.command?.trim().toLowerCase();
    const name = engine.name.trim().toLowerCase();
    const url = engine.url.trim().toLowerCase();
    return command === 'g' && (name === 'google' || url.includes('google.'));
  });
  if (legacyGoogleIndex >= 0) {
    return configuredEngines.map((engine, index) =>
      index === legacyGoogleIndex
        ? { ...engine, id: BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE_ID }
        : engine,
    );
  }

  return [
    {
      ...BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE,
      aliases: [...(BUILT_IN_GOOGLE_WEB_SEARCH_ENGINE.aliases ?? [])],
    },
    ...configuredEngines,
  ];
}

export function normalizeEditorConfig(config: EasyTrayEditorConfig) {
  const normalizedConfig = { ...config };
  delete normalizedConfig.linkInterceptor;
  const quickCommand = config.quickCommand ?? {};
  const appSearch = quickCommand.appSearch ?? {};
  const openInBrowser = quickCommand.openInBrowser ?? {};
  const webSearch = quickCommand.webSearch ?? {};
  const icon =
    typeof config.icon === 'string'
      ? { name: config.icon, width: 16, height: 16 }
      : { name: '', width: 16, height: 16, ...(config.icon ?? {}) };

  return {
    ...normalizedConfig,
    icon,
    title: config.title ?? '',
    description: config.description ?? '',
    menus: Array.isArray(config.menus) ? config.menus : [],
    quickCommand: {
      ...quickCommand,
      enabled: quickCommand.enabled ?? true,
      shortcut: quickCommand.shortcut ?? '',
      defaultCommand: quickCommand.defaultCommand ?? '',
      theme: quickCommand.theme ?? DEFAULT_QUICK_COMMAND_THEME,
      themes: quickCommand.themes ?? {},
      commands: Array.isArray(quickCommand.commands)
        ? quickCommand.commands
        : [],
      appSearch: {
        ...appSearch,
        enabled: appSearch.enabled ?? true,
      },
      openInBrowser: {
        ...openInBrowser,
        interceptSystemLinks: openInBrowser.interceptSystemLinks ?? false,
        registerAsDefaultBrowser:
          openInBrowser.registerAsDefaultBrowser ?? false,
        defaultProfileId: openInBrowser.defaultProfileId ?? '',
        profiles: Array.isArray(openInBrowser.profiles)
          ? openInBrowser.profiles
          : [],
        domainProfiles: Array.isArray(openInBrowser.domainProfiles)
          ? openInBrowser.domainProfiles
          : [],
      },
      webSearch: {
        ...webSearch,
        enabled: webSearch.enabled ?? true,
        defaultEngine: webSearch.defaultEngine ?? '',
        engines: normalizeWebSearchEngines(webSearch.engines),
      },
    },
  } satisfies EasyTrayEditorConfig;
}

export function flattenMenuItems(
  items: MenuItemEditorConfig[],
  parentPath: MenuPath = [],
  depth = 0,
): FlatMenuItem[] {
  return items.flatMap((item, index) => {
    const path = [...parentPath, index];
    const children = Array.isArray(item.submenu)
      ? flattenMenuItems(item.submenu, path, depth + 1)
      : [];
    return [{ depth, item, path }, ...children];
  });
}

export function menuPathKey(path: MenuPath) {
  return path.join('.');
}

export function getMenuItemAtPath(
  items: MenuItemEditorConfig[],
  path: MenuPath,
): MenuItemEditorConfig | undefined {
  const [index, ...remainingPath] = path;
  const item = items[index];
  if (!item) {
    return undefined;
  }
  return remainingPath.length > 0
    ? getMenuItemAtPath(item.submenu ?? [], remainingPath)
    : item;
}

export function updateMenuItemAtPath(
  items: MenuItemEditorConfig[],
  path: MenuPath,
  update: (item: MenuItemEditorConfig) => MenuItemEditorConfig,
): MenuItemEditorConfig[] {
  const [index, ...remainingPath] = path;
  return items.map((item, itemIndex) => {
    if (itemIndex !== index) {
      return item;
    }
    if (remainingPath.length === 0) {
      return update(item);
    }
    return {
      ...item,
      submenu: updateMenuItemAtPath(item.submenu ?? [], remainingPath, update),
    };
  });
}

export function updateMenuCollection(
  items: MenuItemEditorConfig[],
  parentPath: MenuPath,
  update: (siblings: MenuItemEditorConfig[]) => MenuItemEditorConfig[],
) {
  if (parentPath.length === 0) {
    return update(items);
  }
  return updateMenuItemAtPath(items, parentPath, (parent) => ({
    ...parent,
    submenu: update(parent.submenu ?? []),
  }));
}

export function removeMenuItemAtPath(
  items: MenuItemEditorConfig[],
  path: MenuPath,
) {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return updateMenuCollection(items, parentPath, (siblings) =>
    siblings.filter((_item, siblingIndex) => siblingIndex !== index),
  );
}

export function moveMenuItemAtPath(
  items: MenuItemEditorConfig[],
  path: MenuPath,
  direction: -1 | 1,
) {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return updateMenuCollection(items, parentPath, (siblings) =>
    moveArrayItem(siblings, index, direction),
  );
}

export function insertMenuItemAtPath(
  items: MenuItemEditorConfig[],
  parentPath: MenuPath,
  item: MenuItemEditorConfig,
) {
  return updateMenuCollection(items, parentPath, (siblings) => [
    ...siblings,
    item,
  ]);
}
