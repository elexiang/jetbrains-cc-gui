import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodexContextManagementSelect } from './CodexContextManagementSelect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('CodexContextManagementSelect', () => {
  it('shows only New/Old in the trigger and full explanations in the menu', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CodexContextManagementSelect enabled={false} onChange={onChange} />,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger.textContent).toContain('Old');
    fireEvent.click(trigger);

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText('New context management · Experimental')).toBeTruthy();
    expect(screen.getAllByText(/experimental compaction/i)).toHaveLength(2);
    expect(screen.getByText('Legacy context management')).toBeTruthy();
    expect(screen.getByText(/existing context-handling strategy/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId('codex-context-management-option-new'));
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(<CodexContextManagementSelect enabled onChange={onChange} />);
    expect(screen.getByRole('combobox').textContent).toContain('New');
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByTestId('codex-context-management-option-old'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('disables the selector while saving', () => {
    render(<CodexContextManagementSelect enabled={false} disabled onChange={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveProperty('disabled', true);
  });
});
