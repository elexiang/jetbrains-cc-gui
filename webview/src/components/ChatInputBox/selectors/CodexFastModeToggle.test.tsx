import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodexFastModeToggle } from './CodexFastModeToggle';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('CodexFastModeToggle', () => {
  it('maps the checkbox to Fast and normal modes', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CodexFastModeToggle value="normal" onChange={onChange} />,
    );

    const toggle = screen.getByRole('checkbox', { name: 'Fast' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.textContent).toContain('Fast');
    const checkbox = toggle.querySelector('.selector-checkbox');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.classList.contains('is-checked')).toBe(false);
    expect(checkbox?.querySelector('.codicon-check')).toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('fast');

    rerender(<CodexFastModeToggle value="fast" onChange={onChange} />);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(checkbox?.classList.contains('is-checked')).toBe(true);
    expect(checkbox?.querySelector('.codicon-check')).not.toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('normal');
  });

  it('does not render a dropdown trigger or menu', () => {
    render(<CodexFastModeToggle value="normal" onChange={vi.fn()} />);

    expect(screen.queryByTestId('codex-fast-mode-dropdown')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
