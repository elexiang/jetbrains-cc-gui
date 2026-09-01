import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CodexAutoRoutingSwitch } from './CodexAutoRoutingSwitch';

vi.mock('antd/es/switch', () => ({
  default: ({ checked, disabled, onClick }: {
    checked: boolean;
    disabled?: boolean;
    onClick: (checked: boolean, event: MouseEvent) => void;
  }) => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      onClick={(event) => onClick(!checked, event.nativeEvent)}
    >
      toggle
    </button>
  ),
}));

describe('CodexAutoRoutingSwitch', () => {
  it('changes the shared routing state through its callback', () => {
    const onChange = vi.fn();
    render(<CodexAutoRoutingSwitch enabled={false} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not permit interaction while a shared setting is saving', () => {
    const onChange = vi.fn();
    render(<CodexAutoRoutingSwitch enabled saving onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'toggle' })).toHaveProperty('disabled', true);
  });
});
