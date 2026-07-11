import React from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import {
  BrowserProfileConfig,
  ConfigWindowSize,
  DomainProfileConfig,
  WINDOW_SIZE_PRESETS,
  WindowSizePreset,
} from '../../shared/config';
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

interface ComboFieldProps {
  label: string;
  value?: string;
  options: readonly string[];
  placeholder?: string;
  onChange: (value: string) => void;
}

export function ComboField({
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

  const openOptions = () => {
    const selectedIndex = options.findIndex((option) => option === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setIsOpen(true);
  };

  const selectOption = (option: string) => {
    onChange(option);
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
          aria-expanded={isOpen}
          id={inputId}
          ref={inputRef}
          role="combobox"
          placeholder={placeholder}
          type="text"
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange(nextValue);
            setActiveIndex(options.findIndex((option) => option === nextValue));
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
              if (activeIndex >= 0) {
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
        {isOpen ? (
          <div
            className="settings-combobox-options"
            id={listboxId}
            role="listbox"
          >
            {options.map((option, index) => (
              <button
                aria-selected={option === value}
                className={`settings-combobox-option ${
                  index === activeIndex ? 'is-active' : ''
                }`}
                key={option}
                role="option"
                type="button"
                onClick={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
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
