import type { Doc, FinanceSnapshot, Payment, ResourceId } from './types';

export interface SnapshotDiff {
  newCollected: Payment[];
  newPaidOut: Payment[];
  newDebts: Doc[];
  clearedDebts: Doc[];
  newReceivables: Doc[];
  clearedReceivables: Doc[];
}

const ids = <T extends { id: string }>(items: readonly T[]) => new Set(items.map((i) => i.id));
const added = <T extends { id: string }>(before: readonly T[], after: readonly T[]) => {
  const seen = ids(before);
  return after.filter((i) => !seen.has(i.id));
};

/** What changed between the snapshot the player last saw and a fresh one. */
export function diffSnapshots(prev: FinanceSnapshot, next: FinanceSnapshot): SnapshotDiff {
  // Payments are period-bound: if the period changed, a diff of them would be meaningless.
  const samePeriod = prev.period.from === next.period.from && prev.period.to <= next.period.to;
  // A resource that is locked on either side reads as empty, which would fake "all paid" / "all new".
  const readable = (r: ResourceId) => !prev.locked.includes(r) && !next.locked.includes(r);
  const payments = samePeriod && readable('payments') && prev.collectedEstimated === next.collectedEstimated;
  const purchases = readable('purchases');
  const invoices = readable('invoices');
  return {
    newCollected: payments ? added(prev.collected, next.collected) : [],
    newPaidOut: payments ? added(prev.paidOut, next.paidOut) : [],
    newDebts: purchases ? added(prev.owedToSuppliers, next.owedToSuppliers) : [],
    clearedDebts: purchases ? added(next.owedToSuppliers, prev.owedToSuppliers) : [],
    newReceivables: invoices ? added(prev.owedByClients, next.owedByClients) : [],
    clearedReceivables: invoices ? added(next.owedByClients, prev.owedByClients) : [],
  };
}

export function isEmptyDiff(d: SnapshotDiff): boolean {
  return Object.values(d).every((list) => list.length === 0);
}
