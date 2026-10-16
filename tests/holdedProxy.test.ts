import { describe, expect, it, vi } from 'vitest';
import { handleHoldedRequest, isAllowedPath } from '../server/holdedProxy';

const req = (query: string, init: RequestInit = {}) =>
  new Request(`http://localhost/api/holded?${query}`, { headers: { authorization: 'Bearer k1' }, ...init });

describe('holdedProxy', () => {
  it('allowlists read endpoints only', () => {
    expect(isAllowedPath('/v2/invoices')).toBe(true);
    expect(isAllowedPath('/v2/treasury/accounts')).toBe(true);
    expect(isAllowedPath('/v2/usage/automation_token')).toBe(true);
    expect(isAllowedPath('/v2/invoices/123/send')).toBe(false);
    expect(isAllowedPath('/v2/../v1/documents')).toBe(false);
    expect(isAllowedPath('https://evil.example')).toBe(false);
  });

  it('rejects non-GET, unknown paths and missing keys without calling upstream', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect((await handleHoldedRequest(req('path=/v2/invoices', { method: 'POST' }), fetchImpl)).status).toBe(405);
    expect((await handleHoldedRequest(req('path=/v2/invoices/1/pay'), fetchImpl)).status).toBe(400);
    expect((await handleHoldedRequest(new Request('http://localhost/api/holded?path=/v2/invoices'), fetchImpl)).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('forwards only Authorization and the query, and passes back rate-limit headers', async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.holded.com/api/v2/invoices?status=outstanding&limit=100');
      expect(init?.headers).toEqual({ authorization: 'Bearer k1', accept: 'application/json' });
      return new Response('{"items":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '42', 'set-cookie': 'x=1' },
      });
    }) as unknown as typeof fetch;
    const res = await handleHoldedRequest(
      req('path=/v2/invoices&status=outstanding&limit=100', { headers: { authorization: 'Bearer k1', cookie: 'secret=1' } }),
      fetchImpl,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-remaining')).toBe('42');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.text()).toBe('{"items":[]}');
  });

  it('reports upstream failures as 502', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect((await handleHoldedRequest(req('path=/v2/payments'), fetchImpl)).status).toBe(502);
  });
});
