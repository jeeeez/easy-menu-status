import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  ImageOff,
  ImagePlus,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  BrowserProfileConfig,
  ConfigWindowSize,
  DomainProfileConfig,
  WINDOW_SIZE_PRESETS,
  WindowSizePreset,
} from '../../shared/config';
import { SETTINGS_ICON_MAX_INPUT_BYTES } from '../../shared/icon-import';
import type {
  SettingsIconImportResult,
  SettingsIconPreviewResult,
  SettingsLocalIcon,
  SettingsLocalIconDeleteResult,
} from '../../shared/icon-import';
import { formatStringList, parseStringList } from './config-utils';

interface FieldProps {
  label: string;
  value?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function TextField({
  label,
  value = '',
  placeholder,
  multiline,
  disabled,
  onChange,
}: FieldProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          disabled={disabled}
          placeholder={placeholder}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          disabled={disabled}
          placeholder={placeholder}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value?: number;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: NumberFieldProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        type="number"
        value={value ?? ''}
        onChange={(event) =>
          onChange(
            event.target.value === '' ? undefined : Number(event.target.value),
          )
        }
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value?: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}

export function SelectField({
  label,
  value = '',
  options,
  onChange,
}: SelectFieldProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ComboFieldOption {
  value: string;
  group: 'Built-in' | 'Imported';
  dataUrl?: string;
}

interface ComboFieldProps {
  disabled?: boolean;
  label: string;
  value?: string;
  options: readonly ComboFieldOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}

export function ComboField({
  disabled = false,
  label,
  value = '',
  options,
  placeholder,
  onChange,
}: ComboFieldProps) {
  const inputId = React.useId();
  const listboxId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const renderedOptions = options.map((option, index) => ({
    ...option,
    showGroup: index === 0 || options[index - 1].group !== option.group,
  }));

  const openOptions = () => {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const selectOption = (option: ComboFieldOption) => {
    onChange(option.value);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="settings-field">
      <label htmlFor={inputId}>{label}</label>
      <div
        className={`settings-combobox ${isOpen ? 'is-open' : ''}`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsOpen(false);
          }
        }}
      >
        <input
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen && !disabled}
          id={inputId}
          disabled={disabled}
          ref={inputRef}
          role="combobox"
          placeholder={placeholder}
          type="text"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue);
            setActiveIndex(
              options.findIndex((option) => option.value === nextValue),
            );
            setIsOpen(true);
          }}
          onClick={openOptions}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!isOpen) {
                openOptions();
              } else {
                setActiveIndex((index) =>
                  Math.min(index + 1, options.length - 1),
                );
              }
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              if (!isOpen) {
                openOptions();
              } else {
                setActiveIndex((index) => Math.max(index - 1, 0));
              }
            } else if (event.key === 'Enter' && isOpen) {
              event.preventDefault();
              if (activeIndex >= 0 && options[activeIndex]) {
                selectOption(options[activeIndex]);
              } else {
                setIsOpen(false);
              }
            } else if (event.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        />
        <button
          aria-label={`Show ${label} options`}
          className="settings-combobox-toggle"
          disabled={disabled}
          type="button"
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              openOptions();
              inputRef.current?.focus();
            }
          }}
        >
          <ChevronDown size={15} />
        </button>
        {isOpen && !disabled ? (
          <div
            className="settings-combobox-options"
            id={listboxId}
            role="listbox"
          >
            {renderedOptions.map((option, index) => (
              <React.Fragment key={`${option.group}:${option.value}`}>
                {option.showGroup ? (
                  <div
                    className="settings-combobox-option-group"
                    role="presentation"
                  >
                    {option.group}
                  </div>
                ) : null}
                <button
                  aria-selected={option.value === value}
                  className={`settings-combobox-option ${
                    index === activeIndex ? 'is-active' : ''
                  }`}
                  role="option"
                  type="button"
                  onClick={() => selectOption(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="settings-combobox-option-icon">
                    {option.dataUrl ? (
                      <img alt="" draggable={false} src={option.dataUrl} />
                    ) : (
                      <ImageIcon aria-hidden="true" size={14} />
                    )}
                  </span>
                  <span>{option.value}</span>
                </button>
              </React.Fragment>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface IconImportFieldProps extends Omit<ComboFieldProps, 'options'> {
  options: readonly string[];
  targetKey?: string;
}

type IconImportStatus =
  | { kind: 'idle' }
  | { kind: 'importing'; message: string }
  | { kind: 'deleting'; message: string }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type IconImportMessageStatus = Exclude<IconImportStatus, { kind: 'idle' }>;

type IconPreviewState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'ready'; dataUrl: string }
  | { kind: 'fallback'; message: string }
  | { kind: 'error'; message: string };

type IconImportOperation = () => Promise<SettingsIconImportResult>;

interface IconImportFallback {
  message: string;
  operation: IconImportOperation;
}

const ICON_TOO_LARGE_ERROR = 'The image must be 10 MB or smaller.';

async function readLimitedResponse(response: Response) {
  if (!response.ok) throw new Error('The webpage image request failed.');
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (
    Number.isFinite(contentLength) &&
    contentLength > SETTINGS_ICON_MAX_INPUT_BYTES
  ) {
    throw new Error(ICON_TOO_LARGE_ERROR);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > SETTINGS_ICON_MAX_INPUT_BYTES) {
      throw new Error(ICON_TOO_LARGE_ERROR);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const readNext = async (): Promise<void> => {
    const result = await reader.read();
    if (!result.done) {
      byteLength += result.value.byteLength;
      if (byteLength > SETTINGS_ICON_MAX_INPUT_BYTES) {
        await reader.cancel();
        throw new Error(ICON_TOO_LARGE_ERROR);
      }
      chunks.push(result.value);
      await readNext();
    }
  };
  await readNext();

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes;
}

function getTransferFile(dataTransfer: DataTransfer) {
  const files = [
    ...Array.from(dataTransfer.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file)),
    ...Array.from(dataTransfer.files),
  ];
  return (
    files.find((file) => file.type.toLowerCase().startsWith('image/')) ??
    files[0]
  );
}

function normalizeTransferUrl(value: string) {
  const candidate = value.trim();
  if (!candidate) return undefined;
  const normalized = candidate.startsWith('//')
    ? `https:${candidate}`
    : candidate;
  try {
    const url = new URL(normalized);
    return ['http:', 'https:', 'data:', 'blob:'].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function getTransferUrl(dataTransfer: DataTransfer) {
  const html = dataTransfer.getData('text/html');
  if (html) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    const source = document.querySelector('img')?.getAttribute('src');
    const imageUrl = source ? normalizeTransferUrl(source) : undefined;
    if (imageUrl) return imageUrl;
  }

  const uriList = dataTransfer.getData('text/uri-list');
  const uri = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));
  const uriUrl = uri ? normalizeTransferUrl(uri) : undefined;
  if (uriUrl) return uriUrl;

  return normalizeTransferUrl(dataTransfer.getData('text/plain'));
}

export function IconImportField({
  disabled = false,
  label,
  onChange,
  options,
  placeholder,
  targetKey = label,
  value,
}: IconImportFieldProps) {
  const managerId = React.useId();
  const operationRef = React.useRef(false);
  const operationSequenceRef = React.useRef(0);
  const localIconListSequenceRef = React.useRef(0);
  const previewSequenceRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const onChangeRef = React.useRef(onChange);
  const targetKeyRef = React.useRef(targetKey);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isManagerOpen, setIsManagerOpen] = React.useState(false);
  const [localIcons, setLocalIcons] = React.useState<SettingsLocalIcon[]>([]);
  const [localIconError, setLocalIconError] = React.useState('');
  const [iconLibraryRevision, setIconLibraryRevision] = React.useState(0);
  const [status, setStatus] = React.useState<IconImportStatus>({
    kind: 'idle',
  });
  const [preview, setPreview] = React.useState<IconPreviewState>({
    kind: 'empty',
  });
  const isBusy = ['importing', 'deleting'].includes(status.kind);
  const comboOptions = React.useMemo<ComboFieldOption[]>(
    () => [
      ...options.map((option) => ({
        value: option,
        group: 'Built-in' as const,
      })),
      ...localIcons.map((icon) => ({
        value: icon.fileName,
        group: 'Imported' as const,
        dataUrl: icon.dataUrl,
      })),
    ],
    [localIcons, options],
  );
  let visibleStatus: IconImportMessageStatus | null = null;
  if (status.kind !== 'idle') {
    visibleStatus = status;
  } else if (localIconError) {
    visibleStatus = { kind: 'error', message: localIconError };
  }
  let previewLabel = 'No icon preview';
  let previewHint = 'Or focus here and press ⌘V';
  let previewTitle = value;
  if (preview.kind === 'ready') {
    previewLabel = `Preview of ${value}`;
  } else if (preview.kind === 'fallback') {
    previewLabel = preview.message;
    previewHint = 'Image unavailable · default icon will be used';
    previewTitle = preview.message;
  } else if (preview.kind === 'error') {
    previewLabel = preview.message;
    previewHint = 'Preview unavailable · focus here and press ⌘V';
    previewTitle = preview.message;
  }
  onChangeRef.current = onChange;
  targetKeyRef.current = targetKey;

  React.useEffect(() => {
    operationSequenceRef.current += 1;
    operationRef.current = false;
    setIsDragging(false);
    setStatus({ kind: 'idle' });
  }, [targetKey]);

  React.useEffect(() => {
    const clearHiddenWindowStatus = () => {
      if (document.visibilityState === 'visible' && !operationRef.current) {
        setStatus({ kind: 'idle' });
      }
    };
    document.addEventListener('visibilitychange', clearHiddenWindowStatus);
    return () => {
      document.removeEventListener('visibilitychange', clearHiddenWindowStatus);
    };
  }, []);

  React.useEffect(
    () => () => {
      mountedRef.current = false;
      operationSequenceRef.current += 1;
      localIconListSequenceRef.current += 1;
      previewSequenceRef.current += 1;
    },
    [],
  );

  const refreshLocalIcons = React.useCallback(async () => {
    const settingsBridge = window.electron?.settings;
    if (!settingsBridge) return;
    localIconListSequenceRef.current += 1;
    const listSequence = localIconListSequenceRef.current;
    try {
      const result = await settingsBridge.listLocalIcons();
      if (
        !mountedRef.current ||
        localIconListSequenceRef.current !== listSequence
      ) {
        return;
      }
      if (result.ok) {
        setLocalIcons(result.icons);
        setLocalIconError('');
      } else {
        setLocalIconError(result.error);
      }
    } catch {
      if (
        mountedRef.current &&
        localIconListSequenceRef.current === listSequence
      ) {
        setLocalIconError('Local icons could not be loaded.');
      }
    }
  }, []);

  React.useEffect(() => {
    refreshLocalIcons();
  }, [refreshLocalIcons]);

  React.useEffect(() => {
    previewSequenceRef.current += 1;
    const previewSequence = previewSequenceRef.current;
    const configuredIcon = value?.trim() ?? '';
    if (!configuredIcon) {
      setPreview({ kind: 'empty' });
      return undefined;
    }

    setPreview({ kind: 'loading' });
    const timeout = window.setTimeout(async () => {
      let result: SettingsIconPreviewResult;
      try {
        result = await window.electron.settings.previewIcon(configuredIcon);
      } catch {
        result = { ok: false, error: 'Preview unavailable.' };
      }
      if (
        !mountedRef.current ||
        previewSequenceRef.current !== previewSequence
      ) {
        return;
      }
      let nextPreview: IconPreviewState;
      if (!result.ok) {
        nextPreview = { kind: 'error', message: result.error };
      } else if (result.fallback) {
        nextPreview = {
          kind: 'fallback',
          message: 'Icon unavailable. The default icon will be used.',
        };
      } else {
        nextPreview = { kind: 'ready', dataUrl: result.dataUrl };
      }
      setPreview(nextPreview);
    }, 150);

    return () => {
      window.clearTimeout(timeout);
      if (previewSequenceRef.current === previewSequence) {
        previewSequenceRef.current += 1;
      }
    };
  }, [iconLibraryRevision, targetKey, value]);

  const rememberImportedIcon = (fileName: string) => {
    if (!mountedRef.current) return;
    setLocalIcons((currentIcons) =>
      currentIcons.some((icon) => icon.fileName === fileName)
        ? currentIcons
        : [...currentIcons, { fileName }],
    );
    refreshLocalIcons();
  };

  const runImport = async (
    message: string,
    operation: IconImportOperation,
    fallback?: IconImportFallback,
  ) => {
    if (disabled || operationRef.current) return;
    operationRef.current = true;
    operationSequenceRef.current += 1;
    const importSequence = operationSequenceRef.current;
    const importTargetKey = targetKeyRef.current;
    const isCurrentImport = () =>
      mountedRef.current &&
      operationSequenceRef.current === importSequence &&
      targetKeyRef.current === importTargetKey;
    setStatus({ kind: 'importing', message });
    try {
      const execute = async (
        task: IconImportOperation,
      ): Promise<SettingsIconImportResult> => {
        try {
          return await task();
        } catch {
          return {
            ok: false,
            error: 'The image could not be imported.',
          } as const;
        }
      };
      let result = await execute(operation);
      if (result.ok) rememberImportedIcon(result.fileName);
      if (!isCurrentImport()) return;
      if (!result.ok && !result.canceled && fallback) {
        setStatus({ kind: 'importing', message: fallback.message });
        result = await execute(fallback.operation);
        if (result.ok) rememberImportedIcon(result.fileName);
        if (!isCurrentImport()) return;
      }
      if (result.ok) {
        onChangeRef.current(result.fileName);
        setStatus({
          kind: 'success',
          message: `Saved as ${result.fileName}`,
        });
      } else if (result.canceled) {
        setStatus({ kind: 'idle' });
      } else {
        setStatus({ kind: 'error', message: result.error });
      }
    } finally {
      if (operationSequenceRef.current === importSequence) {
        operationRef.current = false;
      }
    }
  };

  const deleteLocalIcon = async (fileName: string) => {
    if (
      disabled ||
      operationRef.current ||
      !localIcons.some((icon) => icon.fileName === fileName)
    ) {
      return;
    }

    operationRef.current = true;
    operationSequenceRef.current += 1;
    const deleteSequence = operationSequenceRef.current;
    const deleteTargetKey = targetKeyRef.current;
    const isCurrentDelete = () =>
      mountedRef.current &&
      operationSequenceRef.current === deleteSequence &&
      targetKeyRef.current === deleteTargetKey;
    setStatus({ kind: 'deleting', message: 'Deleting local image…' });

    let result: SettingsLocalIconDeleteResult;
    try {
      result = await window.electron.settings.deleteLocalIcon(fileName);
    } catch {
      result = {
        ok: false,
        error: 'The local icon could not be deleted.',
      };
    }

    if (result.ok && mountedRef.current) {
      setLocalIcons((currentIcons) =>
        currentIcons.filter((icon) => icon.fileName !== result.fileName),
      );
      setIconLibraryRevision((revision) => revision + 1);
      refreshLocalIcons();
    }
    if (!isCurrentDelete()) return;

    if (result.ok) {
      setStatus({
        kind: 'success',
        message: `Deleted ${result.fileName}. Existing references now use a default icon.`,
      });
    } else if (result.canceled) {
      setStatus({ kind: 'idle' });
    } else {
      setStatus({ kind: 'error', message: result.error });
    }
    operationRef.current = false;
  };

  const showLocalIconInFinder = async (fileName: string) => {
    if (disabled || isBusy) return;

    try {
      const result = await window.electron.settings.revealLocalIcon(fileName);
      if (!mountedRef.current) return;
      setStatus(
        result.ok
          ? {
              kind: 'success',
              message: `Shown ${result.fileName} in Finder.`,
            }
          : { kind: 'error', message: result.error },
      );
    } catch {
      if (mountedRef.current) {
        setStatus({
          kind: 'error',
          message: 'The local icon could not be shown in Finder.',
        });
      }
    }
  };

  const getUrlImport = (url: string): IconImportFallback => {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === 'http:') {
      return {
        message: 'Checking webpage image…',
        operation: async () => ({
          ok: false,
          error:
            'Only public HTTPS webpage images are supported. Copy and paste this image instead.',
        }),
      };
    }
    if (parsedUrl.protocol === 'https:') {
      return {
        message: 'Downloading webpage image…',
        operation: () => window.electron.settings.importIconUrl(url),
      };
    }
    return {
      message: 'Reading webpage image…',
      operation: async () => {
        try {
          if (
            parsedUrl.protocol === 'data:' &&
            url.length > SETTINGS_ICON_MAX_INPUT_BYTES * 3 + 1024
          ) {
            return { ok: false, error: ICON_TOO_LARGE_ERROR } as const;
          }
          const response = await fetch(url);
          const bytes = await readLimitedResponse(response);
          return window.electron.settings.importIconBytes(
            bytes,
            'web-image',
            response.headers.get('content-type') ?? '',
          );
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error && error.message === ICON_TOO_LARGE_ERROR
                ? ICON_TOO_LARGE_ERROR
                : 'This webpage image cannot be read. Copy it and paste instead.',
          } as const;
        }
      },
    };
  };

  const importFile = (file: File, fallbackUrl?: string) => {
    const fallback = fallbackUrl ? getUrlImport(fallbackUrl) : undefined;
    return runImport(
      'Copying image to the persistent icon folder…',
      () => window.electron.settings.importDroppedFile(file),
      fallback,
    );
  };

  const importUrl = (url: string) => {
    const request = getUrlImport(url);
    return runImport(request.message, request.operation);
  };

  const importTransfer = (dataTransfer: DataTransfer) => {
    const file = getTransferFile(dataTransfer);
    const url = getTransferUrl(dataTransfer);
    if (file) {
      importFile(file, url);
      return true;
    }
    if (url) {
      importUrl(url);
      return true;
    }
    setStatus({
      kind: 'error',
      message: 'The dropped or pasted content does not contain an image.',
    });
    return false;
  };

  return (
    <div className="settings-icon-import-field">
      <ComboField
        disabled={disabled || isBusy}
        label={label}
        options={comboOptions}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <div
        aria-busy={isBusy}
        aria-disabled={disabled || isBusy}
        aria-label="Import an icon image"
        className={`settings-icon-dropzone ${
          isDragging ? 'is-dragging' : ''
        } ${isBusy ? 'is-importing' : ''}`}
        role="group"
        tabIndex={disabled || isBusy ? -1 : 0}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !isBusy) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !event.relatedTarget ||
            !event.currentTarget.contains(event.relatedTarget as Node)
          ) {
            setIsDragging(false);
          }
        }}
        onDragOver={(event) => {
          if (disabled || isBusy) {
            event.dataTransfer.dropEffect = 'none';
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled && !isBusy) importTransfer(event.dataTransfer);
        }}
        onPaste={(event) => {
          if (disabled || isBusy) return;
          const handled = importTransfer(event.clipboardData);
          if (!handled) {
            runImport('Reading image from clipboard…', () =>
              window.electron.settings.pasteIcon(),
            );
          }
          event.preventDefault();
        }}
      >
        <div
          aria-busy={preview.kind === 'loading'}
          aria-label={previewLabel}
          className={`settings-icon-preview is-${preview.kind}`}
          role="img"
          title={previewTitle}
        >
          {preview.kind === 'ready' ? (
            <img alt="" draggable={false} src={preview.dataUrl} />
          ) : null}
          {preview.kind === 'fallback' ? (
            <ImageIcon aria-hidden="true" size={21} />
          ) : null}
          {preview.kind === 'loading' ? (
            <LoaderCircle aria-hidden="true" size={21} />
          ) : null}
          {preview.kind === 'error' ? (
            <ImageOff aria-hidden="true" size={21} />
          ) : null}
          {preview.kind === 'empty' ? (
            <ImagePlus aria-hidden="true" size={21} />
          ) : null}
        </div>
        <div className="settings-icon-dropzone-copy">
          <span>Drop an image from Finder or a webpage</span>
          <small>{previewHint}</small>
          <div className="settings-icon-import-actions">
            <button
              disabled={disabled || isBusy}
              type="button"
              onClick={() => {
                runImport('Importing selected image…', () =>
                  window.electron.settings.chooseIcon(),
                );
              }}
            >
              <FolderOpen aria-hidden="true" size={14} />
              Choose…
            </button>
            <button
              disabled={disabled || isBusy}
              type="button"
              onClick={() => {
                runImport('Reading image from clipboard…', () =>
                  window.electron.settings.pasteIcon(),
                );
              }}
            >
              <ClipboardPaste aria-hidden="true" size={14} />
              Paste Image
            </button>
            {localIcons.length > 0 ? (
              <button
                aria-controls={managerId}
                aria-expanded={isManagerOpen}
                disabled={disabled || isBusy}
                type="button"
                onClick={() => setIsManagerOpen((isOpen) => !isOpen)}
              >
                <ImageIcon aria-hidden="true" size={14} />
                Manage Local…
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {isManagerOpen ? (
        <div
          aria-label="Manage local icon images"
          className="settings-local-icon-manager"
          id={managerId}
          role="dialog"
        >
          <div className="settings-local-icon-manager-header">
            <div>
              <strong>Local images</strong>
              <small>
                Deleting an image keeps its configuration references.
              </small>
            </div>
            <button type="button" onClick={() => setIsManagerOpen(false)}>
              Done
            </button>
          </div>
          <div className="settings-local-icon-list">
            {localIcons.map((icon) => (
              <div className="settings-local-icon-row" key={icon.fileName}>
                <span className="settings-local-icon-thumbnail">
                  {icon.dataUrl ? (
                    <img alt="" draggable={false} src={icon.dataUrl} />
                  ) : (
                    <ImageIcon aria-hidden="true" size={16} />
                  )}
                </span>
                <span title={icon.fileName}>{icon.fileName}</span>
                <div className="settings-local-icon-actions">
                  <button
                    aria-label={`Show ${icon.fileName} in Finder`}
                    className="settings-icon-reveal-button"
                    disabled={disabled || isBusy}
                    title="Show in Finder"
                    type="button"
                    onClick={() => showLocalIconInFinder(icon.fileName)}
                  >
                    <FolderOpen aria-hidden="true" size={13} />
                  </button>
                  <button
                    className="settings-icon-delete-button"
                    disabled={disabled || isBusy}
                    type="button"
                    onClick={() => deleteLocalIcon(icon.fileName)}
                  >
                    <Trash2 aria-hidden="true" size={13} />
                    Delete…
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {visibleStatus ? (
        <div
          className={`settings-icon-import-status is-${visibleStatus.kind}`}
          role={visibleStatus.kind === 'error' ? 'alert' : 'status'}
        >
          {visibleStatus.message}
        </div>
      ) : null}
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  checked?: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleField({
  label,
  checked = false,
  onChange,
}: ToggleFieldProps) {
  return (
    <div className="settings-toggle-row">
      <span>{label}</span>
      <button
        aria-checked={checked}
        aria-label={label}
        className="settings-switch"
        role="switch"
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

interface IconButtonProps {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}

export function IconButton({
  label,
  disabled,
  danger,
  children,
  onClick,
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`settings-icon-button ${danger ? 'is-danger' : ''}`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface CollectionToolbarProps {
  addLabel?: string;
  deleteDisabled?: boolean;
  deleteLabel?: string;
  selectedIndex: number;
  itemCount: number;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  extra?: React.ReactNode;
}

export function CollectionToolbar({
  addLabel = 'Add',
  deleteDisabled = false,
  deleteLabel = 'Delete',
  selectedIndex,
  itemCount,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  extra,
}: CollectionToolbarProps) {
  const hasSelection = selectedIndex >= 0 && selectedIndex < itemCount;
  return (
    <div className="settings-collection-toolbar">
      <IconButton label={addLabel} onClick={onAdd}>
        <Plus size={16} />
      </IconButton>
      {extra}
      <span className="settings-toolbar-spacer" />
      <IconButton
        disabled={!hasSelection}
        label="Duplicate"
        onClick={onDuplicate}
      >
        <Copy size={15} />
      </IconButton>
      <IconButton
        disabled={!hasSelection || selectedIndex === 0}
        label="Move up"
        onClick={() => onMove(-1)}
      >
        <ChevronUp size={16} />
      </IconButton>
      <IconButton
        disabled={!hasSelection || selectedIndex === itemCount - 1}
        label="Move down"
        onClick={() => onMove(1)}
      >
        <ChevronDown size={16} />
      </IconButton>
      <IconButton
        danger
        disabled={!hasSelection || deleteDisabled}
        label={deleteLabel}
        onClick={onDelete}
      >
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}

interface BrowserProfilesEditorProps {
  profiles?: BrowserProfileConfig[];
  onChange: (profiles: BrowserProfileConfig[]) => void;
}

function createBrowserProfileId(profiles: BrowserProfileConfig[]) {
  const highestProfileNumber = profiles.reduce((highestNumber, profile) => {
    const match = /^Profile-(\d+)$/i.exec(profile.id.trim());
    return match
      ? Math.max(highestNumber, Number.parseInt(match[1], 10))
      : highestNumber;
  }, 0);
  return `Profile-${highestProfileNumber + 1}`;
}

export function BrowserProfilesEditor({
  profiles = [],
  onChange,
}: BrowserProfilesEditorProps) {
  const updateProfile = (
    index: number,
    patch: Partial<BrowserProfileConfig>,
  ) => {
    onChange(
      profiles.map((profile, profileIndex) =>
        profileIndex === index ? { ...profile, ...patch } : profile,
      ),
    );
  };

  return (
    <div className="settings-subsection">
      <div className="settings-subsection-header">
        <h3>Browser profiles</h3>
        <IconButton
          label="Add browser profile"
          onClick={() =>
            onChange([
              ...profiles,
              {
                id: createBrowserProfileId(profiles),
                name: '',
                profileDirectory: '',
                path: '',
              },
            ])
          }
        >
          <Plus size={16} />
        </IconButton>
      </div>
      <div className="settings-table">
        {profiles.map((profile, index) => (
          <div
            className="settings-table-row settings-browser-row"
            key={profile.id}
          >
            <input
              readOnly
              aria-label="Profile ID"
              title={profile.id}
              value={profile.id}
            />
            <input
              aria-label="Profile name"
              placeholder="Work"
              value={profile.name}
              onChange={(event) =>
                updateProfile(index, { name: event.target.value })
              }
            />
            <input
              aria-label="Profile directory"
              placeholder="Profile 9"
              value={profile.profileDirectory}
              onChange={(event) =>
                updateProfile(index, {
                  profileDirectory: event.target.value,
                })
              }
            />
            <input
              aria-label="Browser path"
              placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
              value={profile.path}
              onChange={(event) =>
                updateProfile(index, { path: event.target.value })
              }
            />
            <IconButton
              danger
              label="Delete browser profile"
              onClick={() =>
                onChange(
                  profiles.filter(
                    (_profile, profileIndex) => profileIndex !== index,
                  ),
                )
              }
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        {profiles.length === 0 ? (
          <div className="settings-empty-row">No browser profiles</div>
        ) : null}
      </div>
    </div>
  );
}

interface DomainProfilesEditorProps {
  domainProfiles?: DomainProfileConfig[];
  profileOptions: Array<{ id: string; name: string }>;
  onChange: (domainProfiles: DomainProfileConfig[]) => void;
}

export function DomainProfilesEditor({
  domainProfiles = [],
  profileOptions,
  onChange,
}: DomainProfilesEditorProps) {
  const updateRule = (index: number, patch: Partial<DomainProfileConfig>) => {
    onChange(
      domainProfiles.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...patch } : rule,
      ),
    );
  };

  return (
    <div className="settings-subsection">
      <div className="settings-subsection-header">
        <h3>Domain profiles</h3>
        <IconButton
          label="Add domain profile"
          onClick={() =>
            onChange([
              ...domainProfiles,
              { domains: [], profileId: profileOptions[0]?.id ?? '' },
            ])
          }
        >
          <Plus size={16} />
        </IconButton>
      </div>
      <div className="settings-table">
        {domainProfiles.map((rule, index) => (
          // Domain rows are not reorderable; their array position is stable while editing.
          // eslint-disable-next-line react/no-array-index-key
          <div className="settings-table-row settings-profile-row" key={index}>
            <input
              aria-label="Domains"
              placeholder="*.ringcentral.com"
              value={formatStringList(rule.domains)}
              onChange={(event) =>
                updateRule(index, {
                  domains: parseStringList(event.target.value),
                })
              }
            />
            <select
              aria-label="Browser profile"
              value={rule.profileId}
              onChange={(event) =>
                updateRule(index, { profileId: event.target.value })
              }
            >
              <option value="">Select profile</option>
              {rule.profileId &&
              !profileOptions.some(
                (profile) => profile.id === rule.profileId,
              ) ? (
                <option value={rule.profileId}>{rule.profileId}</option>
              ) : null}
              {profileOptions.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <IconButton
              danger
              label="Delete domain profile"
              onClick={() =>
                onChange(
                  domainProfiles.filter(
                    (_rule, ruleIndex) => ruleIndex !== index,
                  ),
                )
              }
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        {domainProfiles.length === 0 ? (
          <div className="settings-empty-row">No domain profiles</div>
        ) : null}
      </div>
    </div>
  );
}

interface WindowSizeEditorProps {
  size?: ConfigWindowSize;
  onChange: (size: ConfigWindowSize | undefined) => void;
}

export function WindowSizeEditor({ size, onChange }: WindowSizeEditorProps) {
  const mode = typeof size === 'object' ? 'custom' : (size ?? '');
  const customSize =
    typeof size === 'object' ? size : { width: 960, height: 640 };
  const updateCustomSize = (patch: Partial<typeof customSize>) =>
    onChange({ ...customSize, ...patch });

  return (
    <div className="settings-subsection">
      <SelectField
        label="Window size"
        options={[
          { label: 'Default', value: '' },
          ...WINDOW_SIZE_PRESETS.map((preset) => ({
            label: preset,
            value: preset,
          })),
          { label: 'Custom', value: 'custom' },
        ]}
        value={mode}
        onChange={(nextMode) => {
          if (!nextMode) {
            onChange(undefined);
          } else if (nextMode === 'custom') {
            onChange(customSize);
          } else {
            onChange(nextMode as WindowSizePreset);
          }
        }}
      />
      {mode === 'custom' ? (
        <div className="settings-field-grid settings-field-grid--five">
          <NumberField
            label="Width"
            min={320}
            value={customSize.width}
            onChange={(width) => updateCustomSize({ width: width ?? 960 })}
          />
          <NumberField
            label="Height"
            min={240}
            value={customSize.height}
            onChange={(height) => updateCustomSize({ height: height ?? 640 })}
          />
          <NumberField
            label="X"
            value={customSize.x}
            onChange={(x) => updateCustomSize({ x })}
          />
          <NumberField
            label="Y"
            value={customSize.y}
            onChange={(y) => updateCustomSize({ y })}
          />
          <ToggleField
            checked={customSize.fullscreen}
            label="Fullscreen"
            onChange={(fullscreen) => updateCustomSize({ fullscreen })}
          />
        </div>
      ) : null}
    </div>
  );
}
