import type { CodexContextWindowPreset, CodexContextWindowValue } from '../types';
import { CodexContextWindowToggle } from './CodexContextWindowToggle';

/**
 * Backward-compatible export for the former dropdown component. Production
 * UI now uses the single 1M checkbox, but keeping this wrapper avoids a
 * breaking import for the legacy ModelConfigSelect path.
 */
export function CodexContextWindowSelect({
  value,
  loading = false,
  saving = false,
  onChange,
  onClose,
}: {
  value: CodexContextWindowValue;
  contextWindowTokens?: number | null;
  loading?: boolean;
  saving?: boolean;
  onChange: (preset: CodexContextWindowPreset) => void;
  onRefresh?: () => void;
  embedded?: boolean;
  triggerRef?: React.RefObject<HTMLElement | null>;
  onClose?: () => void;
}) {
  const handleChange = (preset: CodexContextWindowPreset) => {
    onChange(preset);
    onClose?.();
  };

  return (
    <CodexContextWindowToggle
      value={value}
      loading={loading}
      saving={saving}
      onChange={handleChange}
    />
  );
}

export function formatTokenCount(tokens?: number | null): string {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return '';
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }
  const value = tokens / 1_000;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')}K`;
}

export default CodexContextWindowSelect;
