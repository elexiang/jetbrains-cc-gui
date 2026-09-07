interface SelectorCheckboxProps {
  checked: boolean;
}

/** Small theme-safe square checkbox indicator shared by compact selectors. */
export function SelectorCheckbox({ checked }: SelectorCheckboxProps) {
  return (
    <span className={`selector-checkbox${checked ? ' is-checked' : ''}`} aria-hidden="true">
      {checked && <span className="codicon codicon-check" />}
    </span>
  );
}

export default SelectorCheckbox;
