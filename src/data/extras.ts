import { cashSeriesFromMovements, cashSeriesFromPayments } from './cash';
import { generateDemoMovements, generateDemoQuarterDocs } from './demoData';
import { HoldedClient, HoldedError } from './holdedClient';
import { loadApiKey, loadExtra, saveExtra, saveSettings } from './store';
import type { CashSeries, FinanceSnapshot, HoldedBankMovementV2, HoldedDocV2, VatQuarter } from './types';
import { buildVatQuarter, relevantQuarter } from './vat';

/**
 * Data that only the river and the VAT boss need. It is fetched when one of them is opened —
 * never on startup — and cached for a day, because Holded's monthly quotas are small.
 */

const FRESH_MS = 24 * 60 * 60 * 1000;

const isFresh = (fetchedAt: string) => Date.now() - Date.parse(fetchedAt) < FRESH_MS;

function clientFor(key: string) {
  return new HoldedClient({ apiKey: key });
}

function keepRateLimit(c: HoldedClient) {
  if (c.rateLimit.remaining !== null) saveSettings({ lastRateLimit: c.rateLimit });
}

export async function loadCashSeries(s: FinanceSnapshot, onProgress?: (account: string) => void): Promise<CashSeries> {
  const today = s.today;
  if (s.source === 'demo') {
    return cashSeriesFromMovements(s.accounts ?? [], generateDemoMovements(s.period.from, today), s.period, today, s.currency);
  }
  if (!s.accounts?.length) return cashSeriesFromPayments(s);
  const scope = `${s.period.from}:${today}:${s.accounts.map((a) => a.id).join(',')}`;
  const cached = await loadExtra<CashSeries>('cash');
  if (cached && cached.scope === scope && isFresh(cached.fetchedAt)) return cached.data;
  const key = loadApiKey();
  if (!key) return cached?.scope === scope ? cached.data : cashSeriesFromPayments(s);

  const client = clientFor(key);
  try {
    const movements: Record<string, HoldedBankMovementV2[]> = {};
    const partial: Record<string, boolean> = {};
    let readable = 0;
    for (const a of s.accounts) {
      onProgress?.(a.name);
      try {
        const { items, complete } = await client.getBankMovements(a.id, s.period.from, today);
        movements[a.id] = items;
        partial[a.id] = !complete;
        readable++;
      } catch (err) {
        // Gateways or cash boxes may not expose statements: keep that account flat at its balance.
        if (!(err instanceof HoldedError) || err.code === 'rate_limited' || err.code === 'unauthorized') throw err;
        movements[a.id] = [];
      }
    }
    if (!readable) return cashSeriesFromPayments(s);
    const series = cashSeriesFromMovements(s.accounts, movements, s.period, today, s.currency, partial);
    await saveExtra('cash', { scope, fetchedAt: new Date().toISOString(), data: series });
    return series;
  } catch (err) {
    // Out of quota or offline: the estimate from collections and payments still tells the story.
    if (err instanceof HoldedError) return cached?.scope === scope ? cached.data : cashSeriesFromPayments(s);
    throw err;
  } finally {
    keepRateLimit(client);
  }
}

export async function loadVatQuarter(s: FinanceSnapshot): Promise<VatQuarter> {
  const q = relevantQuarter(s.today);
  const until = q.to < s.today ? q.to : s.today;
  if (s.source === 'demo') {
    const { invoices, purchases } = generateDemoQuarterDocs(q.from, q.to, s.today);
    return buildVatQuarter(invoices, purchases, q, s.currency);
  }
  if (s.locked.includes('invoices')) throw new HoldedError(403, 'forbidden', 'Cannot read sales invoices');
  const scope = `${q.from}:${until}`;
  const cached = await loadExtra<VatQuarter>('vat');
  if (cached && cached.scope === scope && isFresh(cached.fetchedAt)) return cached.data;
  const key = loadApiKey();
  if (!key) {
    if (cached?.scope === scope) return cached.data;
    throw new HoldedError(401, 'unauthorized', 'No key in this session');
  }
  const client = clientFor(key);
  try {
    const invoices = await client.getDocsInRange('/v2/invoices', q.from, until);
    let purchases: HoldedDocV2[] | null = null;
    if (!s.locked.includes('purchases')) {
      try {
        purchases = await client.getDocsInRange('/v2/purchases', q.from, until);
      } catch (err) {
        if (!(err instanceof HoldedError) || err.code !== 'forbidden') throw err;
      }
    }
    const vat = buildVatQuarter(invoices, purchases, q, s.currency);
    await saveExtra('vat', { scope, fetchedAt: new Date().toISOString(), data: vat });
    return vat;
  } finally {
    keepRateLimit(client);
  }
}

export async function clearExtras() {
  await Promise.all([saveExtra('cash', null), saveExtra('vat', null)]);
}
