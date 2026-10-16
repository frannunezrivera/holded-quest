import { describe, expect, it, vi } from 'vitest';
import { HoldedClient, HoldedError } from '../src/data/holdedClient';
import { periodFor } from '../src/data/parse';

type Handler = (url: URL) => Response | Promise<Response>;

function client(handler: Handler, extra: Partial<ConstructorParameters<typeof HoldedClient>[0]> = {}) {
  const calls: URL[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    calls.push(url);
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    return handler(url);
  }) as unknown as typeof fetch;
  const sleep = vi.fn(async () => {});
  return { c: new HoldedClient({ apiKey: ' test-key ', fetchImpl, sleep, ...extra }), calls, sleep };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('HoldedClient', () => {
  it('follows cursors until has_more is false', async () => {
    const { c, calls } = client((url) => {
      const cursor = url.searchParams.get('cursor');
      if (!cursor) return json({ items: [{ id: 1 }, { id: 2 }], cursor: 'c2', has_more: true });
      if (cursor === 'c2') return json({ items: [{ id: 3 }], cursor: null, has_more: false });
      throw new Error('unexpected');
    });
    const all = await c.getAll<{ id: number }>('/v2/invoices', { status: 'outstanding' });
    expect(all.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0].pathname).toBe('/api/holded');
    expect(calls[0].searchParams.get('path')).toBe('/v2/invoices');
    expect(calls[0].searchParams.get('limit')).toBe('100');
    expect(calls[0].searchParams.get('status')).toBe('outstanding');
  });

  it('accepts bare arrays', async () => {
    const { c } = client(() => json([{ id: 'a' }]));
    expect(await c.getAll('/v2/treasury/accounts')).toEqual([{ id: 'a' }]);
  });

  it('falls back to pending + partial when status=outstanding is rejected', async () => {
    const { c } = client((url) => {
      const status = url.searchParams.get('status');
      if (status === 'outstanding') return json({ error: 'bad' }, 400);
      return json({ items: [{ id: status }], cursor: null, has_more: false });
    });
    const docs = await c.getOutstanding('/v2/purchases');
    expect(docs.map((d) => d.id)).toEqual(['pending', 'partial']);
  });

  it('retries 429 honouring Retry-After and records rate limits', async () => {
    let n = 0;
    const { c, sleep } = client(() =>
      ++n === 1
        ? json({}, 429, { 'retry-after': '3', 'x-ratelimit-window': 'minute' })
        : json({ items: [], cursor: null, has_more: false }, 200, { 'x-ratelimit-remaining': '480', 'x-ratelimit-limit': '500', 'x-ratelimit-window': 'month' }),
    );
    await c.getAll('/v2/payments');
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(c.rateLimit).toEqual({ limit: 500, remaining: 480, window: 'month' });
  });

  it('does not retry when the monthly quota is exhausted', async () => {
    const { c, sleep } = client(() => json({}, 429, { 'retry-after': '3600', 'x-ratelimit-window': 'month' }));
    await expect(c.getAll('/v2/payments')).rejects.toMatchObject({ code: 'rate_limited' });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('maps 401 to unauthorized', async () => {
    const { c } = client(() => json({}, 401));
    await expect(c.testConnection()).rejects.toBeInstanceOf(HoldedError);
    await expect(c.testConnection()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('locks resources that answer 403 and estimates collections from invoices', async () => {
    const { c, calls } = client((url) => {
      const path = url.searchParams.get('path');
      if (path === '/v2/payments' || path === '/v2/treasury/accounts') return json({}, 403);
      return json({ items: [{ id: path + (url.searchParams.get('status') ?? 'period') }], cursor: null, has_more: false });
    });
    const raw = await c.fetchAll(periodFor('thisYear', '2026-10-15'));
    expect(raw.payments).toBeNull();
    expect(raw.accounts).toBeNull();
    expect(raw.outstandingInvoices).toEqual([{ id: '/v2/invoicesoutstanding' }]);
    expect(raw.periodInvoices).toEqual([{ id: '/v2/invoicesperiod' }]);
    const periodCall = calls.find((u) => u.searchParams.get('start_date'));
    expect(periodCall?.searchParams.get('end_date')).toBe('2026-10-15');
  });

  it('treats a key that is forbidden everywhere as invalid', async () => {
    const { c } = client(() => json({ title: 'Forbidden', status: 403, detail: 'Access denied.' }, 403));
    await expect(c.fetchAll(periodFor('thisYear', '2026-10-15'))).rejects.toMatchObject({ code: 'unauthorized' });
  });
});
