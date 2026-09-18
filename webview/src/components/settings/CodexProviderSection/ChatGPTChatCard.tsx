import { useTranslation } from 'react-i18next';
import type { CodexProviderConfig } from '../../../types/provider';
import sharedStyles from '../ProviderList/style.module.less';
import { sendToJava } from '../../../utils/bridge';

const ICON_STYLE: React.CSSProperties = { marginRight: '8px' };

interface ChatGPTChatCardProps {
  provider: CodexProviderConfig;
  onSwitchCodexProvider: (id: string) => void;
}

/**
 * Pinned browser-backed provider. Account setup is hosted by its local runtime.
 */
const ChatGPTChatCard = ({ provider, onSwitchCodexProvider }: ChatGPTChatCardProps) => {
  const { t } = useTranslation();
  const name = provider.name || t('settings.codexProvider.dialog.chatGPTProviderName', {
    defaultValue: 'ChatGPT Chat',
  });

  return (
    <div
      className={`${sharedStyles.card} ${provider.isActive ? sharedStyles.active : ''} ${sharedStyles.localProviderCard}`}
      data-testid="chatgpt-chat-provider-card"
    >
      <div className={sharedStyles.cardInfo}>
        <div className={sharedStyles.name}>
          <span className="codicon codicon-comment-discussion" style={ICON_STYLE} />
          <span className={sharedStyles.nameText}>{name}</span>
        </div>
        <div className={sharedStyles.website}>
          {t('settings.codexProvider.dialog.chatGPTProviderDescription', {
            defaultValue: 'ChatGPT Web — separate browser login and model settings; no Codex fallback',
          })}
        </div>
      </div>

      <div className={sharedStyles.cardActions}>
        <button type="button" className={sharedStyles.useButton}
          onClick={() => sendToJava('open_chatgpt_web_settings')}>
          {t('settings.codexProvider.dialog.chatGPTWebSetup', { defaultValue: '登录与设置 / Setup' })}
        </button>
        {provider.isActive ? (
          <div className={sharedStyles.activeBadge}>
            <span className="codicon codicon-check" />
            {t('settings.provider.inUse')}
          </div>
        ) : (
          <button
            type="button"
            className={sharedStyles.useButton}
            onClick={() => onSwitchCodexProvider(provider.id)}
          >
            <span className="codicon codicon-play" />
            {t('settings.provider.enable')}
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatGPTChatCard;
