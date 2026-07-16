import React from 'react';
import {
  AppWindow,
  Copy,
  ExternalLink,
  Power,
  Search,
  Settings,
  Terminal,
} from 'lucide-react';
import {
  DEFAULT_QUICK_COMMAND_THEME,
  QuickCommandResolvedTheme,
  getQuickCommandThemeCssVariables,
  isQuickCommandPresetTheme,
} from '../../shared/quick-command-theme';
import { isBrowserUrlInput } from '../../shared/browser-routing';

type QuickCommandAction =
  | 'web-search'
  | 'browser-window'
  | 'copy-value'
  | 'execute-command'
  | 'open-in-browser'
  | 'open-settings'
  | 'quit-app';

interface QuickCommandEntry {
  name: string;
  label: string;
  icon?: string;
  aliases: string[];
  description?: string;
  action: QuickCommandAction;
  requiresInput?: boolean;
}

interface QuickCommandViewConfig {
  shortcut: string;
  defaultCommand: string;
  appSearchEnabled: boolean;
  openInBrowserEnabled: boolean;
  theme: QuickCommandResolvedTheme;
  commands: QuickCommandEntry[];
}

interface TextMatchRange {
  start: number;
  end: number;
}

interface QuickCommandApplicationResult {
  name: string;
  path: string;
  icon?: string;
  matchRanges: TextMatchRange[];
  score: number;
}

interface TextMatch {
  ranges: TextMatchRange[];
  score: number;
}

interface IdentifierProjection {
  sourceSpans: Array<
    TextMatchRange & {
      normalizedStart: number;
      normalizedEnd: number;
    }
  >;
  text: string;
}

interface CommandMatch extends TextMatch {
  aliasIndex?: number;
  field: 'name' | 'alias' | 'label';
}

interface RankedCommand {
  command: QuickCommandEntry;
  match?: CommandMatch;
}

type QuickCommandListItem =
  | {
      kind: 'command';
      command: QuickCommandEntry;
      index: number;
      match?: CommandMatch;
      score: number;
    }
  | {
      kind: 'application';
      application: QuickCommandApplicationResult;
      index: number;
      score: number;
    };

type QuickCommandStyle = React.CSSProperties & {
  [customProperty: `--${string}`]: string | number | undefined;
};

const MAX_VISIBLE_RESULTS = 5;
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
  'open-in-browser': 'Open',
  'open-settings': 'Open',
  'quit-app': 'Quit',
};

