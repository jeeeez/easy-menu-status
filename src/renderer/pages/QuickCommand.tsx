import React from 'react';
import {
  DEFAULT_QUICK_COMMAND_THEME,
  QuickCommandResolvedTheme,
  getQuickCommandThemeCssVariables,
  isQuickCommandPresetTheme,
} from '../../shared/quick-command-theme';

type QuickCommandAction =
  | 'web-search'
  | 'browser-window'
  | 'copy-value'
  | 'execute-command'
  | 'open-chrome-profile'
  | 'open-settings'
  | 'quit-app';

interface QuickCommandEntry {
  name: string;
  label: string;
  aliases: string[];
  description?: string;
  action: QuickCommandAction;
  requiresInput?: boolean;
}

interface QuickCommandViewConfig {
  shortcut: string;
  defaultCommand: string;
  theme: QuickCommandResolvedTheme;
  commands: QuickCommandEntry[];
}

type QuickCommandStyle = React.CSSProperties & {
  [customProperty: `--${string}`]: string | number | undefined;
};

const COMMAND_TAG_MIN_WIDTH = 64;
const COMMAND_TAG_MAX_WIDTH = 136;
const COMMAND_TAG_CHARACTER_WIDTH = 9;
const COMMAND_TAG_HORIZONTAL_SPACE = 30;
const previewTheme = new URLSearchParams(window.location.search).get('theme');
const defaultPreviewTheme = isQuickCommandPresetTheme(previewTheme)
  ? previewTheme
  : DEFAULT_QUICK_COMMAND_THEME;

const MATCH_SCORE = {
  nameExact: 1000,
  aliasExact: 920,
  labelExact: 880,
  nameInputExtendsIdentifier: 860,
  namePrefix: 820,
  aliasInputExtendsIdentifier: 780,
  aliasPrefix: 740,
  labelPrefix: 700,
  labelWordPrefix: 660,
  nameContains: 520,
  aliasContains: 480,
  labelContains: 420,
};

const ACTION_LABELS: Record<QuickCommandAction, string> = {
  'web-search': 'Search',
  'browser-window': 'Open',
  'copy-value': 'Copy',
  'execute-command': 'Run',
  'open-chrome-profile': 'Chrome',
  'open-settings': 'Open',
  'quit-app': 'Quit',
};

const DEFAULT_CONFIG: QuickCommandViewConfig = {
  shortcut: '',
  defaultCommand: 'g',
  theme: {
    name: defaultPreviewTheme,
    preset: defaultPreviewTheme,
    tokens: {},
  },
  commands: [
    {
      name: 'g',
      label: 'Google',
      aliases: ['google', 'web', 'search'],
      description: 'Search the web',
      action: 'web-search',
    },
  ],
};

function getCommandIdentifiers(command: QuickCommandEntry) {
  return [command.name, ...command.aliases]
    .filter(Boolean)
    .map((identifier) => identifier.toLowerCase());
}

function splitInput(input: string) {
  const trimmedInput = input.trim();
  const firstWord = trimmedInput.split(/\s+/)[0] ?? '';

  return {
    trimmedInput,
    firstWord,
    firstWordLower: firstWord.toLowerCase(),
    restInput: trimmedInput.slice(firstWord.length).trim(),
  };
}

function inputStartsWithIdentifier(input: string, identifier: string) {
  return identifier.length > 1 && input.startsWith(identifier);
}

function isDefaultCommand(command: QuickCommandEntry, defaultCommand: string) {
  if (!defaultCommand) {
    return false;
  }
  return getCommandIdentifiers(command).includes(defaultCommand.toLowerCase());
}

function orderCommands(commands: QuickCommandEntry[], defaultCommand: string) {
  return [...commands].sort((leftCommand, rightCommand) => {
    if (isDefaultCommand(leftCommand, defaultCommand)) {
      return -1;
    }
    if (isDefaultCommand(rightCommand, defaultCommand)) {
      return 1;
    }
    return 0;
  });
}

