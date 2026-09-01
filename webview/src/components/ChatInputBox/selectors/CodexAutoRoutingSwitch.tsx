import Switch from 'antd/es/switch';
import { useTranslation } from 'react-i18next';

interface CodexAutoRoutingSwitchProps {
  enabled?: boolean;
  loading?: boolean;
  saving?: boolean;
  onChange?: (enabled: boolean) => void;
}

/** Shared routing mode persisted in ~/.codex/AGENTS.md for CC GUI and Codex desktop. */
export const CodexAutoRoutingSwitch = ({
  enabled = false,
  loading = false,
  saving = false,
  onChange,
}: CodexAutoRoutingSwitchProps) => {
  const { t } = useTranslation();
  const disabled = loading || saving || !onChange;
  const label = t('codexAutoRouting.label', { defaultValue: 'Auto routing' });
  const description = t('codexAutoRouting.description', {
    defaultValue: 'Terra xhigh manages; Luna xhigh handles bounded sub-tasks. Applies to new Codex sessions in CC GUI and Desktop.',
  });

  return (
    <div className="selector-button codex-auto-routing-switch" title={description} data-testid="codex-auto-routing-switch">
      <span className={`codicon ${saving || loading ? 'codicon-loading codicon-modifier-spin' : 'codicon-git-branch'}`} />
      <span className="selector-button-text">{label}</span>
      <Switch
        size="small"
        checked={enabled}
        disabled={disabled}
        onClick={(checked, event) => {
          event.stopPropagation();
          onChange?.(checked);
        }}
      />
    </div>
  );
};

export default CodexAutoRoutingSwitch;
