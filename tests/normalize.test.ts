import { describe, expect, it } from 'vitest';
import invoices from './fixtures/invoices-outstanding.json';
import payments from './fixtures/payments.json';
import { normalize, paymentDirection } from '../src/data/normalize';
import { addDays, daysBetween, monthKeys, parseAmount, parseDate, periodFor } from '../src/data/parse';
import { agingStrata, heightRatio, monthlyStrata, topContacts, totalOwedByClients } from '../src/data/aggregate';
import { generateDemoRaw } from '../src/data/demoData';
import type { HoldedDocV2, HoldedPaymentV2 } from '../src/data/types';

const today = '2026-10-15';
const period = periodFor('thisYear', today);
const base = { outstandingPurchases: [], periodInvoices: null, accounts: [] };

describe('parseAmount', () => {
  it.each([
    ['121.00', 121],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['12,5', 12.5],
    ['1.234.567', 1234567],
    ['-85.40', -85.4],
    ['€ 99', 99],
    [42, 42],
    [null, 0],
    ['abc', 0],
  ])('%s → %s', (input, expected) => expect(parseAmount(input)).toBeCloseTo(expected as number));
});

describe('dates', () => {
  it('parses ISO, date-only and unix seconds', () => {
    expect(parseDate('2026-03-01')).toBe('2026-03-01');
    expect(parseDate('2026-03-01T10:00:00Z')).toBe('2026-03-01');
    expect(parseDate(null)).toBeNull();
    expect(parseDate(1521673200)).toMatch(/^2018-03-2[12]$/);
  });
  it('computes day differences and periods', () => {
    expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(periodFor('thisYear', today)).toEqual({ id: 'thisYear', from: '2026-01-01', to: today });
    expect(periodFor('last12', today)).toEqual({ id: 'last12', from: '2025-11-01', to: today });
    expect(periodFor('y2025', today)).toEqual({ id: 'y2025', from: '2025-01-01', to: '2025-12-31' });
    expect(monthKeys(periodFor('last12', today))).toHaveLength(12);
  });
});

describe('normalize', () => {
  const snap = normalize(
    { ...base, outstandingInvoices: invoices.items as HoldedDocV2[], payments: payments.items as HoldedPaymentV2[] },
    { source: 'holded', companyName: 'X', period, today },
  );

  it('keeps only outstanding, approved, non-cancelled invoices, most overdue first', () => {
    expect(snap.owedByClients.map((d) => d.id)).toEqual(['inv1', 'inv2']);
    const [inv1, inv2] = snap.owedByClients;
    expect(inv1.daysOverdue).toBe(45);
    expect(inv1.pending).toBe(1210);
    expect(inv2.status).toBe('partial');
    expect(inv2.daysOverdue).toBe(0);
    expect(inv2.daysToDue).toBe(17);
    expect(totalOwedByClients(snap)).toBe(1510);
  });

  it('splits payments by document type and filters by period', () => {
    expect(snap.collected.map((p) => p.id)).toEqual(['p3', 'p1']); // newest first, p5 out of period
    expect(snap.paidOut.map((p) => p.id).sort()).toEqual(['p2', 'p4', 'p6']);
    expect(snap.paidOut.every((p) => p.amount > 0)).toBe(true);
  });

  it('marks locked resources and estimates collections from invoices', () => {
    const locked = normalize(
      {
        outstandingInvoices: [],
        outstandingPurchases: null,
        payments: null,
        accounts: null,
        periodInvoices: [
          { id: 'a', date: '2026-02-01', total: '100.00', payments_total: '100.00', status: 'completed', contact_name: 'A' },
          { id: 'b', date: '2026-02-03', total: '50.00', payments_total: '0', status: 'pending' },
        ],
      },
      { source: 'holded', companyName: 'X', period, today },
    );
    expect(locked.locked).toEqual(['purchases', 'payments', 'treasury']);
    expect(locked.collectedEstimated).toBe(true);
    expect(locked.collected).toHaveLength(1);
    expect(locked.collected[0].amount).toBe(100);
    expect(locked.accounts).toBeNull();
  });

  it('derives payment direction', () => {
    expect(paymentDirection({ id: '1', document_type: 'credit-note', amount: '5' })).toBe('out');
    expect(paymentDirection({ id: '1', document_type: 'purchase_refund', amount: '5' })).toBe('in');
    expect(paymentDirection({ id: '1', amount: '-5' })).toBe('out');
  });
});

describe('aggregates', () => {
  it('builds monthly strata including empty months', () => {
    const strata = monthlyStrata(
      [
        { id: '1', direction: 'in', contact: 'A', amount: 10, date: '2026-01-05', documentId: null, documentType: null, description: '' },
        { id: '2', direction: 'in', contact: 'A', amount: 5, date: '2026-01-20', documentId: null, documentType: null, description: '' },
      ],
      period,
      'es-ES',
    );
    expect(strata).toHaveLength(10);
    expect(strata[0]).toMatchObject({ key: '2026-01', total: 15, count: 2 });
    expect(strata[1].total).toBe(0);
  });

  it('buckets debts by aging', () => {
    const snap = normalize({ ...base, outstandingInvoices: invoices.items as HoldedDocV2[], payments: [] }, { source: 'holded', companyName: 'X', period, today });
    const strata = agingStrata(snap.owedByClients, (k) => k);
    expect(strata.map((s) => s.count)).toEqual([1, 0, 1, 0, 0]);
  });

  it('ranks contacts and scales heights', () => {
    const top = topContacts([{ contact: 'a' }, { contact: 'b' }, { contact: 'a' }], () => 1);
    expect(top[0]).toEqual({ name: 'a', total: 2, count: 2 });
    expect(heightRatio(25, 100)).toBe(0.5);
    expect(heightRatio(0, 100)).toBe(0);
  });
});

describe('demo data', () => {
  it('is deterministic and normalizes cleanly', () => {
    const a = generateDemoRaw(today, period);
    const b = generateDemoRaw(today, period);
    expect(a).toEqual(b);
    const snap = normalize(a, { source: 'demo', companyName: 'Demo', period, today });
    expect(snap.collected.length).toBeGreaterThan(50);
    expect(snap.owedToSuppliers.length).toBeGreaterThan(5);
    expect(snap.owedToSuppliers.some((d) => d.daysOverdue > 0)).toBe(true);
    expect(snap.accounts).toHaveLength(3);
  });
});
