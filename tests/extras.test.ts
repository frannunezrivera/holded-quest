import { describe, expect, it } from 'vitest';
import { cashSeriesFromMovements, cashSeriesFromPayments, rebuildBalances, seriesExtremes } from '../src/data/cash';
import { generateDemoMovements, generateDemoQuarterDocs } from '../src/data/demoData';
import { periodFor } from '../src/data/parse';
import { buildDemoSnapshot } from '../src/data/service';
import { buildVatQuarter, daysToDeadline, deadlineFor, relevantQuarter } from '../src/data/vat';
import { isAllowedPath } from '../server/holdedProxy';
import type { HoldedDocV2 } from '../src/data/types';

describe('cash river', () => {
  it('walks balances backwards from the closing balance', () => {
    const pts = rebuildBalances(
      [
        { date: '2026-01-02', amount: 100, label: 'in' },
        { date: '2026-01-03', amount: -30, label: 'out' },
        { date: '2026-01-03', amount: -20, label: 'out' },
      ],
      1000,
      '2026-01-01',
      '2026-01-04',
    );
    expect(pts.map((p) => p.balance)).toEqual([950, 1050, 1000, 1000]);
    expect(pts.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  });

  it('sums accounts, cuts to the period and keeps the biggest movements', () => {
    const period = periodFor('y2025', '2026-10-15');
    const accounts = [
      { id: 'a', name: 'A', type: 'bank', balance: 500, currency: 'EUR' },
      { id: 'b', name: 'B', type: 'bank', balance: 200, currency: 'EUR' },
    ];
    const series = cashSeriesFromMovements(
      accounts,
      {
        a: [
          { id: '1', value_date: '2025-06-01', amount: '1.000,00', description: 'Cliente' },
          { id: '2', value_date: '2026-02-01', amount: '-300', description: 'Después del periodo' },
        ],
        b: [],
      },
      period,
      '2026-10-15',
      'EUR',
    );
    expect(series.points[0].date).toBe('2025-01-01');
    expect(series.points.at(-1)!.date).toBe('2025-12-31');
    // Today 700; undo the −300 of 2026 → 1000 at the end of 2025; before June it was 0 + 200.
    expect(series.points.at(-1)!.balance).toBe(1000);
    expect(series.points[0].balance).toBe(0);
    expect(series.events.map((e) => e.label)).toEqual(['Cliente']);
    expect(seriesExtremes(series.points).max.balance).toBe(1000);
  });

  it('estimates from payments when bank movements are unavailable', () => {
    const snap = buildDemoSnapshot('thisYear', '2026-10-15');
    const est = cashSeriesFromPayments(snap);
    expect(est.source).toBe('estimated');
    expect(est.anchored).toBe(true);
    expect(est.points.at(-1)!.balance).toBeCloseTo(snap.accounts!.reduce((a, b) => a + b.balance, 0), 2);
    const unanchored = cashSeriesFromPayments({ ...snap, accounts: null });
    expect(unanchored.anchored).toBe(false);
    expect(unanchored.points[0].balance).toBe(0);
  });

  it('demo movements give a believable, mostly positive river', () => {
    const snap = buildDemoSnapshot('thisYear', '2026-10-15');
    const series = cashSeriesFromMovements(snap.accounts!, generateDemoMovements(snap.period.from, snap.today), snap.period, snap.today, 'EUR');
    const { min, max } = seriesExtremes(series.points);
    expect(series.points).toHaveLength(288);
    expect(max.balance).toBeGreaterThan(min.balance);
    expect(min.balance).toBeGreaterThan(0);
    expect(series.points.at(-1)!.balance).toBeGreaterThan(series.points[0].balance);
    expect(series.events.length).toBeGreaterThan(10);
  });
});

describe('VAT quarter', () => {
  it('uses the closed quarter while its filing window is open', () => {
    expect(relevantQuarter('2026-10-16')).toMatchObject({ year: 2026, quarter: 3, from: '2026-07-01', to: '2026-09-30', deadline: '2026-10-20', closed: true });
    expect(relevantQuarter('2026-10-21')).toMatchObject({ quarter: 4, from: '2026-10-01', to: '2026-12-31', deadline: '2027-01-30', closed: false });
    expect(relevantQuarter('2027-01-15')).toMatchObject({ year: 2026, quarter: 4, closed: true });
    expect(relevantQuarter('2026-02-10')).toMatchObject({ year: 2026, quarter: 1, closed: false, deadline: '2026-04-20' });
    expect(deadlineFor(2026, 2)).toBe('2026-07-20');
    expect(daysToDeadline(relevantQuarter('2026-10-16'), '2026-10-16')).toBe(4);
  });

  it('computes output minus input VAT, skipping drafts, cancelled and out-of-quarter docs', () => {
    const q = relevantQuarter('2026-10-16');
    const inv: HoldedDocV2[] = [
      { id: '1', date: '2026-07-10', subtotal: '1000.00', tax: '210.00', total: '1210.00', contact_name: 'A' },
      { id: '2', date: '2026-08-10', tax: '42,00', total: '242,00', contact_name: 'B' },
      { id: '3', date: '2026-08-11', tax: '500', status: 'cancelled' },
      { id: '4', date: '2026-08-12', tax: '500', approval_status: 'draft' },
      { id: '5', date: '2026-10-02', tax: '999' },
    ];
    const pur: HoldedDocV2[] = [{ id: 'p', date: '2026-09-01', tax: '52.50', subtotal: '250', contact_name: 'S' }];
    const vat = buildVatQuarter(inv, pur, q, 'EUR');
    expect(vat.output).toBe(252);
    expect(vat.input).toBe(52.5);
    expect(vat.net).toBe(199.5);
    expect(vat.sales.map((d) => d.id)).toEqual(['1', '2']);
    expect(vat.sales[1].base).toBe(200);
    expect(vat.inputUnknown).toBe(false);
    expect(buildVatQuarter(inv, null, q, 'EUR').inputUnknown).toBe(true);
  });

  it('demo quarter has sales and deductible purchases', () => {
    const q = relevantQuarter('2026-10-16');
    const { invoices, purchases } = generateDemoQuarterDocs(q.from, q.to, '2026-10-16');
    const vat = buildVatQuarter(invoices, purchases, q, 'EUR');
    expect(vat.sales.length).toBeGreaterThan(10);
    expect(vat.input).toBeGreaterThan(0);
    expect(vat.net).toBeGreaterThan(0);
  });
});

describe('proxy allowlist for statements', () => {
  it('allows bank movements of one account only', () => {
    expect(isAllowedPath('/v2/treasury/accounts/5ab391071d6d820034294783/bank-movements')).toBe(true);
    expect(isAllowedPath('/v2/treasury/accounts/../bank-movements')).toBe(false);
    expect(isAllowedPath('/v2/treasury/accounts/abc/bank-movements/1')).toBe(false);
  });
});
