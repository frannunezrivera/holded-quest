import { isDraft } from './normalize';
import { addDays, daysBetween, parseAmount, parseDate } from './parse';
import type { HoldedDocV2, VatDoc, VatQuarter } from './types';

export interface QuarterInfo {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  from: string;
  to: string;
  deadline: string;
  closed: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

function quarterRange(year: number, q: 1 | 2 | 3 | 4) {
  const startMonth = (q - 1) * 3 + 1;
  const from = `${year}-${pad(startMonth)}-01`;
  const nextStart = q === 4 ? `${year + 1}-01-01` : `${year}-${pad(startMonth + 3)}-01`;
  return { from, to: addDays(nextStart, -1) };
}

/** Spanish model 303 deadlines: 20 Apr, 20 Jul, 20 Oct and 30 Jan of the following year. */
export function deadlineFor(year: number, q: 1 | 2 | 3 | 4): string {
  if (q === 4) return `${year + 1}-01-30`;
  return `${year}-${pad(q * 3 + 1)}-20`;
}

/**
 * The quarter that matters today: the one just closed while its filing window is open
 * (e.g. 1–20 October → Q3), otherwise the quarter in progress.
 */
export function relevantQuarter(today: string): QuarterInfo {
  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7);
  const current = (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
  const prev = (current === 1 ? 4 : current - 1) as 1 | 2 | 3 | 4;
  const prevYear = current === 1 ? year - 1 : year;
  const prevDeadline = deadlineFor(prevYear, prev);
  if (today <= prevDeadline) return { year: prevYear, quarter: prev, ...quarterRange(prevYear, prev), deadline: prevDeadline, closed: true };
  return { year, quarter: current, ...quarterRange(year, current), deadline: deadlineFor(year, current), closed: false };
}

export function daysToDeadline(q: QuarterInfo, today: string): number {
  return daysBetween(today, q.deadline);
}

function vatDocs(docs: HoldedDocV2[], q: QuarterInfo): VatDoc[] {
  const out: VatDoc[] = [];
  for (const d of docs) {
    const status = (d.status ?? '').toLowerCase();
    if (status === 'cancelled' || status === 'failed') continue;
    if (isDraft(d)) continue;
    const date = parseDate(d.date);
    if (!date || date < q.from || date > q.to) continue;
    const tax = parseAmount(d.tax);
    const total = parseAmount(d.total);
    const base = d.subtotal != null ? parseAmount(d.subtotal) : total - tax;
    out.push({
      id: String(d.id),
      number: (d.document_number ?? '').trim() || String(d.id).slice(-6),
      contact: (d.contact_name ?? '').trim() || '—',
      date,
      base: Math.round(base * 100) / 100,
      tax: Math.round(tax * 100) / 100,
    });
  }
  return out.sort((a, b) => b.tax - a.tax);
}

/**
 * Estimated model 303 for the quarter: VAT charged on sales invoices minus VAT paid on purchase
 * invoices. Credit notes, prorrata and special regimes are not considered — it is a guide only.
 */
export function buildVatQuarter(invoices: HoldedDocV2[], purchases: HoldedDocV2[] | null, q: QuarterInfo, currency: string): VatQuarter {
  const sales = vatDocs(invoices, q);
  const bought = vatDocs(purchases ?? [], q);
  const output = Math.round(sales.reduce((a, d) => a + d.tax, 0) * 100) / 100;
  const input = Math.round(bought.reduce((a, d) => a + d.tax, 0) * 100) / 100;
  return {
    year: q.year,
    quarter: q.quarter,
    from: q.from,
    to: q.to,
    deadline: q.deadline,
    closed: q.closed,
    output,
    input,
    net: Math.round((output - input) * 100) / 100,
    sales,
    purchases: bought,
    currency,
    inputUnknown: purchases === null,
  };
}
