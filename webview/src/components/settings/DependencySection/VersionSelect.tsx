import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './style.module.less';

interface VersionSelectProps {
  value: string;
  options: string[];
  disabled: boolean;
  label: string;
  valueLabel: string;
  allowCustomVersion?: boolean;
  onChange: (version: string) => void;
}

const VersionSelect = ({
  value,
  options,
  disabled,
  label,
  valueLabel,
  allowCustomVersion = false,
  onChange,
}: VersionSelectProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const displayValue = value ? `v${value}` : '-';
  const customVersion = search.trim().replace(/^[vV]/, '');
  const canChooseCustom = allowCustomVersion && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(customVersion)
    && !options.includes(customVersion);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [open]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <div className={styles.versionSelect} ref={containerRef}>
      <button
        type="button"
        className={`${styles.versionSelectTrigger} ${open ? styles.open : ''}`}
        onClick={() => { setSearch(''); setOpen((prev) => !prev); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={valueLabel}
      >
        <span className={styles.versionSelectValue}>{displayValue}</span>
        <span className={`codicon codicon-chevron-down ${styles.versionSelectIcon}`} />
      </button>

      {open && (
        <div className={styles.versionDropdown} role="listbox" aria-label={label}>
          <input
            type="search"
            className={styles.versionSearch}
            aria-label={t('settings.dependency.searchVersions')}
            placeholder={t('settings.dependency.searchVersions')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
          />
          {canChooseCustom && (
            <button type="button" role="option" aria-selected={false} className={styles.versionOption}
              onClick={() => { onChange(customVersion); setOpen(false); }}>
              {t('settings.dependency.useVersion', { version: `v${customVersion}` })}
            </button>
          )}
          {options.filter(version => version.toLowerCase().includes(search.trim().toLowerCase())).map((version) => {
            const selected = version === value;

            return (
              <button
                key={version}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.versionOption} ${selected ? styles.selected : ''}`}
                onClick={() => {
                  onChange(version);
                  setOpen(false);
                }}
              >
                <span>{`v${version}`}</span>
                {selected && <span className="codicon codicon-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VersionSelect;
