import { fireEvent, render, screen } from '@testing-library/react';
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
  it('shows model settings as separate toolbar selectors for Codex', () => {
    const props = {
      selectedModel: 'gpt-5.6-sol',
      currentProvider: 'codex',
      onModelSelect: vi.fn(),
      onProviderSelect: vi.fn(),
      onCodexContextWindowChange: vi.fn(),
      onCodexContextWindowRefresh: vi.fn(),
    } as const;
    const { rerender } = render(<ButtonArea {...props} />);

    expect(screen.queryByTestId('model-config-trigger')).toBeNull();
    expect(screen.getByTitle('chat.currentModel')).toBeTruthy();
    expect(screen.getByTitle('Select reasoning depth')).toBeTruthy();
    expect(screen.getByTitle('Select Codex speed mode')).toBeTruthy();

    const contextSelector = screen.getByTestId('codex-context-window-select');
    fireEvent.click(contextSelector.querySelector('button')!);
    expect(screen.getAllByRole('option')).toHaveLength(3);

    rerender(<ButtonArea {...props} currentProvider="claude" />);
    expect(screen.queryByTestId('codex-context-window-select')).toBeNull();
  });
});
