import React, { memo } from 'react';
import { AgentChip } from './AgentChip';
import { ContextTools } from './ContextTools';
import { ContextToolsRight } from './ContextToolsRight';
import { FileContextChip } from './FileContextChip';
import { CodexContextManagementSelect } from './selectors/CodexContextManagementSelect';
import { CodexContextWindowToggle } from './selectors/CodexContextWindowToggle';
import type { CodexContextWindowPreset, CodexContextWindowValue, SelectedAgent } from './types';

interface ContextBarProps {
  activeFile?: string;
  selectedLines?: string;
  percentage?: number;
  usedTokens?: number;
  maxTokens?: number;
  showUsage?: boolean;
  onClearFile?: () => void;
  onAddAttachment?: (files: FileList) => void;
  selectedAgent?: SelectedAgent | null;
  onClearAgent?: () => void;
  /** Current provider (for conditional rendering) */
  currentProvider?: string;
  /** Whether there are messages (for rewind button visibility) */
  hasMessages?: boolean;
  /** Rewind callback */
  onRewind?: () => void;
  /** Whether StatusPanel is expanded */
  statusPanelExpanded?: boolean;
  /** Toggle StatusPanel expand/collapse */
  onToggleStatusPanel?: () => void;
  /** Whether auto open file is enabled */
  autoOpenFileEnabled?: boolean;
  /** Callback to enable file context (called from placeholder click) */
  onRequestEnableFileContext?: () => void;
  /** Codex-only global context controls */
  codexContextWindow?: CodexContextWindowValue;
  codexContextWindowLoading?: boolean;
  codexContextWindowSaving?: boolean;
  onCodexContextWindowChange?: (preset: CodexContextWindowPreset) => void;
  codexContextManagement?: boolean;
  codexContextManagementSaving?: boolean;
  onCodexContextManagementChange?: (enabled: boolean) => void;
}

export const ContextBar: React.FC<ContextBarProps> = memo(({
  activeFile,
  selectedLines,
  percentage = 0,
  usedTokens,
  maxTokens,
  showUsage = true,
  onClearFile,
  onAddAttachment,
  selectedAgent,
  onClearAgent,
  currentProvider = 'claude',
  hasMessages = false,
  onRewind,
  statusPanelExpanded = true,
  onToggleStatusPanel,
  autoOpenFileEnabled = false,
  onRequestEnableFileContext,
  codexContextWindow = 'default',
  codexContextWindowLoading = false,
  codexContextWindowSaving = false,
  onCodexContextWindowChange,
  codexContextManagement = false,
  codexContextManagementSaving = false,
  onCodexContextManagementChange,
}) => {
  return (
    <div className="context-bar">
      {/* Tool Icons Group */}
      <ContextTools
        percentage={percentage}
        usedTokens={usedTokens}
        maxTokens={maxTokens}
        showUsage={showUsage}
        onAddAttachment={onAddAttachment}
      >
        {currentProvider === 'codex' && onCodexContextWindowChange && (
          <CodexContextWindowToggle
            value={codexContextWindow}
            loading={codexContextWindowLoading}
            saving={codexContextWindowSaving}
            disabled={codexContextManagementSaving}
            onChange={onCodexContextWindowChange}
          />
        )}

        {currentProvider === 'codex' && onCodexContextManagementChange && (
          <CodexContextManagementSelect
            enabled={codexContextManagement}
            disabled={codexContextWindowLoading || codexContextWindowSaving || codexContextManagementSaving}
            onChange={onCodexContextManagementChange}
          />
        )}

      </ContextTools>

      {/* Selected Agent Chip */}
      {selectedAgent && (
        <AgentChip agent={selectedAgent} onClearAgent={onClearAgent} />
      )}

      {/* Active Context Chip or Empty Placeholder */}
      <FileContextChip
        activeFile={activeFile}
        selectedLines={selectedLines}
        autoOpenFileEnabled={autoOpenFileEnabled}
        onClearFile={onClearFile}
        onRequestEnableFileContext={onRequestEnableFileContext}
      />

      {/* Right side tools - StatusPanel toggle and Rewind button */}
      <ContextToolsRight
        currentProvider={currentProvider}
        hasMessages={hasMessages}
        onRewind={onRewind}
        statusPanelExpanded={statusPanelExpanded}
        onToggleStatusPanel={onToggleStatusPanel}
      />
    </div>
  );
});
