import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodexContextWindowToggle } from './CodexContextWindowToggle';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

describe('CodexContextWindowToggle', () => {
  it('maps the checkbox to the default and 1M presets only', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CodexContextWindowToggle value="default" onChange={onChange} />,
    );

    const toggle = screen.getByRole('checkbox', { name: '1M' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    const checkbox = toggle.querySelector('.selector-checkbox');
    expect(checkbox).not.toBeNull();
    expect(checkbox?.classList.contains('is-checked')).toBe(false);
    expect(checkbox?.querySelector('.codicon-check')).toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('1m');

    rerender(<CodexContextWindowToggle value="1m" onChange={onChange} />);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(checkbox?.classList.contains('is-checked')).toBe(true);
    expect(checkbox?.querySelector('.codicon-check')).not.toBeNull();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('default');
  });

  it('treats a legacy non-1M value as unchecked until the user changes it', () => {
    const onChange = vi.fn();
    render(<CodexContextWindowToggle value="500k" onChange={onChange} />);

    const toggle = screen.getByRole('checkbox', { name: '1M' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith('1m');
  });

  it('disables interaction while loading or saving', () => {
    const { rerender } = render(
      <CodexContextWindowToggle value="default" loading onChange={vi.fn()} />,
    );
    expect(screen.getByRole('checkbox', { name: '1M' })).toHaveProperty('disabled', true);

    rerender(<CodexContextWindowToggle value="1m" saving onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: '1M' })).toHaveProperty('disabled', true);
  });
});
