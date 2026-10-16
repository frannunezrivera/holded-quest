import { monthKeys } from './parse';
import type { ContactTotal, Doc, FinanceSnapshot, Payment, Period, Stratum } from './types';

export const sum = <T>(items: readonly T[], fn: (t: T) => number) => items.reduce((acc, t) => acc + fn(t), 0);

export const totalCollected = (s: FinanceSnapshot) => sum(s.collected, (p) => p.amount);
export const totalPaidOut = (s: FinanceSnapshot) => sum(s.paidOut, (p) => p.amount);
export const totalOwedToSuppliers = (s: FinanceSnapshot) => sum(s.owedToSuppliers, (d) => d.pending);
export const totalOwedByClients = (s: FinanceSnapshot) => sum(s.owedByClients, (d) => d.pending);
export const totalCash = (s: FinanceSnapshot) => (s.accounts ? sum(s.accounts, (a) => a.balance) : null);
export const overdue = (docs: readonly Doc[]) => docs.filter((d) => d.daysOverdue > 0);

/** One stratum per month of the period (zeros included), oldest first. */
export function monthlyStrata(payments: readonly Payment[], period: Period, locale: string): Stratum[] {
  const keys = monthKeys(period);
  const buckets = new Map(keys.map((k) => [k, { total: 0, count: 0 }]));
  for (const p of payments) {
    const b = buckets.get(p.date.slice(0, 7));
    if (b) {
      b.total += p.amount;
      b.count++;
    }
  }
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' });
  return keys.map((k) => {
    const b = buckets.get(k)!;
    return {
      key: k,
      label: fmt.format(new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, 15))),
      total: b.total,
      count: b.count,
      tone: 'gold' as const,
    };
  });
}

export const AGING_BUCKETS = [
  { key: 'notDue', min: -Infinity, max: 0, tone: 'ok' },
  { key: 'd1_30', min: 1, max: 30, tone: 'warn' },
  { key: 'd31_60', min: 31, max: 60, tone: 'warn' },
  { key: 'd61_90', min: 61, max: 90, tone: 'danger' },
  { key: 'd90plus', min: 91, max: Infinity, tone: 'danger' },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]['key'];

/** Aging strata, least overdue at the bottom (so the most dangerous debts sit at the summit). */
export function agingStrata(docs: readonly Doc[], label: (key: AgingKey) => string): Stratum[] {
  return AGING_BUCKETS.map((b) => {
    const inBucket = docs.filter((d) => d.daysOverdue >= b.min && d.daysOverdue <= b.max);
    return { key: b.key, label: label(b.key), total: sum(inBucket, (d) => d.pending), count: inBucket.length, tone: b.tone };
  });
}

export function topContacts<T extends { contact: string }>(items: readonly T[], amount: (t: T) => number, n = 5): ContactTotal[] {
  const map = new Map<string, ContactTotal>();
  for (const it of items) {
    const c = map.get(it.contact) ?? { name: it.contact, total: 0, count: 0 };
    c.total += amount(it);
    c.count++;
    map.set(it.contact, c);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

/** Maps an amount onto a 0..1 height with a sqrt curve so small and large totals both read. */
export function heightRatio(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, Math.sqrt(value / max));
}
