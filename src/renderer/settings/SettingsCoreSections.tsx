import React from 'react';
import { EasyTrayEditorConfig } from '../../shared/config';
import {
  DEFAULT_QUICK_COMMAND_THEME,
  QUICK_COMMAND_PRESET_THEMES,
  QuickCommandPresetTheme,
} from '../../shared/quick-command-theme';
import {
  ComboField,
  NumberField,
  ProfilesEditor,
  TextField,
  ToggleField,
} from './SettingsControls';

interface ConfigSectionProps {
  config: EasyTrayEditorConfig;
  onChange: (config: EasyTrayEditorConfig) => void;
}

const THEME_LABELS: Record<QuickCommandPresetTheme, string> = {
  'alfred-classic': 'Alfred Classic',
  'macos-glass': 'macOS Glass',
  'spotlight-light': 'Spotlight Light',
  'minimal-mono': 'Minimal Mono',
  'neo-brutalism': 'Neo Brutalism',
  'fluent-mica': 'Fluent Mica',
  'material-expressive': 'Material Expressive',
  terminal: 'Terminal',
  catppuccin: 'Catppuccin',
  nord: 'Nord',
  dracula: 'Dracula',
};

const THEME_SWATCHES: Record<
  QuickCommandPresetTheme,
  [string, string, string]
> = {
  'alfred-classic': ['#20242c', '#f6f2ea', '#ffb454'],
  'macos-glass': ['#e2e8f1', '#ffffff', '#0a84ff'],
  'spotlight-light': ['#f6f6f8', '#ffffff', '#007aff'],
  'minimal-mono': ['#f8f8f6', '#111111', '#ffffff'],
  'neo-brutalism': ['#f5f1de', '#ffdd55', '#3155ff'],
  'fluent-mica': ['#e7eaef', '#ffffff', '#0067c0'],
  'material-expressive': ['#f7f5ef', '#cfe8e3', '#00796f'],
  terminal: ['#090d0a', '#13341f', '#74f7a1'],
  catppuccin: ['#1e1e2e', '#313244', '#74c7ec'],
  nord: ['#2e3440', '#434c5e', '#88c0d0'],
  dracula: ['#282a36', '#44475a', '#ff79c6'],
};

const TRAY_ICON_OPTIONS = [
  'cat',
  'flame',
  'snowflake',
  'figure.run.circle.fill',
] as const;

