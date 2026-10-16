import { en } from './en';
import { es, type MessageKey } from './es';
import { loadSettings } from '../data/store';

export type { MessageKey };

const dicts = { es, en } as const;

export function lang() {
  return loadSettings().lang;
}

export function locale() {
  return lang() === 'es' ? 'es-ES' : 'en-GB';
}

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const dict = dicts[lang()] as Record<string, string>;
  // Singular variants live under "<key>.one" and are picked automatically when n === 1.
  const one = vars.n === 1 ? dict[`${key}.one`] : undefined;
  const s: string = one ?? dict[key] ?? es[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function money(n: number, currency = 'EUR', decimals?: number): string {
  const abs = Math.abs(n);
  const digits = decimals ?? (abs >= 1000 ? 0 : 2);
  try {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${currency}`;
  }
}

/** Compact money for tight spaces: 12,4 mil € / €12.4K. */
export function moneyShort(n: number, currency = 'EUR'): string {
  if (Math.abs(n) < 10_000) return money(n, currency, 0);
  try {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return money(n, currency, 0);
  }
}

export function num(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function fmtRelative(isoTimestamp: string): string {
  const diffMin = Math.round((Date.parse(isoTimestamp) - Date.now()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffMin) < 60 * 24) return rtf.format(Math.round(diffMin / 60), 'hour');
  return rtf.format(Math.round(diffMin / 1440), 'day');
}
