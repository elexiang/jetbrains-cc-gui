import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextBar } from './ContextBar';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (_key: string, options?: { defaultValue?: string; value?: string }) =>
      options?.defaultValue?.replace('{{value}}', options?.value ?? '') ?? _key,
  }),
}));

vi.mock('../../hooks/useClaudePlanUsage', () => ({
  useClaudePlanUsage: () => ({ snapshot: null, status: 'unavailable' }),
}));

describe('ContextBar Codex controls', () => {
  it.each(['default', '1m', 'custom'] as const)(
    'keeps the reported capacity independent of the %s request', (preset) => {
      const { container } = render(
        <ContextBar currentProvider="codex" codexContextWindow={preset}
          codexContextWindowTokens={preset === 'custom' ? 640_000 : null}
          usedTokens={95_000} maxTokens={475_000} percentage={20}
          onCodexContextWindowChange={vi.fn()} />,
      );
      expect(container.querySelector('.token-tooltip')?.textContent).toContain('95k / 475k');
      const toggle = screen.getByTestId('codex-context-window-toggle');
      if (preset === 'custom') expect(toggle.title).toContain('Custom 640K');
      expect(toggle.getAttribute('aria-checked')).toBe(String(preset === '1m'));
    },
  );

  it('keeps the 1M toggle after usage without a context management selector', () => {
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
    expect(token.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toggle.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('codex-context-management-trigger')).toBeNull();

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
