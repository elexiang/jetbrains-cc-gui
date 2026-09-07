import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ButtonArea } from './ButtonArea';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
    }),
  };
});

describe('ButtonArea Codex selector placement', () => {
  it('keeps the context controls out of the bottom toolbar', () => {
    const props = {
      selectedModel: 'gpt-5.6-sol',
      currentProvider: 'codex',
      onModelSelect: vi.fn(),
      onProviderSelect: vi.fn(),
    } as const;
    const { rerender } = render(<ButtonArea {...props} />);

    expect(screen.queryByTestId('model-config-trigger')).toBeNull();
    expect(screen.getByTestId('model-select-trigger')).toBeTruthy();
    expect(screen.getByTestId('reasoning-select-trigger')).toBeTruthy();
    expect(screen.getByTestId('codex-fast-mode-trigger')).toBeTruthy();
    expect(screen.queryByTestId('codex-context-window-toggle')).toBeNull();
    expect(screen.queryByTestId('codex-context-management-trigger')).toBeNull();

    rerender(<ButtonArea {...props} currentProvider="claude" selectedModel="claude-sonnet-5" />);
    expect(screen.queryByTestId('codex-context-window-toggle')).toBeNull();
    expect(screen.queryByTestId('codex-context-management-trigger')).toBeNull();
    expect(screen.getByTestId('model-select-trigger')).toBeTruthy();
    expect(screen.getByTestId('reasoning-select-trigger')).toBeTruthy();
  });
});
