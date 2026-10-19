import { useTranslation } from 'react-i18next';
import type { CodexContextWindowPreset, CodexContextWindowValue } from '../types';
import { SelectorCheckbox } from './SelectorCheckbox';
import { getCodexContextWindowLabel } from './codexContextWindowLabels';

interface CodexContextWindowToggleProps {
  value: CodexContextWindowValue;
  contextWindowTokens?: number | null;
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
  contextWindowTokens,
  loading = false,
  saving = false,
  disabled = false,
  onChange,
}: CodexContextWindowToggleProps) {
  const { t } = useTranslation();
  const checked = value === '1m';
  const isDisabled = disabled || loading || saving;
  const description = t('codexContextWindow.oneMillionDescription', {
    defaultValue: 'Request a 1M Codex context window; turn off to follow the model default. Actual capacity depends on the runtime.',
  });
  const title = value === 'custom' || value === '500k'
    ? `${getCodexContextWindowLabel(t, value, contextWindowTokens)}. ${description}`
    : description;

  return (
    <button
      type="button"
      className="selector-button context-bar-selector codex-context-window-toggle"
      role="checkbox"
      aria-checked={checked}
      aria-label={t('codexContextWindow.oneMillionLabel', { defaultValue: '1M' })}
      title={title}
      disabled={isDisabled}
      data-testid="codex-context-window-toggle"
      onClick={(event) => {
        event.stopPropagation();
        if (!isDisabled) onChange(checked ? 'default' : '1m');
      }}
    >
      {loading || saving ? (
        <span className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
      ) : (
        <SelectorCheckbox checked={checked} />
      )}
      <span className="selector-button-text">
        {t('codexContextWindow.oneMillionLabel', { defaultValue: '1M' })}
      </span>
    </button>
  );
}

export default CodexContextWindowToggle;
