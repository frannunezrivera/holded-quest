import { daysBetween, parseAmount, parseDate } from './parse';
import type {
  BankAccount,
  Doc,
  FinanceSnapshot,
  HoldedAccountV2,
  HoldedDocV2,
  HoldedPaymentV2,
  Payment,
  Period,
  RawFinanceData,
  ResourceId,
} from './types';

const IN_DOC_TYPES = new Set(['invoice', 'invoices', 'salesreceipt', 'salesreceipts', 'purchaserefund', 'purchaserefunds']);
const OUT_DOC_TYPES = new Set(['purchase', 'purchases', 'creditnote', 'creditnotes']);

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Payment list items carry no in/out field, so direction comes from the document type
 * (sales docs = money in, purchases/credit notes = money out), falling back to the sign.
 */
export function paymentDirection(p: HoldedPaymentV2): 'in' | 'out' {
  const type = (p.document_type ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (IN_DOC_TYPES.has(type)) return 'in';
  if (OUT_DOC_TYPES.has(type)) return 'out';
  return parseAmount(p.amount) < 0 ? 'out' : 'in';
}

export function normalizePayment(p: HoldedPaymentV2): Payment | null {
  const date = parseDate(p.date);
  const amount = Math.abs(parseAmount(p.amount));
  if (!date || amount === 0) return null;
  return {
    id: String(p.id),
    direction: paymentDirection(p),
    contact: (p.contact_name ?? '').trim() || '—',
    amount: round2(amount),
    date,
    documentType: p.document_type ?? null,
    documentId: p.document_id ?? null,
    description: (p.description ?? '').trim(),
  };
}

/** Returns an outstanding document, or null if it is paid, cancelled, failed or a draft. */
export function normalizeOutstandingDoc(d: HoldedDocV2, kind: Doc['kind'], today: string): Doc | null {
  const status = (d.status ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'failed' || status === 'completed') return null;
  if ((d.approval_status ?? '').toLowerCase() === 'draft') return null;
  const total = parseAmount(d.total);
  const paid = parseAmount(d.payments_total);
  const pending = d.payments_pending != null ? parseAmount(d.payments_pending) : total - paid;
  if (pending <= 0.004) return null;
  const date = parseDate(d.date) ?? today;
  const dueDate = parseDate(d.due_date);
  const daysToDue = dueDate ? daysBetween(today, dueDate) : null;
  return {
    id: String(d.id),
    kind,
    number: (d.document_number ?? '').trim() || String(d.id).slice(-6),
    contact: (d.contact_name ?? '').trim() || '—',
    date,
    dueDate,
    total: round2(total),
    paid: round2(paid),
    pending: round2(pending),
    status: paid > 0 || status === 'partial' ? 'partial' : 'pending',
    currency: (d.currency ?? 'eur').toUpperCase(),
    daysOverdue: daysToDue != null && daysToDue < 0 ? -daysToDue : 0,
    daysToDue,
  };
}

export function normalizeAccount(a: HoldedAccountV2): BankAccount | null {
  if (a.archived) return null;
  return {
    id: String(a.id),
    name: (a.name ?? '').trim() || '—',
    type: a.type ?? 'bank',
    balance: round2(parseAmount(a.balance)),
    currency: (a.currency ?? 'eur').toUpperCase(),
  };
}

/** Estimate collections from invoices when the key cannot read payments. */
function collectedFromInvoices(docs: HoldedDocV2[]): Payment[] {
  const out: Payment[] = [];
  for (const d of docs) {
    const status = (d.status ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'failed') continue;
    const paid = parseAmount(d.payments_total);
    const date = parseDate(d.date);
    if (paid <= 0 || !date) continue;
    out.push({
      id: `inv-${d.id}`,
      direction: 'in',
      contact: (d.contact_name ?? '').trim() || '—',
      amount: round2(paid),
      date,
      documentType: 'invoice',
      documentId: String(d.id),
      description: d.document_number ?? '',
    });
  }
  return out;
}

const inPeriod = (date: string, period: Period) => date >= period.from && date <= period.to;
const byDateDesc = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const byOverdue = (a: Doc, b: Doc) => b.daysOverdue - a.daysOverdue || b.pending - a.pending;

export interface NormalizeOptions {
  source: FinanceSnapshot['source'];
  companyName: string;
  period: Period;
  today: string;
  fetchedAt?: string;
}

export function normalize(raw: RawFinanceData, opts: NormalizeOptions): FinanceSnapshot {
  const { period, today } = opts;
  const locked: ResourceId[] = [];
  if (raw.outstandingInvoices === null) locked.push('invoices');
  if (raw.outstandingPurchases === null) locked.push('purchases');
  if (raw.payments === null) locked.push('payments');
  if (raw.accounts === null) locked.push('treasury');

  const payments = (raw.payments ?? []).map(normalizePayment).filter((p): p is Payment => !!p && inPeriod(p.date, period));
  const collectedEstimated = raw.payments === null && raw.periodInvoices !== null;
  const collected = collectedEstimated
    ? collectedFromInvoices(raw.periodInvoices ?? []).filter((p) => inPeriod(p.date, period))
    : payments.filter((p) => p.direction === 'in');

  const owedByClients = (raw.outstandingInvoices ?? [])
    .map((d) => normalizeOutstandingDoc(d, 'invoice', today))
    .filter((d): d is Doc => !!d)
    .sort(byOverdue);
  const owedToSuppliers = (raw.outstandingPurchases ?? [])
    .map((d) => normalizeOutstandingDoc(d, 'purchase', today))
    .filter((d): d is Doc => !!d)
    .sort(byOverdue);

  const currencies = [...owedByClients, ...owedToSuppliers].map((d) => d.currency);
  const currency = mostCommon(currencies) ?? 'EUR';

  return {
    source: opts.source,
    companyName: opts.companyName,
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    today,
    period,
    currency,
    collected: collected.sort(byDateDesc),
    paidOut: payments.filter((p) => p.direction === 'out').sort(byDateDesc),
    owedByClients,
    owedToSuppliers,
    accounts: raw.accounts === null ? null : raw.accounts.map(normalizeAccount).filter((a): a is BankAccount => !!a),
    locked,
    collectedEstimated,
  };
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let max = 0;
  for (const [v, c] of counts) if (c > max) [best, max] = [v, c];
  return best;
}
