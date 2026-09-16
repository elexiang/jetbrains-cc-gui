import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextBar } from './ContextBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('../../hooks/useClaudePlanUsage', () => ({
  useClaudePlanUsage: () => ({ snapshot: null, status: 'unavailable' }),
}));

describe('ContextBar Codex controls', () => {
  it('places both controls after usage and before the divider', () => {
    const onWindowChange = vi.fn();
    const onManagementChange = vi.fn();
    const { container, rerender } = render(
      <ContextBar
        currentProvider="codex"
        codexContextWindow="default"
        onCodexContextWindowChange={onWindowChange}
        onCodexContextManagementChange={onManagementChange}
      />,
    );

    const tools = container.querySelector('.context-tools') as HTMLElement;
    const token = tools.querySelector('.context-token-indicator') as HTMLElement;
    const divider = tools.querySelector('.context-tool-divider') as HTMLElement;
    const toggle = screen.getByTestId('codex-context-window-toggle');
    const management = screen.getByTestId('codex-context-management-trigger');
    expect(token.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(management) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(management.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(toggle);
    expect(onWindowChange).toHaveBeenCalledWith('1m');

    rerender(
      <ContextBar
        currentProvider="claude"
        onCodexContextWindowChange={onWindowChange}
        onCodexContextManagementChange={onManagementChange}
      />,
    );
    expect(screen.queryByTestId('codex-context-window-toggle')).toBeNull();
    expect(screen.queryByTestId('codex-context-management-trigger')).toBeNull();
  });
});