function getIdentifierWords(identifier: string) {
  return identifier.split(/[\s._:/-]+/).filter(Boolean);
}

function getIdentifierMatchScore(
  identifier: string,
  query: string,
  scores: {
    exact: number;
    inputExtendsIdentifier?: number;
    prefix: number;
    wordPrefix?: number;
    contains: number;
  },
) {
  if (identifier === query) {
    return scores.exact;
  }

  if (
    scores.inputExtendsIdentifier &&
    inputStartsWithIdentifier(query, identifier)
  ) {
    return scores.inputExtendsIdentifier;
  }

  if (identifier.startsWith(query)) {
    return scores.prefix;
  }

  if (
    scores.wordPrefix &&
    getIdentifierWords(identifier).some((word) => word.startsWith(query))
  ) {
    return scores.wordPrefix;
  }

  if (identifier.includes(query)) {
    return scores.contains;
  }

  return 0;
}

function getCommandMatchScore(command: QuickCommandEntry, input: string) {
  const { firstWordLower } = splitInput(input);
  if (!firstWordLower) {
    return 0;
  }

  const nameScore = getIdentifierMatchScore(
    command.name.toLowerCase(),
    firstWordLower,
    {
      exact: MATCH_SCORE.nameExact,
      inputExtendsIdentifier: MATCH_SCORE.nameInputExtendsIdentifier,
      prefix: MATCH_SCORE.namePrefix,
      contains: MATCH_SCORE.nameContains,
    },
  );
  const aliasScore = Math.max(
    0,
    ...command.aliases.map((alias) =>
      getIdentifierMatchScore(alias.toLowerCase(), firstWordLower, {
        exact: MATCH_SCORE.aliasExact,
        inputExtendsIdentifier: MATCH_SCORE.aliasInputExtendsIdentifier,
        prefix: MATCH_SCORE.aliasPrefix,
        contains: MATCH_SCORE.aliasContains,
      }),
    ),
  );
  const labelScore = getIdentifierMatchScore(
    command.label.toLowerCase(),
    firstWordLower,
    {
      exact: MATCH_SCORE.labelExact,
      prefix: MATCH_SCORE.labelPrefix,
      wordPrefix: MATCH_SCORE.labelWordPrefix,
      contains: MATCH_SCORE.labelContains,
    },
  );

  return Math.max(nameScore, aliasScore, labelScore);
}

function rankCommands(
  commands: QuickCommandEntry[],
  input: string,
  defaultCommand: string,
) {
  const { firstWordLower } = splitInput(input);
  if (!firstWordLower) {
    return orderCommands(commands, defaultCommand);
  }

  return commands
    .map((command, index) => ({
      command,
      index,
      isDefault: isDefaultCommand(command, defaultCommand),
      score: getCommandMatchScore(command, input),
    }))
    .filter(({ score }) => score > 0)
    .sort((leftCommand, rightCommand) => {
      if (leftCommand.score !== rightCommand.score) {
        return rightCommand.score - leftCommand.score;
      }
      if (leftCommand.isDefault !== rightCommand.isDefault) {
        return leftCommand.isDefault ? -1 : 1;
      }
      return leftCommand.index - rightCommand.index;
    })
    .map(({ command }) => command);
}

function isCanonicalCommandInput(input: string, command: QuickCommandEntry) {
  const normalizedInput = input.trim().toLowerCase();
  const canonicalName = command.name.toLowerCase();
  return (
    normalizedInput === canonicalName ||
    normalizedInput.startsWith(`${canonicalName} `)
  );
}

function getCanonicalCommandQuery(input: string, command: QuickCommandEntry) {
  if (!isCanonicalCommandInput(input, command)) {
    return '';
  }
  return input.trim().slice(command.name.length).trim();
}

function getCommandCompletionMode(input: string, command: QuickCommandEntry) {
  const { firstWordLower } = splitInput(input);
  if (!firstWordLower) {
    return null;
  }

  const identifiers = getCommandIdentifiers(command);
  if (
    identifiers.some(
      (identifier) =>
        identifier === firstWordLower || identifier.startsWith(firstWordLower),
    )
  ) {
    return 'replace-token';
  }

  if (
    identifiers.some((identifier) =>
      inputStartsWithIdentifier(firstWordLower, identifier),
    )
  ) {
    return 'prefix-input';
  }

  return null;
}