export function GeneralSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const icon =
    typeof config.icon === 'string'
      ? { name: config.icon, width: 16, height: 16 }
      : (config.icon ?? { name: '', width: 16, height: 16 });

  return (
    <div className="settings-section">
      <div className="settings-section-heading">
        <h2>General</h2>
      </div>
      <div className="settings-form settings-form--narrow">
        <div className="settings-field-grid">
          <TextField
            label="Title"
            value={config.title}
            onChange={(title) => onChange({ ...config, title })}
          />
          <TextField
            label="Description"
            value={config.description}
            onChange={(description) => onChange({ ...config, description })}
          />
        </div>
        <div className="settings-divider" />
        <div className="settings-field-grid settings-field-grid--three">
          <ComboField
            label="Icon"
            options={TRAY_ICON_OPTIONS}
            placeholder="Select or enter an icon/path"
            value={icon.name}
            onChange={(name) =>
              onChange({ ...config, icon: { ...icon, name } })
            }
          />
          <NumberField
            label="Icon width"
            min={8}
            value={icon.width}
            onChange={(width) =>
              onChange({
                ...config,
                icon: { ...icon, width: width ?? 16 },
              })
            }
          />
          <NumberField
            label="Icon height"
            min={8}
            value={icon.height}
            onChange={(height) =>
              onChange({
                ...config,
                icon: { ...icon, height: height ?? 16 },
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function QuickCommandSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const quickCommand = config.quickCommand ?? {};
  const customThemes = quickCommand.themes ?? {};
  const selectedTheme = quickCommand.theme ?? DEFAULT_QUICK_COMMAND_THEME;
  const updateQuickCommand = (patch: Partial<typeof quickCommand>) =>
    onChange({
      ...config,
      quickCommand: { ...quickCommand, ...patch },
    });

  return (
    <div className="settings-section">
      <div className="settings-section-heading">
        <h2>Quick Command</h2>
      </div>
      <div className="settings-form settings-form--narrow">
        <ToggleField
          checked={quickCommand.enabled}
          label="Enabled"
          onChange={(enabled) => updateQuickCommand({ enabled })}
        />
        <div className="settings-field-grid">
          <TextField
            label="Shortcut"
            placeholder="CommandOrControl+Space"
            value={quickCommand.shortcut}
            onChange={(shortcut) => updateQuickCommand({ shortcut })}
          />
          <TextField
            label="Default command"
            value={quickCommand.defaultCommand}
            onChange={(defaultCommand) =>
              updateQuickCommand({ defaultCommand })
            }
          />
        </div>
        <div className="settings-divider" />
        <div className="settings-field-label">Theme</div>
        <div
          aria-label="Theme"
          className="settings-theme-grid"
          role="radiogroup"
        >
          {QUICK_COMMAND_PRESET_THEMES.map((theme) => (
            <button
              aria-checked={selectedTheme === theme}
              className={`settings-theme-option ${
                selectedTheme === theme ? 'is-selected' : ''
              }`}
              key={theme}
              role="radio"
              type="button"
              onClick={() => updateQuickCommand({ theme })}
            >
              <span className="settings-theme-swatches">
                {THEME_SWATCHES[theme].map((color) => (
                  <span key={color} style={{ backgroundColor: color }} />
                ))}
              </span>
              <span>{THEME_LABELS[theme]}</span>
            </button>
          ))}
          {Object.entries(customThemes).map(([name, customTheme]) => {
            const preset =
              customTheme.extends &&
              QUICK_COMMAND_PRESET_THEMES.includes(customTheme.extends)
                ? customTheme.extends
                : DEFAULT_QUICK_COMMAND_THEME;
            return (
              <button
                aria-checked={selectedTheme === name}
                className={`settings-theme-option ${
                  selectedTheme === name ? 'is-selected' : ''
                }`}
                key={name}
                role="radio"
                type="button"
                onClick={() => updateQuickCommand({ theme: name })}
              >
                <span className="settings-theme-swatches">
                  {THEME_SWATCHES[preset].map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LinkRoutingSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const linkInterceptor = config.linkInterceptor ?? {};
  const updateLinkInterceptor = (patch: Partial<typeof linkInterceptor>) =>
    onChange({
      ...config,
      linkInterceptor: { ...linkInterceptor, ...patch },
    });

  return (
    <div className="settings-section">
      <div className="settings-section-heading">
        <h2>Link Routing</h2>
      </div>
      <div className="settings-form settings-form--narrow">
        <ToggleField
          checked={linkInterceptor.enabled}
          label="Enabled"
          onChange={(enabled) => updateLinkInterceptor({ enabled })}
        />
        <ToggleField
          checked={linkInterceptor.registerAsDefaultBrowser}
          label="Register as default browser"
          onChange={(registerAsDefaultBrowser) =>
            updateLinkInterceptor({ registerAsDefaultBrowser })
          }
        />
        <div className="settings-field-grid">
          <TextField
            label="Default Chrome profile"
            placeholder="Profile 1"
            value={linkInterceptor.defaultProfile}
            onChange={(defaultProfile) =>
              updateLinkInterceptor({ defaultProfile })
            }
          />
          <TextField
            label="Chrome path"
            placeholder="/Applications/Google Chrome.app/..."
            value={linkInterceptor.chromePath}
            onChange={(chromePath) => updateLinkInterceptor({ chromePath })}
          />
        </div>
        <ProfilesEditor
          profiles={linkInterceptor.profiles}
          onChange={(profiles) => updateLinkInterceptor({ profiles })}
        />
      </div>
    </div>
  );
}
