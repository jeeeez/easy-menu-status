import React from 'react';
import {
  EasyTrayEditorConfig,
  QUICK_COMMAND_ACTIONS,
  QuickCommandEditorEntry,
  WebSearchEngineEditorConfig,
} from '../../shared/config';
import {
  CollectionToolbar,
  NumberField,
  ProfilesEditor,
  SelectField,
  TextField,
  ToggleField,
  WindowSizeEditor,
} from './SettingsControls';
import {
  cloneConfigValue,
  createUniqueName,
  formatStringList,
  moveArrayItem,
  parseStringList,
} from './config-utils';

interface ConfigSectionProps {
  config: EasyTrayEditorConfig;
  onChange: (config: EasyTrayEditorConfig) => void;
}

const ACTION_LABELS: Record<QuickCommandEditorEntry['action'], string> = {
  'web-search': 'Web Search',
  'browser-window': 'Browser Window',
  'copy-value': 'Copy Value',
  'execute-command': 'Execute Command',
  'open-chrome-profile': 'Chrome Profile',
  'open-settings': 'Open Settings',
  'quit-app': 'Quit App',
};

interface CommandEntryEditorProps {
  entry: QuickCommandEditorEntry;
  onChange: (entry: QuickCommandEditorEntry) => void;
}

function CommandEntryEditor({ entry, onChange }: CommandEntryEditorProps) {
  const update = (patch: Partial<QuickCommandEditorEntry>) =>
    onChange({ ...entry, ...patch });

  return (
    <div className="settings-form">
      <div className="settings-field-grid settings-field-grid--three">
        <TextField
          label="Name"
          value={entry.name}
          onChange={(name) => update({ name })}
        />
        <TextField
          label="Label"
          value={entry.label}
          onChange={(label) => update({ label })}
        />
        <SelectField
          label="Action"
          options={QUICK_COMMAND_ACTIONS.map((action) => ({
            label: ACTION_LABELS[action],
            value: action,
          }))}
          value={entry.action}
          onChange={(action) => {
            const nextAction = action as QuickCommandEditorEntry['action'];
            update({
              action: nextAction,
              command: ['copy-value', 'execute-command'].includes(nextAction)
                ? entry.command
                : undefined,
            });
          }}
        />
      </div>
      <div className="settings-field-grid">
        <TextField
          label="Aliases"
          placeholder="alias-one, alias-two"
          value={formatStringList(entry.aliases)}
          onChange={(aliases) => update({ aliases: parseStringList(aliases) })}
        />
        <TextField
          label="Description"
          value={entry.description}
          onChange={(description) => update({ description })}
        />
      </div>
      <ToggleField
        checked={entry.requiresInput}
        label="Requires input"
        onChange={(requiresInput) => update({ requiresInput })}
      />

      {['web-search', 'browser-window', 'open-chrome-profile'].includes(
        entry.action,
      ) ? (
        <TextField
          label="URL"
          placeholder="https://example.com/{{query}}"
          value={entry.url}
          onChange={(url) => update({ url })}
        />
      ) : null}

      {entry.action === 'web-search' ? (
        <SelectField
          label="Open in"
          options={[
            { label: 'External browser', value: 'external' },
            { label: 'EasyTray window', value: 'browser-window' },
          ]}
          value={entry.openIn ?? 'external'}
          onChange={(openIn) =>
            update({ openIn: openIn as 'external' | 'browser-window' })
          }
        />
      ) : null}

      {entry.action === 'copy-value' ? (
        <>
          <TextField
            label="Command"
            value={entry.command}
            onChange={(command) => update({ command })}
          />
          <TextField
            multiline
            label="Value"
            value={entry.value}
            onChange={(value) => update({ value })}
          />
          <NumberField
            label="Auto update interval"
            min={0}
            value={entry.autoUpdateInterval}
            onChange={(autoUpdateInterval) => update({ autoUpdateInterval })}
          />
        </>
      ) : null}

      {entry.action === 'execute-command' ? (
        <TextField
          multiline
          label="Command"
          value={entry.command}
          onChange={(command) => update({ command })}
        />
      ) : null}

      {entry.action === 'open-chrome-profile' ? (
        <>
          <div className="settings-field-grid">
            <TextField
              label="Default Chrome profile"
              value={entry.defaultProfile}
              onChange={(defaultProfile) => update({ defaultProfile })}
            />
            <TextField
              label="Chrome path"
              value={entry.chromePath}
              onChange={(chromePath) => update({ chromePath })}
            />
          </div>
          <ProfilesEditor
            profiles={entry.profiles}
            onChange={(profiles) => update({ profiles })}
          />
        </>
      ) : null}

      {['web-search', 'browser-window'].includes(entry.action) ? (
        <WindowSizeEditor
          size={entry.size}
          onChange={(size) => update({ size })}
        />
      ) : null}
    </div>
  );
}

