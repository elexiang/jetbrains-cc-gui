import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropdownPosition } from '../../../hooks/useDropdownPosition';

interface CodexContextManagementSelectProps {
  enabled: boolean;
  disabled?: boolean;
  onChange: (enabled: boolean) => void;
}

const RELATIVE_INLINE_BLOCK_STYLE: React.CSSProperties = {
  position: 'relative',
  display: 'inline-block',
};
const CHEVRON_ICON_STYLE: React.CSSProperties = { fontSize: '10px', marginLeft: '2px' };
const DROPDOWN_STYLE: React.CSSProperties = {
  width: 'min(360px, calc(100vw - 16px))',
  maxWidth: 'calc(100vw - 16px)',
  boxSizing: 'border-box',
  whiteSpace: 'normal',
};
const OPTION_INFO_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
};

const OPTIONS = [
  {
    id: 'new' as const,
    enabled: true,
    label: 'New context management · Experimental',
    description: 'When the context approaches its limit, use experimental compaction to preserve task-relevant information and reduce context usage for longer continuous sessions. Applies only to newly started Codex sessions.',
    icon: 'codicon-sparkle',
  },
  {
    id: 'old' as const,
    enabled: false,
    label: 'Legacy context management',
    description: 'Keep Codex\'s existing context-handling strategy without enabling experimental compaction. Applies only to newly started Codex sessions.',
    icon: 'codicon-history',
  },
];

export function CodexContextManagementSelect({
  enabled,
  disabled = false,
  onChange,
}: CodexContextManagementSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { positionedStyle, maxHeight, maxWidth, recalculate } = useDropdownPosition({
    buttonRef,
    dropdownRef,
    preferredAlignment: 'left',
    preferredPlacement: 'below',
    minWidth: 300,
    maxWidth: 360,
  });

  const currentOption = enabled ? OPTIONS[0] : OPTIONS[1];
  const getOptionText = useCallback((
    option: typeof OPTIONS[number],
    field: 'label' | 'description',
  ) => {
    const key = option.id === 'new'
      ? field === 'label' ? 'newLabel' : 'newDescription'
      : field === 'label' ? 'oldLabel' : 'oldDescription';
    return t(`codexContextManagement.${key}`, { defaultValue: option[field] });
  }, [t]);

  const handleToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;
    setIsOpen(current => !current);
  }, [disabled]);

  const handleSelect = useCallback((nextEnabled: boolean) => {
    if (disabled) return;
    onChange(nextEnabled);
    setIsOpen(false);
  }, [disabled, onChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target)
        && buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    document.addEventListener('keydown', handleEscape);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen) recalculate();
  }, [isOpen, recalculate]);

  const dropdownStyle: React.CSSProperties = {
    ...DROPDOWN_STYLE,
    ...positionedStyle,
    ...(maxWidth != null ? { maxWidth: `${maxWidth}px` } : {}),
    ...(maxHeight != null
      ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' as const }
      : { overflowY: 'visible' as const }),
  };

  return (
    <div
      className="context-bar-selector-wrapper"
      style={RELATIVE_INLINE_BLOCK_STYLE}
      data-testid="codex-context-management-select"
    >
      <button
        ref={buttonRef}
        type="button"
        className="selector-button context-bar-selector codex-context-management-select"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('codexContextManagement.selectorTitle', { defaultValue: 'Context management' })}
        disabled={disabled}
        data-testid="codex-context-management-trigger"
        title={getOptionText(currentOption, 'description')}
        onClick={handleToggle}
      >
        <span className={`codicon ${currentOption.icon}`} aria-hidden="true" />
        <span className="selector-button-text">
          {t(enabled ? 'codexContextManagement.newShort' : 'codexContextManagement.oldShort', {
            defaultValue: enabled ? 'New' : 'Old',
          })}
        </span>
        <span className={`codicon codicon-chevron-${isOpen ? 'up' : 'down'}`} style={CHEVRON_ICON_STYLE} aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="selector-dropdown codex-context-management-dropdown"
          style={dropdownStyle}
          role="listbox"
          aria-label={t('codexContextManagement.selectorTitle', { defaultValue: 'Context management' })}
          data-testid="codex-context-management-dropdown"
          onMouseEnter={(event) => event.stopPropagation()}
        >
          {OPTIONS.map(option => (
            <div
              key={option.id}
              className={`selector-option ${option.enabled === enabled ? 'selected' : ''}`}
              role="option"
              aria-selected={option.enabled === enabled}
              data-testid={`codex-context-management-option-${option.id}`}
              title={getOptionText(option, 'description')}
              onClick={() => handleSelect(option.enabled)}
            >
              <span className={`codicon ${option.icon}`} aria-hidden="true" />
              <div style={OPTION_INFO_STYLE}>
                <span>{getOptionText(option, 'label')}</span>
                <span className="mode-description">{getOptionText(option, 'description')}</span>
              </div>
              {option.enabled === enabled && <span className="codicon codicon-check check-mark" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CodexContextManagementSelect;
