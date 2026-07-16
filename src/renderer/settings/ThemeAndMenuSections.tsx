import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ListPlus,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  TideEditorConfig,
  MENU_ITEM_KINDS,
  MenuItemEditorConfig,
  MenuItemKind,
} from '../../shared/config';
import {
  DEFAULT_QUICK_COMMAND_THEME,
  QUICK_COMMAND_PRESET_THEMES,
  QUICK_COMMAND_THEME_TOKEN_CSS_VARIABLES,
  QuickCommandCustomTheme,
  QuickCommandPresetTheme,
  QuickCommandThemeToken,
  QuickCommandThemeTokenValue,
} from '../../shared/quick-command-theme';
import {
  CollectionToolbar,
  IconButton,
  NumberField,
  SelectField,
  TextField,
  WindowSizeEditor,
} from './SettingsControls';
import {
  MenuPath,
  cloneConfigValue,
  createUniqueName,
  flattenMenuItems,
  getMenuItemAtPath,
  insertMenuItemAtPath,
  menuPathKey,
  moveMenuItemAtPath,
  removeMenuItemAtPath,
  updateMenuCollection,
  updateMenuItemAtPath,
} from './config-utils';

interface ConfigSectionProps {
  config: TideEditorConfig;
  onChange: (config: TideEditorConfig) => void;
}

const THEME_TOKENS = Object.keys(
  QUICK_COMMAND_THEME_TOKEN_CSS_VARIABLES,
) as QuickCommandThemeToken[];

const NUMERIC_THEME_TOKENS = new Set<QuickCommandThemeToken>([
  'radius.panel',
  'radius.input',
  'radius.item',
  'radius.tag',
  'radius.icon',
  'border.panelWidth',
  'border.inputWidth',
  'border.itemWidth',
  'density.itemHeight',
  'density.inputMinHeight',
  'density.pagePadding',
  'typography.inputSize',
  'typography.inputWeight',
  'typography.itemSize',
  'effect.blur',
  'effect.saturation',
  'motion.duration',
]);

function parseThemeTokenValue(
  token: QuickCommandThemeToken,
  value: string,
): QuickCommandThemeTokenValue {
  const numericValue = Number(value);
  return NUMERIC_THEME_TOKENS.has(token) &&
    value.trim() &&
    !Number.isNaN(numericValue)
    ? numericValue
    : value;
}

function reorderThemeRecord(
  themes: Record<string, QuickCommandCustomTheme>,
  index: number,
  direction: -1 | 1,
) {
  const entries = Object.entries(themes);
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= entries.length) {
    return themes;
  }
  const [entry] = entries.splice(index, 1);
  entries.splice(targetIndex, 0, entry);
  return Object.fromEntries(entries);
}

