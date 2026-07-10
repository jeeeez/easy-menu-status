export const QUICK_COMMAND_PRESET_THEMES = [
  'alfred-classic',
  'macos-glass',
  'spotlight-light',
  'minimal-mono',
  'neo-brutalism',
  'fluent-mica',
  'material-expressive',
  'terminal',
  'catppuccin',
  'nord',
  'dracula',
] as const;

export type QuickCommandPresetTheme =
  (typeof QUICK_COMMAND_PRESET_THEMES)[number];

export const DEFAULT_QUICK_COMMAND_THEME: QuickCommandPresetTheme =
  'alfred-classic';

export const QUICK_COMMAND_THEME_TOKEN_CSS_VARIABLES = {
  'color.panel': '--quick-command-panel-background',
  'color.panelRaised': '--quick-command-item-active-background',
  'color.input': '--quick-command-input-background',
  'color.inputFocus': '--quick-command-input-focus-background',
  'color.inputText': '--quick-command-input-text',
  'color.text': '--quick-command-text',
  'color.muted': '--quick-command-muted',
  'color.border': '--quick-command-border',
  'color.accent': '--quick-command-accent',
  'color.accentStrong': '--quick-command-accent-strong',
  'color.danger': '--quick-command-danger',
  'color.item': '--quick-command-item-background',
  'color.itemHover': '--quick-command-item-hover-background',
  'color.itemActive': '--quick-command-item-active-background',
  'color.itemActiveText': '--quick-command-item-active-text',
  'color.tag': '--quick-command-tag-background',
  'color.tagText': '--quick-command-tag-text',
  'color.tagActive': '--quick-command-tag-active-background',
  'color.tagActiveText': '--quick-command-tag-active-text',
  'color.placeholder': '--quick-command-placeholder',
  'color.selection': '--quick-command-selection',
  'color.icon': '--quick-command-icon-background',
  'color.iconGlyph': '--quick-command-icon-glyph',
  'radius.panel': '--quick-command-panel-radius',
  'radius.input': '--quick-command-input-radius',
  'radius.item': '--quick-command-item-radius',
  'radius.tag': '--quick-command-tag-radius',
  'radius.icon': '--quick-command-icon-radius',
  'border.panelWidth': '--quick-command-panel-border-width',
  'border.inputWidth': '--quick-command-input-border-width',
  'border.itemWidth': '--quick-command-item-border-width',
  'density.itemHeight': '--quick-command-item-height',
  'density.inputMinHeight': '--quick-command-input-min-height',
  'density.pagePadding': '--quick-command-page-padding',
  'typography.fontFamily': '--quick-command-font-family',
  'typography.inputSize': '--quick-command-input-font-size',
  'typography.inputWeight': '--quick-command-input-font-weight',
  'typography.itemSize': '--quick-command-item-font-size',
  'effect.blur': '--quick-command-panel-blur',
  'effect.saturation': '--quick-command-panel-saturation',
  'effect.panelShadow': '--quick-command-panel-shadow',
  'effect.inputShadow': '--quick-command-input-shadow',
  'effect.activeShadow': '--quick-command-item-active-shadow',
  'motion.duration': '--quick-command-motion-duration',
} as const;

export type QuickCommandThemeToken =
  keyof typeof QUICK_COMMAND_THEME_TOKEN_CSS_VARIABLES;
export type QuickCommandThemeTokenValue = string | number;
export type QuickCommandThemeTokens = Partial<
  Record<QuickCommandThemeToken, QuickCommandThemeTokenValue>
>;

export interface QuickCommandCustomTheme {
  extends?: QuickCommandPresetTheme;
  tokens?: QuickCommandThemeTokens;
}

export interface QuickCommandResolvedTheme {
  name: string;
  preset: QuickCommandPresetTheme;
  tokens: Partial<Record<QuickCommandThemeToken, string>>;
}

const PRESET_THEME_SET = new Set<string>(QUICK_COMMAND_PRESET_THEMES);
const NUMBER_TOKEN_UNITS: Partial<
  Record<QuickCommandThemeToken, '' | 'ms' | 'px'>
> = {
  'radius.panel': 'px',
  'radius.input': 'px',
  'radius.item': 'px',
  'radius.tag': 'px',
  'radius.icon': 'px',
  'border.panelWidth': 'px',
  'border.inputWidth': 'px',
  'border.itemWidth': 'px',
  'density.itemHeight': 'px',
  'density.inputMinHeight': 'px',
  'density.pagePadding': 'px',
  'typography.inputSize': 'px',
  'typography.inputWeight': '',
  'typography.itemSize': 'px',
  'effect.blur': 'px',
  'effect.saturation': '',
  'motion.duration': 'ms',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isQuickCommandPresetTheme(
  value: unknown,
): value is QuickCommandPresetTheme {
  return typeof value === 'string' && PRESET_THEME_SET.has(value);
}

function normalizeThemeTokenValue(
  token: QuickCommandThemeToken,
  value: unknown,
) {
  if (typeof value === 'number') {
    const unit = NUMBER_TOKEN_UNITS[token];
    if (!Number.isFinite(value) || unit === undefined) {
      return null;
    }
    return `${value}${unit}`;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  if (
    !normalizedValue ||
    normalizedValue.length > 320 ||
    /[;{}<>]/.test(normalizedValue) ||
    /(?:expression|url)\s*\(/i.test(normalizedValue)
  ) {
    return null;
  }

  return normalizedValue;
}

function normalizeThemeTokens(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<
    Partial<Record<QuickCommandThemeToken, string>>
  >((tokens, [rawToken, rawValue]) => {
    if (!(rawToken in QUICK_COMMAND_THEME_TOKEN_CSS_VARIABLES)) {
      return tokens;
    }

    const token = rawToken as QuickCommandThemeToken;
    const normalizedValue = normalizeThemeTokenValue(token, rawValue);
    if (normalizedValue !== null) {
      tokens[token] = normalizedValue;
    }
    return tokens;
  }, {});
}

export function normalizeQuickCommandTheme(
  selectedTheme: unknown,
  customThemes: unknown,
): QuickCommandResolvedTheme {
  const requestedName =
    typeof selectedTheme === 'string' && selectedTheme.trim()
      ? selectedTheme.trim()
      : DEFAULT_QUICK_COMMAND_THEME;

  if (isQuickCommandPresetTheme(requestedName)) {
    return { name: requestedName, preset: requestedName, tokens: {} };
  }

  const customTheme = isRecord(customThemes)
    ? customThemes[requestedName]
    : undefined;
  if (!isRecord(customTheme)) {
    return {
      name: DEFAULT_QUICK_COMMAND_THEME,
      preset: DEFAULT_QUICK_COMMAND_THEME,
      tokens: {},
    };
  }

  const preset = isQuickCommandPresetTheme(customTheme.extends)
    ? customTheme.extends
    : DEFAULT_QUICK_COMMAND_THEME;

  return {
    name: requestedName,
    preset,
    tokens: normalizeThemeTokens(customTheme.tokens),
  };
}

export function getQuickCommandThemeCssVariables(
  tokens: QuickCommandResolvedTheme['tokens'],
) {
  return Object.entries(tokens).reduce<Record<string, string>>(
    (cssVariables, [rawToken, value]) => {
      const token = rawToken as QuickCommandThemeToken;
      const cssVariable = QUICK_COMMAND_THEME_TOKEN_CSS_VARIABLES[token];
      if (cssVariable && value) {
        cssVariables[cssVariable] = value;
      }
      return cssVariables;
    },
    {},
  );
}
