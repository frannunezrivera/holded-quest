import { addDays, daysBetween, parseAmount, parseDate } from './parse';
import type { BankAccount, CashEvent, CashPoint, CashSeries, FinanceSnapshot, HoldedBankMovementV2, Period } from './types';

const MAX_EVENTS = 24;

interface Flow {
  date: string;
  amount: number;
  label: string;
}

/** Every day from `from` to `to`, inclusive. */
function days(from: string, to: string): string[] {
  const n = Math.max(0, daysBetween(from, to));
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}

/**
 * Rebuilds end-of-day balances by walking backwards from a known closing balance:
 * balance(day − 1) = balance(day) − flows(day). Only needs amounts, so it works even when the
 * API omits running balances, and it always agrees with the cash shown in the HUD.
 */
export function rebuildBalances(flows: Flow[], closing: number, from: string, to: string): CashPoint[] {
  const perDay = new Map<string, number>();
  for (const f of flows) perDay.set(f.date, (perDay.get(f.date) ?? 0) + f.amount);
  const list = days(from, to);
  const out: CashPoint[] = new Array(list.length);
  let balance = closing;
  for (let i = list.length - 1; i >= 0; i--) {
    out[i] = { date: list[i], balance: Math.round(balance * 100) / 100 };
    balance -= perDay.get(list[i]) ?? 0;
  }
  return out;
}

function biggest(flows: Flow[]): CashEvent[] {
  return [...flows]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, MAX_EVENTS)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((f) => ({ date: f.date, amount: Math.round(f.amount * 100) / 100, label: f.label }));
}

export function normalizeMovement(m: HoldedBankMovementV2): Flow | null {
  const date = parseDate(m.value_date ?? m.date);
  const amount = parseAmount(m.amount);
  if (!date || amount === 0) return null;
  return { date, amount, label: (m.description ?? m.concept ?? '').trim() };
}

/**
 * River from real bank movements. Movements are fetched from the start of the period up to today
 * so the backwards walk from today's balance is exact, then the series is cut to the period.
 */
export function cashSeriesFromMovements(
  accounts: BankAccount[],
  movements: Record<string, HoldedBankMovementV2[]>,
  period: Period,
  today: string,
  currency: string,
): CashSeries {
  const end = period.to < today ? period.to : today;
  const all: Flow[] = [];
  let total: CashPoint[] | null = null;
  for (const a of accounts) {
    const flows = (movements[a.id] ?? []).map(normalizeMovement).filter((f): f is Flow => !!f && f.date >= period.from && f.date <= today);
    all.push(...flows.filter((f) => f.date <= end));
    const series = rebuildBalances(flows, a.balance, period.from, today).filter((p) => p.date <= end);
    total = total ? total.map((p, i) => ({ date: p.date, balance: Math.round((p.balance + series[i].balance) * 100) / 100 })) : series;
  }
  return { source: 'bank', currency, anchored: true, points: total ?? rebuildBalances([], 0, period.from, end), events: biggest(all) };
}

/**
 * Fallback when bank movements can't be read: net daily flow of collections minus supplier payments,
 * anchored to today's bank balance when we know it (otherwise it starts at zero and shows the trend).
 */
export function cashSeriesFromPayments(s: FinanceSnapshot): CashSeries {
  const flows: Flow[] = [
    ...s.collected.map((p) => ({ date: p.date, amount: p.amount, label: p.contact })),
    ...s.paidOut.map((p) => ({ date: p.date, amount: -p.amount, label: p.contact })),
  ];
  const end = s.period.to < s.today ? s.period.to : s.today;
  const closing = s.accounts ? s.accounts.reduce((acc, a) => acc + a.balance, 0) : 0;
  let points = rebuildBalances(flows, closing, s.period.from, end);
  if (!s.accounts) {
    // No anchor: start the river at zero so it reads as cumulative net flow.
    const offset = points[0]?.balance ?? 0;
    points = points.map((p) => ({ date: p.date, balance: Math.round((p.balance - offset) * 100) / 100 }));
  }
  return { source: 'estimated', currency: s.currency, anchored: !!s.accounts, points, events: biggest(flows) };
}

export function seriesExtremes(points: CashPoint[]): { min: CashPoint; max: CashPoint } {
  let min = points[0];
  let max = points[0];
  for (const p of points) {
    if (p.balance < min.balance) min = p;
    if (p.balance > max.balance) max = p;
  }
  return { min, max };
}
