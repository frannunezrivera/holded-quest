import type { Period, PeriodId } from './types';

/**
 * Parses Holded amounts. v2 returns decimal strings ("121.00"), but localized strings
 * ("1.234,56") have been seen in the wild, so both separators are handled.
 */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  let s = value.trim().replace(/[^\d.,\-]/g, '');
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal one.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = s.split(',').length - 1;
    s = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    const dots = s.split('.').length - 1;
    if (dots > 1) s = s.replace(/\./g, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Accepts YYYY-MM-DD, full ISO strings, or unix seconds; returns YYYY-MM-DD or null. */
export function parseDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return toIsoDate(new Date(value * 1000));
  }
  if (typeof value !== 'string' || !value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/^\d+$/.test(value)) return parseDate(Number(value));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : toIsoDate(d);
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from a to b (b - a), both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

export function periodFor(id: PeriodId, today: string): Period {
  const year = +today.slice(0, 4);
  if (id === 'last12') {
    // The current month plus the 11 before it.
    return { id, from: addMonths(`${year - 1}-${today.slice(5, 7)}-01`, 1), to: today };
  }
  if (id.startsWith('y')) {
    const y = Number(id.slice(1));
    return { id, from: `${y}-01-01`, to: y === year ? today : `${y}-12-31` };
  }
  return { id: 'thisYear', from: `${year}-01-01`, to: today };
}

function addMonths(date: string, months: number): string {
  const y = +date.slice(0, 4);
  const m = +date.slice(5, 7) - 1 + months;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM keys for every month touched by the period, oldest first. */
export function monthKeys(period: Period): string[] {
  const keys: string[] = [];
  let cur = period.from.slice(0, 7) + '-01';
  const end = period.to.slice(0, 7);
  while (cur.slice(0, 7) <= end && keys.length < 36) {
    keys.push(cur.slice(0, 7));
    cur = addMonths(cur, 1);
  }
  return keys;
}