export function CommandsSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const quickCommand = config.quickCommand ?? {};
  const commands = quickCommand.commands ?? [];
  const [selectedIndex, setSelectedIndex] = React.useState(
    commands.length > 0 ? 0 : -1,
  );

  React.useEffect(() => {
    if (commands.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex < 0 || selectedIndex >= commands.length) {
      setSelectedIndex(Math.max(0, commands.length - 1));
    }
  }, [commands.length, selectedIndex]);

  const updateCommands = (nextCommands: QuickCommandEditorEntry[]) =>
    onChange({
      ...config,
      quickCommand: { ...quickCommand, commands: nextCommands },
    });
  const selectedCommand = commands[selectedIndex];

  const addCommand = () => {
    const name = createUniqueName(
      'new-command',
      commands.map((item) => item.name),
    );
    updateCommands([
      ...commands,
      {
        name,
        label: 'New Command',
        command: '',
        aliases: [],
        description: 'Run',
        action: 'execute-command',
        requiresInput: false,
      },
    ]);
    setSelectedIndex(commands.length);
  };

  return (
    <div className="settings-section settings-section--workspace">
      <div className="settings-section-heading">
        <h2>Commands</h2>
      </div>
      <div className="settings-master-detail">
        <aside className="settings-collection-pane">
          <CollectionToolbar
            itemCount={commands.length}
            selectedIndex={selectedIndex}
            onAdd={addCommand}
            onDelete={() => {
              updateCommands(
                commands.filter((_command, index) => index !== selectedIndex),
              );
              setSelectedIndex(Math.min(selectedIndex, commands.length - 2));
            }}
            onDuplicate={() => {
              if (!selectedCommand) return;
              const nextCommand = cloneConfigValue(selectedCommand);
              nextCommand.name = createUniqueName(
                nextCommand.name || 'command',
                commands.map((item) => item.name),
              );
              nextCommand.label = `${nextCommand.label} Copy`;
              const nextCommands = [...commands];
              nextCommands.splice(selectedIndex + 1, 0, nextCommand);
              updateCommands(nextCommands);
              setSelectedIndex(selectedIndex + 1);
            }}
            onMove={(direction) => {
              updateCommands(moveArrayItem(commands, selectedIndex, direction));
              setSelectedIndex(selectedIndex + direction);
            }}
          />
          <div className="settings-collection-list">
            {commands.map((command, index) => (
              <button
                className={`settings-collection-item ${
                  index === selectedIndex ? 'is-selected' : ''
                }`}
                key={command.name}
                type="button"
                onClick={() => setSelectedIndex(index)}
              >
                <span>{command.name || 'Untitled'}</span>
                <small>{command.label || command.action}</small>
              </button>
            ))}
          </div>
        </aside>
        <div className="settings-detail-pane">
          {selectedCommand ? (
            <CommandEntryEditor
              entry={selectedCommand}
              onChange={(entry) =>
                updateCommands(
                  commands.map((command, index) =>
                    index === selectedIndex ? entry : command,
                  ),
                )
              }
            />
          ) : (
            <div className="settings-empty-state">No commands</div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SearchEngineEditorProps {
  engine: WebSearchEngineEditorConfig;
  onChange: (engine: WebSearchEngineEditorConfig) => void;
}

function SearchEngineEditor({ engine, onChange }: SearchEngineEditorProps) {
  const update = (patch: Partial<WebSearchEngineEditorConfig>) =>
    onChange({ ...engine, ...patch });
  return (
    <div className="settings-form">
      <div className="settings-field-grid settings-field-grid--three">
        <TextField
          label="Name"
          value={engine.name}
          onChange={(name) => update({ name })}
        />
        <TextField
          label="Command"
          value={engine.command}
          onChange={(command) => update({ command })}
        />
        <SelectField
          label="Open in"
          options={[
            { label: 'External browser', value: 'external' },
            { label: 'EasyTray window', value: 'browser-window' },
          ]}
          value={engine.openIn ?? 'external'}
          onChange={(openIn) =>
            update({ openIn: openIn as 'external' | 'browser-window' })
          }
        />
      </div>
      <TextField
        label="Aliases"
        value={formatStringList(engine.aliases)}
        onChange={(aliases) => update({ aliases: parseStringList(aliases) })}
      />
      <TextField
        label="URL"
        placeholder="https://example.com/search?q={{query}}"
        value={engine.url}
        onChange={(url) => update({ url })}
      />
      <WindowSizeEditor
        size={engine.size}
        onChange={(size) => update({ size })}
      />
    </div>
  );
}

export function WebSearchSettingsSection({
  config,
  onChange,
}: ConfigSectionProps) {
  const quickCommand = config.quickCommand ?? {};
  const webSearch = quickCommand.webSearch ?? {};
  const engines = webSearch.engines ?? [];
  const [selectedIndex, setSelectedIndex] = React.useState(
    engines.length > 0 ? 0 : -1,
  );

  React.useEffect(() => {
    if (engines.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex < 0 || selectedIndex >= engines.length) {
      setSelectedIndex(Math.max(0, engines.length - 1));
    }
  }, [engines.length, selectedIndex]);

  const updateWebSearch = (patch: Partial<typeof webSearch>) =>
    onChange({
      ...config,
      quickCommand: {
        ...quickCommand,
        webSearch: { ...webSearch, ...patch },
      },
    });
  const selectedEngine = engines[selectedIndex];

  const addEngine = () => {
    const command = createUniqueName(
      'search',
      engines.map((engine) => engine.command ?? ''),
    );
    updateWebSearch({
      engines: [
        ...engines,
        {
          name: 'New Search',
          command,
          aliases: [],
          url: 'https://example.com/search?q={{query}}',
          openIn: 'external',
        },
      ],
    });
    setSelectedIndex(engines.length);
  };

  return (
    <div className="settings-section settings-section--workspace">
      <div className="settings-section-heading settings-section-heading--controls">
        <h2>Web Search</h2>
        <div className="settings-heading-controls">
          <ToggleField
            checked={webSearch.enabled}
            label="Enabled"
            onChange={(enabled) => updateWebSearch({ enabled })}
          />
          <SelectField
            label="Default engine"
            options={[
              { label: 'Automatic', value: '' },
              ...engines.map((engine) => ({
                label: engine.name,
                value: engine.command || engine.name,
              })),
            ]}
            value={webSearch.defaultEngine}
            onChange={(defaultEngine) => updateWebSearch({ defaultEngine })}
          />
        </div>
      </div>
      <div className="settings-master-detail">
        <aside className="settings-collection-pane">
          <CollectionToolbar
            itemCount={engines.length}
            selectedIndex={selectedIndex}
            onAdd={addEngine}
            onDelete={() => {
              updateWebSearch({
                engines: engines.filter(
                  (_engine, index) => index !== selectedIndex,
                ),
              });
              setSelectedIndex(Math.min(selectedIndex, engines.length - 2));
            }}
            onDuplicate={() => {
              if (!selectedEngine) return;
              const nextEngine = cloneConfigValue(selectedEngine);
              nextEngine.name = `${nextEngine.name} Copy`;
              nextEngine.command = createUniqueName(
                nextEngine.command || 'search',
                engines.map((engine) => engine.command ?? ''),
              );
              const nextEngines = [...engines];
              nextEngines.splice(selectedIndex + 1, 0, nextEngine);
              updateWebSearch({ engines: nextEngines });
              setSelectedIndex(selectedIndex + 1);
            }}
            onMove={(direction) => {
              updateWebSearch({
                engines: moveArrayItem(engines, selectedIndex, direction),
              });
              setSelectedIndex(selectedIndex + direction);
            }}
          />
          <div className="settings-collection-list">
            {engines.map((engine, index) => (
              <button
                className={`settings-collection-item ${
                  index === selectedIndex ? 'is-selected' : ''
                }`}
                key={engine.command || engine.name}
                type="button"
                onClick={() => setSelectedIndex(index)}
              >
                <span>{engine.name || 'Untitled'}</span>
                <small>{engine.command || 'search'}</small>
              </button>
            ))}
          </div>
        </aside>
        <div className="settings-detail-pane">
          {selectedEngine ? (
            <SearchEngineEditor
              engine={selectedEngine}
              onChange={(engine) =>
                updateWebSearch({
                  engines: engines.map((currentEngine, index) =>
                    index === selectedIndex ? engine : currentEngine,
                  ),
                })
              }
            />
          ) : (
            <div className="settings-empty-state">No search engines</div>
          )}
        </div>
      </div>
    </div>
  );
}
