import { useTranslation } from 'react-i18next';
import type { CodexFastMode } from '../types';
import { SelectorCheckbox } from './SelectorCheckbox';

interface CodexFastModeToggleProps {
  value: CodexFastMode;
  onChange: (mode: CodexFastMode) => void;
}

/**
 * Compact Codex speed control used in the bottom toolbar.
 * Checked means the request uses Codex's fast service tier; unchecked keeps
 * the normal Codex defaults.
 */
export function CodexFastModeToggle({ value, onChange }: CodexFastModeToggleProps) {
  const { t } = useTranslation();
  const checked = value === 'fast';

  return (
    <button
      type="button"
      className={`selector-button codex-fast-mode-toggle${checked ? ' codex-fast-active' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={t('codexFastMode.fast.label', { defaultValue: 'Fast' })}
      title={t('codexFastMode.toggleTitle', { defaultValue: 'Toggle Codex Fast mode' })}
      data-testid="codex-fast-mode-toggle"
      onClick={(event) => {
        event.stopPropagation();
        onChange(checked ? 'normal' : 'fast');
      }}
    >
      <SelectorCheckbox checked={checked} />
      <span className="selector-button-text">
        {t('codexFastMode.fast.label', { defaultValue: 'Fast' })}
      </span>
    </button>
  );
}

export default CodexFastModeToggle;
