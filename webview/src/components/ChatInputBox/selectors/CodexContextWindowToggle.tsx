import { useTranslation } from 'react-i18next';
import type { CodexContextWindowPreset, CodexContextWindowValue } from '../types';

interface CodexContextWindowToggleProps {
  value: CodexContextWindowValue;
  loading?: boolean;
  saving?: boolean;
  disabled?: boolean;
  onChange: (preset: CodexContextWindowPreset) => void;
}

/**
 * The compact 1M-only control used in the top ContextBar.
 * Any non-1M value is intentionally displayed as unchecked; the next click
 * normalizes it to one of the two supported UI states.
 */
export function CodexContextWindowToggle({
  value,
  loading = false,
  saving = false,
  disabled = false,
  onChange,
}: CodexContextWindowToggleProps) {
  const { t } = useTranslation();
  const checked = value === '1m';
  const isDisabled = disabled || loading || saving;

  return (
    <button
      type="button"
      className="selector-button context-bar-selector codex-context-window-toggle"
      role="checkbox"
      aria-checked={checked}
      aria-label={t('codexContextWindow.oneMillionLabel', { defaultValue: '1M' })}
      title={t('codexContextWindow.oneMillionDescription', {
        defaultValue: 'Use a 1M Codex context window; turn off to restore the default 272K window.',
      })}
      disabled={isDisabled}
      data-testid="codex-context-window-toggle"
      onClick={(event) => {
        event.stopPropagation();
        if (!isDisabled) onChange(checked ? 'default' : '1m');
      }}
    >
      <span
        className={`codicon ${loading || saving
          ? 'codicon-loading codicon-modifier-spin'
          : checked ? 'codicon-check' : 'codicon-circle-outline'}`}
        aria-hidden="true"
      />
      <span className="selector-button-text">
        {t('codexContextWindow.oneMillionLabel', { defaultValue: '1M' })}
      </span>
    </button>
  );
}

export default CodexContextWindowToggle;