const DEFAULT_CONFIG: QuickCommandViewConfig = {
  shortcut: '',
  defaultCommand: 'g',
  appSearchEnabled: false,
  openInBrowserEnabled: false,
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

function hasExplicitCommandInput(input: string, commands: QuickCommandEntry[]) {
  const normalizedInput = input.trim().toLowerCase();
  return commands.some((command) =>
    getCommandIdentifiers(command).some(
      (identifier) =>
        normalizedInput === identifier ||
        normalizedInput.startsWith(`${identifier} `),
    ),
  );
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

function getIdentifierWordRanges(identifier: string) {
  return Array.from(identifier.matchAll(/[^\s._:/-]+/g)).map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

function createIdentifierProjection(identifier: string): IdentifierProjection {
  const sourceSpans: IdentifierProjection['sourceSpans'] = [];
  let sourceOffset = 0;
  let normalizedOffset = 0;
  Array.from(identifier).forEach((character) => {
    const sourceStart = sourceOffset;
    sourceOffset += character.length;
    const normalizedEnd = identifier
      .slice(0, sourceOffset)
      .toLowerCase().length;
    sourceSpans.push({
      start: sourceStart,
      end: sourceOffset,
      normalizedStart: normalizedOffset,
      normalizedEnd,
    });
    normalizedOffset = normalizedEnd;
  });
  return { sourceSpans, text: identifier.toLowerCase() };
}

function createTextMatch(
  score: number,
  projection: IdentifierProjection,
  normalizedStart: number,
  normalizedEnd: number,
): TextMatch | undefined {
  const matchingSpans = projection.sourceSpans.filter(
    (span) =>
      span.normalizedEnd > normalizedStart &&
      span.normalizedStart < normalizedEnd,
  );
  if (!matchingSpans.length) return undefined;
  return {
    score,
    ranges: [
      {
        start: matchingSpans[0].start,
        end: matchingSpans[matchingSpans.length - 1].end,
      },
    ],
  };
}

function getIdentifierMatch(
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
  const projection = createIdentifierProjection(identifier);
  const normalizedIdentifier = projection.text;
  if (normalizedIdentifier === query) {
    return createTextMatch(
      scores.exact,
      projection,
      0,
      normalizedIdentifier.length,
    );
  }

  if (
    scores.inputExtendsIdentifier &&
    inputStartsWithIdentifier(query, normalizedIdentifier)
  ) {
    return createTextMatch(
      scores.inputExtendsIdentifier,
      projection,
      0,
      normalizedIdentifier.length,
    );
  }

  if (normalizedIdentifier.startsWith(query)) {
    return createTextMatch(scores.prefix, projection, 0, query.length);
  }

  if (scores.wordPrefix) {
    const matchingWord = getIdentifierWordRanges(normalizedIdentifier).find(
      ({ start, end }) =>
        normalizedIdentifier.slice(start, end).startsWith(query),
    );
    if (matchingWord) {
      return createTextMatch(
        scores.wordPrefix,
        projection,
        matchingWord.start,
        matchingWord.start + query.length,
      );
    }
  }

  const containsIndex = normalizedIdentifier.indexOf(query);
  if (containsIndex >= 0) {
    return createTextMatch(
      scores.contains,
      projection,
      containsIndex,
      containsIndex + query.length,
    );
  }

  return undefined;
}

function getCommandMatch(
  command: QuickCommandEntry,
  input: string,
): CommandMatch | undefined {
  const { firstWordLower } = splitInput(input);
  if (!firstWordLower) return undefined;

  const candidates: CommandMatch[] = [];
  const nameMatch = getIdentifierMatch(command.name, firstWordLower, {
    exact: MATCH_SCORE.nameExact,
    inputExtendsIdentifier: MATCH_SCORE.nameInputExtendsIdentifier,
    prefix: MATCH_SCORE.namePrefix,
    contains: MATCH_SCORE.nameContains,
  });
  if (nameMatch) candidates.push({ ...nameMatch, field: 'name' });

  command.aliases.forEach((alias, aliasIndex) => {
    const aliasMatch = getIdentifierMatch(alias, firstWordLower, {
      exact: MATCH_SCORE.aliasExact,
      inputExtendsIdentifier: MATCH_SCORE.aliasInputExtendsIdentifier,
      prefix: MATCH_SCORE.aliasPrefix,
      contains: MATCH_SCORE.aliasContains,
    });
    if (aliasMatch) {
      candidates.push({
        ...aliasMatch,
        aliasIndex,
        field: 'alias',
      });
    }
  });

  const labelMatch = getIdentifierMatch(command.label, firstWordLower, {
    exact: MATCH_SCORE.labelExact,
    prefix: MATCH_SCORE.labelPrefix,
    wordPrefix: MATCH_SCORE.labelWordPrefix,
    contains: MATCH_SCORE.labelContains,
  });
  if (labelMatch) candidates.push({ ...labelMatch, field: 'label' });

  return candidates.reduce<CommandMatch | undefined>(
    (bestMatch, candidate) =>
      !bestMatch || candidate.score > bestMatch.score ? candidate : bestMatch,
    undefined,
  );
}

function rankCommands(
  commands: QuickCommandEntry[],
  input: string,
  defaultCommand: string,
): RankedCommand[] {
  const { firstWordLower } = splitInput(input);
  if (!firstWordLower) {
    return orderCommands(commands, defaultCommand).map((command) => ({
      command,
    }));
  }

  return commands
    .map((command, index) => {
      const match = getCommandMatch(command, input);
      return {
        command,
        index,
        isDefault: isDefaultCommand(command, defaultCommand),
        match,
        score: match?.score ?? 0,
      };
    })
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
    .map(({ command, match }) => ({ command, match }));
}

function getListItemKey(item: QuickCommandListItem) {
  return item.kind === 'command'
    ? `command:${item.command.name}`
    : `application:${item.application.path}`;
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

function isComposingInputEvent(event: React.KeyboardEvent<HTMLInputElement>) {
  return (
    event.currentTarget.dataset.quickCommandComposing === 'true' ||
    event.nativeEvent.isComposing ||
    event.nativeEvent.keyCode === 229
  );
}

function normalizeMatchRanges(text: string, ranges: TextMatchRange[]) {
  const normalizedRanges: TextMatchRange[] = [];
  ranges
    .map(({ start, end }) => ({
      start: Math.max(0, Math.min(text.length, Math.floor(start))),
      end: Math.max(0, Math.min(text.length, Math.ceil(end))),
    }))
    .filter(({ start, end }) => end > start)
    .sort((left, right) => left.start - right.start)
    .forEach((range) => {
      const previousRange = normalizedRanges.at(-1);
      if (!previousRange || range.start > previousRange.end) {
        normalizedRanges.push(range);
      } else {
        previousRange.end = Math.max(previousRange.end, range.end);
      }
    });
  return normalizedRanges;
}

function HighlightedText({
  ranges,
  text,
}: {
  ranges: TextMatchRange[];
  text: string;
}) {
  const normalizedRanges = normalizeMatchRanges(text, ranges);
  if (!normalizedRanges.length) return text;

  let cursor = 0;
  return (
    <>
      {normalizedRanges.map((range) => {
        const leadingText = text.slice(cursor, range.start);
        const matchedText = text.slice(range.start, range.end);
        cursor = range.end;
        return (
          <React.Fragment key={`${range.start}:${range.end}`}>
            {leadingText}
            <mark className="quick-command-match">{matchedText}</mark>
          </React.Fragment>
        );
      })}
      {text.slice(cursor)}
    </>
  );
}

function CommandActionIcon({ action }: { action: QuickCommandAction }) {
  switch (action) {
    case 'web-search':
      return <Search size={21} strokeWidth={1.8} />;
    case 'browser-window':
      return <AppWindow size={21} strokeWidth={1.8} />;
    case 'copy-value':
      return <Copy size={21} strokeWidth={1.8} />;
    case 'execute-command':
      return <Terminal size={21} strokeWidth={1.8} />;
    case 'open-in-browser':
      return <ExternalLink size={21} strokeWidth={1.8} />;
    case 'open-settings':
      return <Settings size={21} strokeWidth={1.8} />;
    case 'quit-app':
      return <Power size={21} strokeWidth={1.8} />;
    default:
      return null;
  }
}

export function QuickCommandPage() {
  const quickCommandBridge = window.electron?.quickCommand;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [input, setInput] = React.useState('');
  const [error, setError] = React.useState('');
  const [isComposing, setIsComposing] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [applicationSearch, setApplicationSearch] = React.useState<{
    query: string;
    results: QuickCommandApplicationResult[];
  }>({ query: '', results: [] });
  const [config, setConfig] =
    React.useState<QuickCommandViewConfig>(DEFAULT_CONFIG);

  const focusInput = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
      });
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
      setIsComposing(false);
      setApplicationSearch({ query: '', results: [] });
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

  const applicationQuery = input.trim();
  React.useEffect(() => {
    let cancelled = false;
    if (
      !applicationQuery ||
      isComposing ||
      !config.appSearchEnabled ||
      !quickCommandBridge ||
      typeof quickCommandBridge.searchApplications !== 'function'
    ) {
      setApplicationSearch({ query: '', results: [] });
      return undefined;
    }

    quickCommandBridge
      .searchApplications(applicationQuery)
      .then((results) => {
        if (!cancelled) {
          setApplicationSearch({ query: applicationQuery, results });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApplicationSearch({ query: applicationQuery, results: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    applicationQuery,
    config.appSearchEnabled,
    isComposing,
    quickCommandBridge,
  ]);

  const rankedCommands = rankCommands(
    config.commands,
    input,
    config.defaultCommand,
  );
  const matchingApplications =
    applicationSearch.query === applicationQuery
      ? applicationSearch.results
      : [];
  const commandItems: QuickCommandListItem[] = rankedCommands.map(
    ({ command, match }, index) => ({
      kind: 'command',
      command,
      index,
      match,
      score: match?.score ?? 0,
    }),
  );
  const applicationItems: QuickCommandListItem[] = matchingApplications.map(
    (application, index) => ({
      kind: 'application',
      application,
      index,
      score: application.score,
    }),
  );
  const matchingItems = [...commandItems, ...applicationItems].sort(
    (leftItem, rightItem) => {
      if (leftItem.score !== rightItem.score) {
        return rightItem.score - leftItem.score;
      }
      if (leftItem.kind !== rightItem.kind) {
        return leftItem.kind === 'command' ? -1 : 1;
      }
      return leftItem.index - rightItem.index;
    },
  );
  const defaultItems: QuickCommandListItem[] = orderCommands(
    config.commands,
    config.defaultCommand,
  ).map((command, index) => ({
    kind: 'command',
    command,
    index,
    score: 0,
  }));
  const visibleItems = (
    applicationQuery && matchingItems.length > 0 ? matchingItems : defaultItems
  ).slice(0, MAX_VISIBLE_RESULTS);
  const selectedItem = visibleItems[selectedIndex] ?? visibleItems[0];
  const resultListKey = visibleItems.map(getListItemKey).join('\n');
  const quickCommandStyle = React.useMemo<QuickCommandStyle>(
    () => ({
      ...getQuickCommandThemeCssVariables(config.theme.tokens),
    }),
    [config.theme.tokens],
  );

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [input, resultListKey]);

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

  const openApplication = React.useCallback(
    async (application: QuickCommandApplicationResult) => {
      if (
        !quickCommandBridge ||
        typeof quickCommandBridge.openApplication !== 'function'
      ) {
        setError('Applications can only open inside EasyTray');
        return;
      }

      try {
        const result = await quickCommandBridge.openApplication(
          application.path,
        );
        if (!result.ok) {
          setError(result.error);
          focusInput();
        }
      } catch (openError: any) {
        setError(openError.message);
        focusInput();
      }
    },
    [focusInput, quickCommandBridge],
  );

  const selectItem = React.useCallback(
    (item?: QuickCommandListItem) => {
      if (item?.kind === 'application') {
        openApplication(item.application);
        return;
      }
      selectCommand(item?.command);
    },
    [openApplication, selectCommand],
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
              setIsComposing(true);
            }}
            onCompositionEnd={(event) => {
              delete event.currentTarget.dataset.quickCommandComposing;
              setIsComposing(false);
            }}
            onKeyDown={(event) => {
              if (isComposingInputEvent(event)) {
                return;
              }

              if (event.key === 'Escape') {
                quickCommandBridge?.hide();
              }
              if (event.key === 'ArrowDown' && visibleItems.length > 0) {
                event.preventDefault();
                setSelectedIndex(
                  (currentIndex) => (currentIndex + 1) % visibleItems.length,
                );
              }
              if (event.key === 'ArrowUp' && visibleItems.length > 0) {
                event.preventDefault();
                setSelectedIndex(
                  (currentIndex) =>
                    (currentIndex - 1 + visibleItems.length) %
                    visibleItems.length,
                );
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (
                  config.openInBrowserEnabled &&
                  isBrowserUrlInput(input) &&
                  !hasExplicitCommandInput(input, config.commands)
                ) {
                  executeInput(input);
                  return;
                }
                selectItem(selectedItem);
              }
            }}
          />
        </div>
        <div className="quick-command-footer">
          <div className="quick-command-engines">
            {visibleItems.map((item, index) => {
              const isApplication = item.kind === 'application';
              const label = isApplication
                ? item.application.name
                : `${item.command.name} / ${item.command.label}`;
              const matchedAlias =
                item.kind === 'command' &&
                item.match?.field === 'alias' &&
                item.match.aliasIndex !== undefined
                  ? item.command.aliases[item.match.aliasIndex]
                  : undefined;
              let description: string | undefined;
              if (isApplication) {
                description = item.application.path;
              } else if (matchedAlias) {
                description = `Matched alias: ${matchedAlias}`;
              } else {
                description = item.command.description;
              }
              const action = isApplication
                ? 'Open'
                : ACTION_LABELS[item.command.action];
              const icon = isApplication
                ? item.application.icon
                : item.command.icon;

              return (
                <button
                  type="button"
                  aria-pressed={index === selectedIndex}
                  className={`quick-command-engine ${
                    isApplication ? 'quick-command-engine--application ' : ''
                  }${
                    index === selectedIndex
                      ? 'quick-command-engine--active'
                      : ''
                  }`}
                  key={getListItemKey(item)}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span
                    aria-hidden="true"
                    className={`quick-command-engine-icon quick-command-engine-icon--${
                      isApplication ? 'application' : 'command'
                    }`}
                  >
                    {icon ? (
                      <img
                        alt=""
                        draggable={false}
                        src={icon}
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                        onLoad={(event) => {
                          event.currentTarget.hidden = false;
                        }}
                      />
                    ) : null}
                    <span className="quick-command-engine-icon-fallback">
                      {isApplication ? (
                        <span>{item.application.name.slice(0, 1)}</span>
                      ) : (
                        <CommandActionIcon action={item.command.action} />
                      )}
                    </span>
                  </span>
                  <span className="quick-command-engine-content">
                    <span className="quick-command-engine-label" title={label}>
                      {item.kind === 'application' ? (
                        <HighlightedText
                          ranges={item.application.matchRanges ?? []}
                          text={item.application.name}
                        />
                      ) : (
                        <>
                          <HighlightedText
                            ranges={
                              item.match?.field === 'name'
                                ? item.match.ranges
                                : []
                            }
                            text={item.command.name}
                          />
                          {' / '}
                          <HighlightedText
                            ranges={
                              item.match?.field === 'label'
                                ? item.match.ranges
                                : []
                            }
                            text={item.command.label}
                          />
                        </>
                      )}
                    </span>
                    {description ? (
                      <small
                        className="quick-command-engine-description"
                        title={isApplication ? description : undefined}
                      >
                        {matchedAlias && item.kind === 'command' ? (
                          <>
                            Alias:{' '}
                            <HighlightedText
                              ranges={item.match?.ranges ?? []}
                              text={matchedAlias}
                            />
                          </>
                        ) : (
                          description
                        )}
                      </small>
                    ) : null}
                  </span>
                  <span className="quick-command-engine-action">{action}</span>
                </button>
              );
            })}
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