export function ThemesSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const quickCommand = config.quickCommand ?? {};
  const themes = quickCommand.themes ?? {};
  const themeNames = Object.keys(themes);
  const [selectedIndex, setSelectedIndex] = React.useState(
    themeNames.length > 0 ? 0 : -1,
  );
  const selectedName = themeNames[selectedIndex];
  const selectedTheme = selectedName ? themes[selectedName] : undefined;
  const [nameDraft, setNameDraft] = React.useState(selectedName ?? '');

  React.useEffect(() => {
    if (themeNames.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex < 0 || selectedIndex >= themeNames.length) {
      setSelectedIndex(Math.max(0, themeNames.length - 1));
    }
  }, [selectedIndex, themeNames.length]);

  React.useEffect(() => {
    setNameDraft(selectedName ?? '');
  }, [selectedName]);

  const updateThemes = (
    nextThemes: Record<string, QuickCommandCustomTheme>,
    selectedThemeName = quickCommand.theme,
  ) =>
    onChange({
      ...config,
      quickCommand: {
        ...quickCommand,
        theme: selectedThemeName,
        themes: nextThemes,
      },
    });

  const updateSelectedTheme = (patch: Partial<QuickCommandCustomTheme>) => {
    if (!selectedName || !selectedTheme) return;
    updateThemes({
      ...themes,
      [selectedName]: { ...selectedTheme, ...patch },
    });
  };

  const renameSelectedTheme = () => {
    const nextName = nameDraft.trim();
    if (
      !selectedName ||
      !selectedTheme ||
      !nextName ||
      (nextName !== selectedName && themes[nextName])
    ) {
      setNameDraft(selectedName ?? '');
      return;
    }
    if (nextName === selectedName) return;

    const nextThemes = Object.fromEntries(
      Object.entries(themes).map(([name, theme]) =>
        name === selectedName ? [nextName, theme] : [name, theme],
      ),
    );
    updateThemes(
      nextThemes,
      quickCommand.theme === selectedName ? nextName : quickCommand.theme,
    );
  };

  const tokenEntries = Object.entries(selectedTheme?.tokens ?? {}) as Array<
    [QuickCommandThemeToken, QuickCommandThemeTokenValue]
  >;

  return (
    <div className="settings-section settings-section--workspace">
      <div className="settings-section-heading">
        <h2>Custom Themes</h2>
      </div>
      <div className="settings-master-detail">
        <aside className="settings-collection-pane">
          <CollectionToolbar
            itemCount={themeNames.length}
            selectedIndex={selectedIndex}
            onAdd={() => {
              const name = createUniqueName('custom-theme', themeNames);
              updateThemes({
                ...themes,
                [name]: { extends: DEFAULT_QUICK_COMMAND_THEME, tokens: {} },
              });
              setSelectedIndex(themeNames.length);
            }}
            onDelete={() => {
              if (!selectedName) return;
              const nextThemes = { ...themes };
              delete nextThemes[selectedName];
              updateThemes(
                nextThemes,
                quickCommand.theme === selectedName
                  ? DEFAULT_QUICK_COMMAND_THEME
                  : quickCommand.theme,
              );
              setSelectedIndex(Math.min(selectedIndex, themeNames.length - 2));
            }}
            onDuplicate={() => {
              if (!selectedName || !selectedTheme) return;
              const name = createUniqueName(`${selectedName}-copy`, themeNames);
              const nextEntries = Object.entries(themes);
              nextEntries.splice(selectedIndex + 1, 0, [
                name,
                cloneConfigValue(selectedTheme),
              ]);
              updateThemes(Object.fromEntries(nextEntries));
              setSelectedIndex(selectedIndex + 1);
            }}
            onMove={(direction) => {
              updateThemes(
                reorderThemeRecord(themes, selectedIndex, direction),
              );
              setSelectedIndex(selectedIndex + direction);
            }}
          />
          <div className="settings-collection-list">
            {themeNames.map((name, index) => (
              <button
                className={`settings-collection-item ${
                  index === selectedIndex ? 'is-selected' : ''
                }`}
                key={name}
                type="button"
                onClick={() => setSelectedIndex(index)}
              >
                <span>{name}</span>
                <small>{themes[name].extends || 'alfred-classic'}</small>
              </button>
            ))}
          </div>
        </aside>
        <div className="settings-detail-pane">
          {selectedTheme ? (
            <div className="settings-form">
              <div className="settings-field-grid">
                <label className="settings-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={nameDraft}
                    onBlur={renameSelectedTheme}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </label>
                <SelectField
                  label="Extends"
                  options={QUICK_COMMAND_PRESET_THEMES.map((preset) => ({
                    label: preset,
                    value: preset,
                  }))}
                  value={selectedTheme.extends ?? DEFAULT_QUICK_COMMAND_THEME}
                  onChange={(extendsTheme) =>
                    updateSelectedTheme({
                      extends: extendsTheme as QuickCommandPresetTheme,
                    })
                  }
                />
              </div>
              <div className="settings-subsection">
                <div className="settings-subsection-header">
                  <h3>Tokens</h3>
                  <IconButton
                    disabled={tokenEntries.length >= THEME_TOKENS.length}
                    label="Add token"
                    onClick={() => {
                      const usedTokens = new Set(
                        tokenEntries.map(([token]) => token),
                      );
                      const token = THEME_TOKENS.find(
                        (candidate) => !usedTokens.has(candidate),
                      );
                      if (token) {
                        updateSelectedTheme({
                          tokens: {
                            ...(selectedTheme.tokens ?? {}),
                            [token]: '',
                          },
                        });
                      }
                    }}
                  >
                    <Plus size={16} />
                  </IconButton>
                </div>
                <div className="settings-table settings-token-table">
                  {tokenEntries.map(([token, value]) => (
                    <div
                      className="settings-table-row settings-token-row"
                      key={token}
                    >
                      <select
                        aria-label="Theme token"
                        value={token}
                        onChange={(event) => {
                          const nextToken = event.target
                            .value as QuickCommandThemeToken;
                          const nextTokens = {
                            ...(selectedTheme.tokens ?? {}),
                          };
                          delete nextTokens[token];
                          nextTokens[nextToken] = value;
                          updateSelectedTheme({ tokens: nextTokens });
                        }}
                      >
                        {THEME_TOKENS.map((candidate) => (
                          <option
                            disabled={
                              candidate !== token &&
                              Object.prototype.hasOwnProperty.call(
                                selectedTheme.tokens ?? {},
                                candidate,
                              )
                            }
                            key={candidate}
                            value={candidate}
                          >
                            {candidate}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Theme token value"
                        type="text"
                        value={String(value)}
                        onChange={(event) =>
                          updateSelectedTheme({
                            tokens: {
                              ...(selectedTheme.tokens ?? {}),
                              [token]: parseThemeTokenValue(
                                token,
                                event.target.value,
                              ),
                            },
                          })
                        }
                      />
                      <IconButton
                        danger
                        label="Delete token"
                        onClick={() => {
                          const nextTokens = {
                            ...(selectedTheme.tokens ?? {}),
                          };
                          delete nextTokens[token];
                          updateSelectedTheme({ tokens: nextTokens });
                        }}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  ))}
                  {tokenEntries.length === 0 ? (
                    <div className="settings-empty-row">No overrides</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="settings-empty-state">No custom themes</div>
          )}
        </div>
      </div>
    </div>
  );
}

const MENU_KIND_LABELS: Record<MenuItemKind, string> = {
  'browser-window': 'Browser Window',
  'copy-value': 'Copy Value',
  'execute-command': 'Execute Command',
  'quit-app': 'Quit App',
  submenu: 'Submenu',
  separator: 'Separator',
};

function getMenuItemKind(item: MenuItemEditorConfig): MenuItemKind {
  if (item.type === 'separator') return 'separator';
  if (item.type === 'submenu' || Array.isArray(item.submenu)) return 'submenu';
  return item.action ?? 'browser-window';
}

interface MenuItemEditorProps {
  item: MenuItemEditorConfig;
  onChange: (item: MenuItemEditorConfig) => void;
}

function MenuItemEditor({ item, onChange }: MenuItemEditorProps) {
  const kind = getMenuItemKind(item);
  const update = (patch: Partial<MenuItemEditorConfig>) =>
    onChange({ ...item, ...patch });
  const updateKind = (nextKind: MenuItemKind) => {
    if (nextKind === 'submenu') {
      onChange({
        ...item,
        action: undefined,
        type: 'submenu',
        submenu: item.submenu ?? [],
      });
    } else if (nextKind === 'separator') {
      onChange({
        ...item,
        action: undefined,
        type: 'separator',
        submenu: undefined,
      });
    } else {
      onChange({
        ...item,
        action: nextKind,
        type: undefined,
        submenu: undefined,
      });
    }
  };

  return (
    <div className="settings-form">
      <div className="settings-field-grid">
        <TextField
          disabled={kind === 'separator'}
          label="Label"
          value={item.label}
          onChange={(label) => update({ label })}
        />
        <SelectField
          label="Type"
          options={MENU_ITEM_KINDS.map((itemKind) => ({
            label: MENU_KIND_LABELS[itemKind],
            value: itemKind,
          }))}
          value={kind}
          onChange={(itemKind) => updateKind(itemKind as MenuItemKind)}
        />
      </div>

      {!['separator', 'submenu'].includes(kind) ? (
        <NumberField
          label="Max label length"
          min={1}
          value={item.maxLabelLength}
          onChange={(maxLabelLength) => update({ maxLabelLength })}
        />
      ) : null}

      {kind === 'browser-window' ? (
        <>
          <TextField
            label="URL"
            value={item.url}
            onChange={(url) => update({ url })}
          />
          <WindowSizeEditor
            size={item.size}
            onChange={(size) => update({ size })}
          />
        </>
      ) : null}

      {kind === 'copy-value' ? (
        <>
          <TextField
            label="Shell command"
            value={item.command}
            onChange={(command) => update({ command })}
          />
          <TextField
            multiline
            label="Value"
            value={item.value}
            onChange={(value) => update({ value })}
          />
          <NumberField
            label="Auto update interval"
            min={0}
            value={item.autoUpdateInterval}
            onChange={(autoUpdateInterval) => update({ autoUpdateInterval })}
          />
        </>
      ) : null}

      {kind === 'execute-command' ? (
        <TextField
          multiline
          label="Command"
          value={item.command}
          onChange={(command) => update({ command })}
        />
      ) : null}
    </div>
  );
}

export function TrayMenuSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const menus = React.useMemo(() => config.menus ?? [], [config.menus]);
  const flatItems = flattenMenuItems(menus);
  const [selectedPath, setSelectedPath] = React.useState<MenuPath>(
    flatItems[0]?.path ?? [],
  );
  const selectedItem = getMenuItemAtPath(menus, selectedPath);
  const selectedKey = menuPathKey(selectedPath);
  const parentPath = selectedPath.slice(0, -1);
  const siblingIndex = selectedPath[selectedPath.length - 1] ?? -1;
  const siblings =
    parentPath.length === 0
      ? menus
      : (getMenuItemAtPath(menus, parentPath)?.submenu ?? []);

  React.useEffect(() => {
    if (!getMenuItemAtPath(menus, selectedPath)) {
      setSelectedPath(flattenMenuItems(menus)[0]?.path ?? []);
    }
  }, [menus, selectedKey, selectedPath]);

  const updateMenus = (nextMenus: MenuItemEditorConfig[]) =>
    onChange({ ...config, menus: nextMenus });

  return (
    <div className="settings-section settings-section--workspace">
      <div className="settings-section-heading">
        <h2>Tray Menu</h2>
      </div>
      <div className="settings-master-detail">
        <aside className="settings-collection-pane">
          <div className="settings-collection-toolbar">
            <IconButton
              label="Add menu item"
              onClick={() => {
                updateMenus([
                  ...menus,
                  {
                    label: 'New Menu Item',
                    action: 'browser-window',
                    url: '',
                  },
                ]);
                setSelectedPath([menus.length]);
              }}
            >
              <Plus size={16} />
            </IconButton>
            <IconButton
              disabled={
                getMenuItemKind(selectedItem ?? { label: '' }) !== 'submenu'
              }
              label="Add submenu item"
              onClick={() => {
                if (
                  !selectedItem ||
                  getMenuItemKind(selectedItem) !== 'submenu'
                ) {
                  return;
                }
                const childIndex = selectedItem.submenu?.length ?? 0;
                updateMenus(
                  insertMenuItemAtPath(menus, selectedPath, {
                    label: 'New Menu Item',
                    action: 'browser-window',
                    url: '',
                  }),
                );
                setSelectedPath([...selectedPath, childIndex]);
              }}
            >
              <ListPlus size={16} />
            </IconButton>
            <span className="settings-toolbar-spacer" />
            <IconButton
              disabled={!selectedItem}
              label="Duplicate"
              onClick={() => {
                if (!selectedItem) return;
                updateMenus(
                  updateMenuCollection(menus, parentPath, (items) => {
                    const nextItems = [...items];
                    nextItems.splice(
                      siblingIndex + 1,
                      0,
                      cloneConfigValue(selectedItem),
                    );
                    return nextItems;
                  }),
                );
                setSelectedPath([...parentPath, siblingIndex + 1]);
              }}
            >
              <Copy size={15} />
            </IconButton>
            <IconButton
              disabled={!selectedItem || siblingIndex <= 0}
              label="Move up"
              onClick={() => {
                updateMenus(moveMenuItemAtPath(menus, selectedPath, -1));
                setSelectedPath([...parentPath, siblingIndex - 1]);
              }}
            >
              <ChevronUp size={16} />
            </IconButton>
            <IconButton
              disabled={!selectedItem || siblingIndex >= siblings.length - 1}
              label="Move down"
              onClick={() => {
                updateMenus(moveMenuItemAtPath(menus, selectedPath, 1));
                setSelectedPath([...parentPath, siblingIndex + 1]);
              }}
            >
              <ChevronDown size={16} />
            </IconButton>
            <IconButton
              danger
              disabled={!selectedItem}
              label="Delete"
              onClick={() => {
                updateMenus(removeMenuItemAtPath(menus, selectedPath));
                setSelectedPath(parentPath);
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
          <div className="settings-collection-list">
            {flatItems.map(({ depth, item, path }) => {
              const pathKey = menuPathKey(path);
              return (
                <button
                  className={`settings-collection-item settings-menu-item ${
                    pathKey === selectedKey ? 'is-selected' : ''
                  }`}
                  key={pathKey}
                  style={{ paddingLeft: 12 + depth * 18 }}
                  type="button"
                  onClick={() => setSelectedPath(path)}
                >
                  <span>
                    {item.label || MENU_KIND_LABELS[getMenuItemKind(item)]}
                  </span>
                  <small>{MENU_KIND_LABELS[getMenuItemKind(item)]}</small>
                </button>
              );
            })}
          </div>
        </aside>
        <div className="settings-detail-pane">
          {selectedItem ? (
            <MenuItemEditor
              item={selectedItem}
              onChange={(item) =>
                updateMenus(
                  updateMenuItemAtPath(menus, selectedPath, () => item),
                )
              }
            />
          ) : (
            <div className="settings-empty-state">No menu items</div>
          )}
        </div>
      </div>
    </div>
  );
}
