import { describe, expect, it } from 'vitest';
import { diffSnapshots, isEmptyDiff } from '../src/data/diff';
import { buildDemoSnapshot } from '../src/data/service';

describe('diffSnapshots', () => {
  const base = buildDemoSnapshot('thisYear', '2026-10-15');

  it('is empty for identical snapshots', () => {
    expect(isEmptyDiff(diffSnapshots(base, base))).toBe(true);
  });

  it('detects new collections, paid debts and new bills', () => {
    const [paidDebt, ...stillOwed] = base.owedToSuppliers;
    const newBill = { ...paidDebt, id: 'new-bill' };
    const newPayment = { ...base.collected[0], id: 'new-pay' };
    const next = { ...base, collected: [newPayment, ...base.collected], owedToSuppliers: [...stillOwed, newBill] };
    const d = diffSnapshots(base, next);
    expect(d.newCollected.map((p) => p.id)).toEqual(['new-pay']);
    expect(d.clearedDebts.map((x) => x.id)).toEqual([paidDebt.id]);
    expect(d.newDebts.map((x) => x.id)).toEqual(['new-bill']);
    expect(d.newReceivables).toEqual([]);
  });

  it('ignores period-bound payments when the period changed', () => {
    const other = buildDemoSnapshot('last12', '2026-10-15');
    expect(diffSnapshots(base, other).newCollected).toEqual([]);
  });

  it('does not invent changes for resources that became locked', () => {
    const locked = { ...base, locked: ['purchases' as const, 'payments' as const], owedToSuppliers: [], collected: [], paidOut: [] };
    const d = diffSnapshots(base, locked);
    expect(d.clearedDebts).toEqual([]);
    expect(d.newCollected).toEqual([]);
    expect(isEmptyDiff(diffSnapshots(locked, base))).toBe(true);
  });
});
