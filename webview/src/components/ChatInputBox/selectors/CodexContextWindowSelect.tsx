import type { CodexContextWindowPreset, CodexContextWindowValue } from '../types';
import { CodexContextWindowToggle } from './CodexContextWindowToggle';

/**
 * Backward-compatible export for the former dropdown component. Production
 * UI now uses the single 1M checkbox, but keeping this wrapper avoids a
 * breaking import for the legacy ModelConfigSelect path.
 */
export function CodexContextWindowSelect({
  value,
  contextWindowTokens,
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
      contextWindowTokens={contextWindowTokens}
      loading={loading}
      saving={saving}
      onChange={handleChange}
    />
  );
}

export { formatTokenCount } from './codexContextWindowLabels';

export default CodexContextWindowSelect;
