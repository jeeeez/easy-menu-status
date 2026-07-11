import React from 'react';
import {
  AppWindow,
  Command,
  Compass,
  Globe2,
  ListTree,
  Menu as MenuIcon,
  Palette,
  RefreshCw,
  Save,
  Settings2,
} from 'lucide-react';
import { EasyTrayEditorConfig } from '../../shared/config';
import {
  CommandsSettingsSection,
  WebSearchSettingsSection,
} from '../settings/CommandAndSearchSections';
import {
  GeneralSettingsSection,
  OpenInBrowserSettingsSection,
  QuickCommandSettingsSection,
} from '../settings/SettingsCoreSections';
import {
  ThemesSettingsSection,
  TrayMenuSettingsSection,
} from '../settings/ThemeAndMenuSections';
import { normalizeEditorConfig } from '../settings/config-utils';

type SettingsSectionId =
  | 'general'
  | 'quick-command'
  | 'commands'
  | 'open-in-browser'
  | 'web-search'
  | 'tray-menu'
  | 'themes';

const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', icon: AppWindow },
  { id: 'quick-command', label: 'Quick Command', icon: Command },
  { id: 'commands', label: 'Commands', icon: ListTree },
  { id: 'open-in-browser', label: 'Open in Browser', icon: Compass },
  { id: 'web-search', label: 'Web Search', icon: Globe2 },
  { id: 'tray-menu', label: 'Tray Menu', icon: MenuIcon },
  { id: 'themes', label: 'Custom Themes', icon: Palette },
] as const;

const PREVIEW_CONFIG: EasyTrayEditorConfig = {
  icon: { name: 'cat', width: 24, height: 24 },
  title: 'EasyTray',
  description: 'Command launcher',
  menus: [
    {
      label: 'Open EasyTray',
      action: 'browser-window',
      url: 'https://example.com',
      size: 'right',
    },
    {
      label: 'Tools',
      type: 'submenu',
      submenu: [
        {
          label: 'Copy Email',
          action: 'copy-value',
          value: 'name@example.com',
        },
      ],
    },
  ],
  quickCommand: {
    enabled: true,
    shortcut: 'CommandOrControl+Space',
    defaultCommand: 'g',
    theme: 'macos-glass',
    openInBrowser: {
      interceptSystemLinks: true,
      registerAsDefaultBrowser: false,
      profiles: [
        {
          id: 'Profile-1',
          name: 'Work',
          profileDirectory: 'Profile 9',
          path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        },
      ],
      domainProfiles: [
        { domains: ['example.com', '*.example.com'], profileId: 'Profile-1' },
      ],
      defaultProfileId: 'Profile-1',
    },
    commands: [
      {
        name: 'Settings',
        label: 'Open Settings',
        aliases: ['config'],
        description: 'Open',
        action: 'open-settings',
        requiresInput: false,
      },
      {
        name: 'chrome',
        label: 'Chrome Profile',
        aliases: ['c'],
        description: 'Chrome',
        action: 'open-in-browser',
      },
    ],
    webSearch: {
      enabled: true,
      defaultEngine: 'g',
      engines: [
        {
          name: 'Google',
          command: 'g',
          aliases: ['google'],
          url: 'https://www.google.com/search?q={{query}}',
          openIn: 'external',
        },
      ],
    },
    themes: {},
  },
};

