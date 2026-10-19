import type { TFunction } from 'i18next';
import type { CodexContextWindowValue } from '../types';

export function formatTokenCount(tokens?: number | null): string {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return '';
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }
  const value = tokens / 1_000;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '')}K`;
}


export function getCodexContextWindowLabel(
  t: TFunction,
  value: CodexContextWindowValue,
  tokens?: number | null,
): string {
  if (value === '1m') return t('codexContextWindow.oneMillionLabel', { defaultValue: '1M' });
  if (value === 'default') return t('codexContextWindow.default.label', { defaultValue: 'Model default' });
  return t('codexContextWindow.customLabel', {
    value: formatTokenCount(tokens ?? (value === '500k' ? 500_000 : null)) || '—',
    defaultValue: 'Custom {{value}}',
  });
}