function completeCommandInput(input: string, command: QuickCommandEntry) {
  const { trimmedInput, restInput } = splitInput(input);
  const commandPrefix = command.name;
  const completionMode = getCommandCompletionMode(input, command);

  if (!trimmedInput) {
    return `${commandPrefix} `;
  }

  if (isCanonicalCommandInput(input, command)) {
    return trimmedInput;
  }

  if (completionMode === 'replace-token') {
    return restInput ? `${commandPrefix} ${restInput}` : `${commandPrefix} `;
  }

  return `${commandPrefix} ${trimmedInput}`;
}

function shouldCompleteCommandInput(input: string, command: QuickCommandEntry) {
  const { trimmedInput } = splitInput(input);

  return (
    !trimmedInput ||
    (!isCanonicalCommandInput(input, command) &&
      Boolean(getCommandCompletionMode(input, command)))
  );
}

function getCommandTagWidth(commands: QuickCommandEntry[]) {
  const longestCommandLength = commands.reduce(
    (longestLength, command) => Math.max(longestLength, command.name.length),
    0,
  );
  const contentWidth =
    longestCommandLength * COMMAND_TAG_CHARACTER_WIDTH +
    COMMAND_TAG_HORIZONTAL_SPACE;

  return Math.min(
    COMMAND_TAG_MAX_WIDTH,
    Math.max(COMMAND_TAG_MIN_WIDTH, contentWidth),
  );
}

function isComposingInputEvent(event: React.KeyboardEvent<HTMLInputElement>) {
  return (
    event.currentTarget.dataset.quickCommandComposing === 'true' ||
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229
  );
}

