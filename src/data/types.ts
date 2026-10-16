// ---------- Raw Holded v2 shapes (only the fields we use; everything optional-ish) ----------

export interface HoldedDocV2 {
  id: string;
  document_number?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  description?: string | null;
  date?: string | null; // YYYY-MM-DD
  due_date?: string | null; // YYYY-MM-DD
  total?: string | number | null; // decimal string, e.g. "121.00"
  currency?: string | null;
  status?: string | null; // pending | partial | completed | cancelled | failed
  approval_status?: string | null; // draft | approved
  payments_total?: string | number | null;
  payments_pending?: string | number | null;
  subtotal?: string | number | null;
  tax?: string | number | null;
}

export interface HoldedPaymentV2 {
  id: string;
  bank_account_id?: string | null;
  contact_id?: string | null;
  contact_name?: string | null;
  amount?: string | number | null;
  description?: string | null;
  date?: string | null;
  status?: string | null;
  document_type?: string | null; // invoice | purchase | creditnote | ...
  document_id?: string | null;
}

export interface HoldedAccountV2 {
  id: string;
  name?: string | null;
  type?: string | null; // bank | card | gateway | cash
  currency?: string | null;
  balance?: string | number | null;
  archived?: boolean | null;
}

/** A line of a bank statement (GET /v2/treasury/accounts/{id}/bank-movements). */
export interface HoldedBankMovementV2 {
  id: string;
  amount?: string | number | null;
  balance?: string | number | null;
  value_date?: string | null;
  date?: string | null;
  description?: string | null;
  concept?: string | null;
  status?: string | null;
}

export interface HoldedPage<T> {
  items: T[];
  cursor: string | null;
  has_more: boolean;
}

export type ResourceId = 'invoices' | 'purchases' | 'payments' | 'treasury';

/** Everything downloaded from Holded for one refresh, before normalization. */
export interface RawFinanceData {
  outstandingInvoices: HoldedDocV2[] | null; // null = locked (403)
  outstandingPurchases: HoldedDocV2[] | null;
  payments: HoldedPaymentV2[] | null;
  /** Only fetched when payments are locked: invoices issued in the period, to estimate collections. */
  periodInvoices: HoldedDocV2[] | null;
  accounts: HoldedAccountV2[] | null;
}

// ---------- Normalized game data ----------

export interface Period {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  id: PeriodId;
}

export type PeriodId = 'thisYear' | 'last12' | `y${number}`;

export interface Doc {
  id: string;
  kind: 'invoice' | 'purchase';
  number: string;
  contact: string;
  date: string;
  dueDate: string | null;
  total: number;
  paid: number;
  pending: number;
  status: 'pending' | 'partial';
  currency: string;
  /** Days past the due date at snapshot time; 0 if not overdue. */
  daysOverdue: number;
  /** Days until due (negative when overdue); null without a due date. */
  daysToDue: number | null;
}

export interface Payment {
  id: string;
  direction: 'in' | 'out';
  contact: string;
  amount: number; // always positive
  date: string;
  documentType: string | null;
  documentId: string | null;
  description: string;
}

export interface BankAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
}

export interface FinanceSnapshot {
  source: 'demo' | 'holded';
  companyName: string;
  fetchedAt: string; // ISO timestamp
  today: string; // YYYY-MM-DD used for overdue math
  period: Period;
  currency: string;
  /** Money in during the period (collections from clients). */
  collected: Payment[];
  /** Money out during the period (supplier bills paid). */
  paidOut: Payment[];
  /** Sales invoices clients still owe you (any date). */
  owedByClients: Doc[];
  /** Purchase invoices you still owe suppliers (any date). */
  owedToSuppliers: Doc[];
  accounts: BankAccount[] | null;
  locked: ResourceId[];
  /** True when `collected` was estimated from invoices because payments were locked. */
  collectedEstimated: boolean;
}

export interface Stratum {
  key: string;
  label: string;
  total: number;
  count: number;
  tone: 'gold' | 'ok' | 'warn' | 'danger';
}

export interface ContactTotal {
  name: string;
  total: number;
  count: number;
}

// ---------- On-demand extras (loaded only when the river or the VAT boss is opened) ----------

export interface CashPoint {
  date: string;
  balance: number;
}

export interface CashEvent {
  date: string;
  amount: number; // signed: + money in, − money out
  label: string;
}

export interface CashSeries {
  /** 'bank' = real bank movements; 'estimated' = rebuilt from collections and supplier payments. */
  source: 'bank' | 'estimated';
  currency: string;
  /** Whether the curve is anchored to the real current bank balance. */
  anchored: boolean;
  points: CashPoint[]; // one per day, oldest first
  events: CashEvent[]; // the biggest movements, oldest first
}

export interface VatDoc {
  id: string;
  number: string;
  contact: string;
  date: string;
  base: number;
  tax: number;
}

export interface VatQuarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  from: string;
  to: string;
  /** Last day to file (Spain, model 303). */
  deadline: string;
  /** True when the quarter is over and we are inside its filing window. */
  closed: boolean;
  output: number; // IVA repercutido (sales)
  input: number; // IVA soportado (purchases)
  net: number; // output − input: > 0 to pay, < 0 to offset/refund
  sales: VatDoc[];
  purchases: VatDoc[];
  currency: string;
  /** The key cannot read purchases, so `input` is unknown (shown as 0). */
  inputUnknown: boolean;
}