export function SettingPage() {
  const settingsBridge = window.electron?.settings;
  const [activeSection, setActiveSection] =
    React.useState<SettingsSectionId>('general');
  const [config, setConfig] = React.useState<EasyTrayEditorConfig | null>(null);
  const [savedConfig, setSavedConfig] =
    React.useState<EasyTrayEditorConfig | null>(null);
  const [configPath, setConfigPath] = React.useState('');
  const [backupPath, setBackupPath] = React.useState('');
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const loadConfig = React.useCallback(async () => {
    setError('');
    setSaved(false);
    if (!settingsBridge) {
      const previewConfig = normalizeEditorConfig(PREVIEW_CONFIG);
      setConfig(previewConfig);
      setSavedConfig(previewConfig);
      setConfigPath('Browser preview');
      return;
    }

    const result = await settingsBridge.load();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const nextConfig = normalizeEditorConfig(result.snapshot.config);
    setConfig(nextConfig);
    setSavedConfig(nextConfig);
    setConfigPath(result.snapshot.path);
    setBackupPath(result.snapshot.backupPath);
  }, [settingsBridge]);

  React.useEffect(() => {
    document.title = 'EasyTray Settings';
    loadConfig();
  }, [loadConfig]);

  const isDirty =
    config !== null &&
    savedConfig !== null &&
    JSON.stringify(config) !== JSON.stringify(savedConfig);

  const saveConfig = React.useCallback(async () => {
    if (!settingsBridge || !config || saving) {
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    const result = await settingsBridge.save(config);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const nextConfig = normalizeEditorConfig(result.snapshot.config);
    setConfig(nextConfig);
    setSavedConfig(nextConfig);
    setConfigPath(result.snapshot.path);
    setBackupPath(result.snapshot.backupPath);
    setSaved(true);
  }, [config, saving, settingsBridge]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (isDirty) {
          saveConfig();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty, saveConfig]);

  const currentSection = SETTINGS_SECTIONS.find(
    (section) => section.id === activeSection,
  );
  let saveStateLabel = 'Up to date';
  if (isDirty) {
    saveStateLabel = 'Unsaved changes';
  } else if (saved) {
    saveStateLabel = 'Saved';
  }

  const renderSection = () => {
    if (!config) return null;
    switch (activeSection) {
      case 'quick-command':
        return (
          <QuickCommandSettingsSection config={config} onChange={setConfig} />
        );
      case 'commands':
        return <CommandsSettingsSection config={config} onChange={setConfig} />;
      case 'open-in-browser':
        return (
          <OpenInBrowserSettingsSection config={config} onChange={setConfig} />
        );
      case 'web-search':
        return (
          <WebSearchSettingsSection config={config} onChange={setConfig} />
        );
      case 'tray-menu':
        return <TrayMenuSettingsSection config={config} onChange={setConfig} />;
      case 'themes':
        return <ThemesSettingsSection config={config} onChange={setConfig} />;
      case 'general':
      default:
        return <GeneralSettingsSection config={config} onChange={setConfig} />;
    }
  };

  if (!config && error) {
    return (
      <main className="settings-load-error">
        <Settings2 size={28} />
        <strong>Unable to load configuration</strong>
        <span>{error}</span>
        <button type="button" onClick={loadConfig}>
          <RefreshCw size={16} />
          Reload
        </button>
      </main>
    );
  }

  return (
    <div className="settings-page">
      <aside className="settings-sidebar">
        <div className="settings-brand">
          <span className="settings-brand-mark">
            <Settings2 size={18} />
          </span>
          <strong>EasyTray</strong>
        </div>
        <nav aria-label="Settings sections" className="settings-navigation">
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                aria-current={activeSection === section.id ? 'page' : undefined}
                className={activeSection === section.id ? 'is-active' : ''}
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                <Icon size={16} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="settings-sidebar-path" title={configPath}>
          {configPath}
        </div>
      </aside>
      <main className="settings-main">
        <header className="settings-header">
          <div>
            <h1>{currentSection?.label}</h1>
            <span
              className={`settings-save-state ${isDirty ? 'is-dirty' : ''}`}
            >
              {saveStateLabel}
            </span>
          </div>
          <div className="settings-header-actions">
            <button
              aria-label="Reload configuration"
              className="settings-icon-button"
              disabled={saving}
              title="Reload configuration"
              type="button"
              onClick={loadConfig}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="settings-save-button"
              disabled={!settingsBridge || !isDirty || saving}
              type="button"
              onClick={saveConfig}
            >
              <Save size={16} />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </header>
        <div className="settings-content">
          {config ? (
            renderSection()
          ) : (
            <div className="settings-loading">Loading</div>
          )}
        </div>
        <footer className="settings-statusbar">
          <span className={error ? 'is-error' : ''}>{error || configPath}</span>
          <span title={backupPath}>{backupPath ? 'Backup ready' : ''}</span>
        </footer>
      </main>
    </div>
  );
}
