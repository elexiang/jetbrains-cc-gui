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
  it('shows the unified model config selector for Codex', () => {
    const props = {
      selectedModel: 'gpt-5.6-sol',
      currentProvider: 'codex',
      onModelSelect: vi.fn(),
      onProviderSelect: vi.fn(),
      onCodexContextWindowChange: vi.fn(),
      onCodexContextWindowRefresh: vi.fn(),
    } as const;
    const { rerender } = render(<ButtonArea {...props} />);

    const modelConfigTrigger = screen.getByTestId('model-config-trigger');
    expect(modelConfigTrigger).toBeTruthy();
    expect(screen.queryByTitle('chat.currentModel')).toBeNull();
    expect(screen.queryByTitle('Select reasoning depth')).toBeNull();
    expect(screen.queryByTitle('Select Codex speed mode')).toBeNull();

    fireEvent.click(modelConfigTrigger);
    expect(screen.getByTestId('model-selector-dropdown')).toBeTruthy();
    expect(screen.getByTestId('model-config-option-codex-context')).toBeTruthy();
    fireEvent.click(screen.getByTestId('model-config-option-codex-context'));
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.click(modelConfigTrigger);
    rerender(<ButtonArea {...props} currentProvider="claude" />);
    expect(screen.queryByTestId('model-config-option-codex-context')).toBeNull();
  });
});