export function QuickCommandPage() {
  const quickCommandBridge = window.electron?.quickCommand;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [input, setInput] = React.useState('');
  const [error, setError] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [config, setConfig] =
    React.useState<QuickCommandViewConfig>(DEFAULT_CONFIG);

  const focusInput = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const focusInputEnd = React.useCallback((cursorPosition?: number) => {
    window.requestAnimationFrame(() => {
      const inputElement = inputRef.current;
      if (!inputElement) {
        return;
      }
      const nextPosition = cursorPosition ?? inputElement.value.length;
      inputElement.focus();
      inputElement.setSelectionRange(nextPosition, nextPosition);
    });
  }, []);

  React.useEffect(() => {
    document.title = 'Quick Command';
    if (!quickCommandBridge) {
      focusInput();
      return undefined;
    }

    quickCommandBridge
      .getConfig()
      .then(setConfig)
      .catch((loadError: Error) => setError(loadError.message));
    const unsubscribeShow = quickCommandBridge.onShow((nextConfig) => {
      setConfig(nextConfig);
      setInput('');
      setError('');
      setSelectedIndex(0);
      focusInput();
    });
    const unsubscribeConfigUpdate = quickCommandBridge.onConfigUpdate(
      (nextConfig) => setConfig(nextConfig),
    );
    focusInput();

    return () => {
      unsubscribeShow();
      unsubscribeConfigUpdate();
    };
  }, [focusInput, quickCommandBridge]);

  const executeInput = React.useCallback(
    async (nextInput: string) => {
      if (!quickCommandBridge) {
        setError('Commands can only run inside EasyTray');
        return;
      }
      const result = await quickCommandBridge.execute(nextInput);
      if (!result.ok) {
        setError(result.error);
        focusInput();
      }
    },
    [focusInput, quickCommandBridge],
  );

  const visibleCommands = rankCommands(
    config.commands,
    input,
    config.defaultCommand,
  ).slice(0, 5);
  const fallbackCommands = (
    visibleCommands.length > 0
      ? visibleCommands
      : orderCommands(config.commands, config.defaultCommand)
  ).slice(0, 5);
  const selectedCommand =
    fallbackCommands[selectedIndex] ?? fallbackCommands[0];
  const commandListKey = config.commands
    .map((command) => command.name)
    .join('\n');
  const quickCommandStyle = React.useMemo<QuickCommandStyle>(
    () => ({
      '--quick-command-tag-width': `${getCommandTagWidth(config.commands)}px`,
      ...getQuickCommandThemeCssVariables(config.theme.tokens),
    }),
    [config.commands, config.theme.tokens],
  );

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [input, commandListKey]);

  const selectCommand = React.useCallback(
    (command?: QuickCommandEntry) => {
      if (!command) {
        executeInput(input);
        return;
      }

      if (!command.requiresInput) {
        executeInput(command.name);
        return;
      }

      const completedInput = completeCommandInput(input, command);
      if (shouldCompleteCommandInput(input, command)) {
        setInput(completedInput);
        setError('');
        focusInputEnd(completedInput.length);
        return;
      }

      if (!isCanonicalCommandInput(input, command)) {
        executeInput(`${command.name} ${input.trim()}`);
        return;
      }

      const query = getCanonicalCommandQuery(input, command);
      if (!query) {
        const commandInput = `${command.name} `;
        setInput(commandInput);
        setError(`Type input for ${command.label}`);
        focusInputEnd(commandInput.length);
        return;
      }

      executeInput(input);
    },
    [executeInput, focusInputEnd, input],
  );

  return (
    <main
      className="quick-command-page"
      data-quick-command-theme={config.theme.preset}
      data-quick-command-theme-name={config.theme.name}
      style={quickCommandStyle}
    >
      <section
        className={`quick-command-panel ${
          error ? 'quick-command-panel--error' : ''
        }`}
      >
        <div className="quick-command-input-row">
          <span className="quick-command-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="quick-command-input"
            value={input}
            placeholder="Search or run a command"
            spellCheck={false}
            onChange={(event) => {
              setInput(event.target.value);
              setError('');
            }}
            onCompositionStart={(event) => {
              event.currentTarget.dataset.quickCommandComposing = 'true';
            }}
            onCompositionEnd={(event) => {
              delete event.currentTarget.dataset.quickCommandComposing;
            }}
            onKeyDown={(event) => {
              if (isComposingInputEvent(event)) {
                return;
              }

              if (event.key === 'Escape') {
                quickCommandBridge?.hide();
              }
              if (event.key === 'ArrowDown' && fallbackCommands.length > 0) {
                event.preventDefault();
                setSelectedIndex(
                  (currentIndex) =>
                    (currentIndex + 1) % fallbackCommands.length,
                );
              }
              if (event.key === 'ArrowUp' && fallbackCommands.length > 0) {
                event.preventDefault();
                setSelectedIndex(
                  (currentIndex) =>
                    (currentIndex - 1 + fallbackCommands.length) %
                    fallbackCommands.length,
                );
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                selectCommand(selectedCommand);
              }
            }}
          />
        </div>
        <div className="quick-command-footer">
          <div className="quick-command-engines">
            {fallbackCommands.map((command, index) => (
              <button
                type="button"
                aria-pressed={index === selectedIndex}
                className={`quick-command-engine ${
                  index === selectedIndex ? 'quick-command-engine--active' : ''
                }`}
                key={command.name}
                onClick={() => selectCommand(command)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <kbd className="quick-command-engine-name">{command.name}</kbd>
                <span className="quick-command-engine-content">
                  <span className="quick-command-engine-label">
                    {command.label}
                  </span>
                  {command.description ? (
                    <small className="quick-command-engine-description">
                      {command.description}
                    </small>
                  ) : null}
                </span>
                <span className="quick-command-engine-action">
                  {ACTION_LABELS[command.action]}
                </span>
              </button>
            ))}
          </div>
          <span
            aria-live="polite"
            className={`quick-command-error ${
              error ? 'quick-command-error--visible' : ''
            }`}
          >
            {error}
          </span>
        </div>
      </section>
    </main>
  );
}
