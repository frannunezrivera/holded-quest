import type {
  HoldedAccountV2,
  HoldedBankMovementV2,
  HoldedDocV2,
  HoldedPage,
  HoldedPaymentV2,
  Period,
  RawFinanceData,
} from './types';

export class HoldedError extends Error {
  constructor(
    readonly status: number,
    readonly code: 'unauthorized' | 'forbidden' | 'rate_limited' | 'bad_request' | 'network' | 'server',
    message: string,
  ) {
    super(message);
    this.name = 'HoldedError';
  }
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  window: string | null;
}

export interface HoldedClientOptions {
  apiKey: string;
  /** Proxy endpoint; the browser cannot call api.holded.com directly (no CORS). */
  endpoint?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  pageSize?: number;
  maxPages?: number;
  onProgress?: (label: string) => void;
  signal?: AbortSignal;
}

type Params = Record<string, string | number | undefined>;

const MAX_RETRY_WAIT_MS = 30_000;

export class HoldedClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pageSize: number;
  private readonly maxPages: number;
  calls = 0;
  rateLimit: RateLimitInfo = { limit: null, remaining: null, window: null };

  constructor(private readonly opts: HoldedClientOptions) {
    this.endpoint = opts.endpoint ?? '/api/holded';
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.pageSize = opts.pageSize ?? 100;
    this.maxPages = opts.maxPages ?? 40;
  }

  private buildUrl(path: string, params: Params): string {
    const q = new URLSearchParams({ path });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
    return `${this.endpoint}?${q}`;
  }

  /** One GET with retries on 429 (honouring Retry-After) and a single retry on 5xx. */
  async request<T>(path: string, params: Params = {}): Promise<T> {
    const url = this.buildUrl(path, params);
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        this.calls++;
        res = await this.fetchImpl(url, {
          headers: { authorization: `Bearer ${this.opts.apiKey.trim()}`, accept: 'application/json' },
          signal: this.opts.signal,
        });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err;
        throw new HoldedError(0, 'network', 'Network error');
      }
      this.captureRateLimit(res.headers);
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401) throw new HoldedError(401, 'unauthorized', 'Invalid API key');
      if (res.status === 403) throw new HoldedError(403, 'forbidden', `Missing scope for ${path}`);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1);
        const monthly = (res.headers.get('x-ratelimit-window') ?? '').startsWith('month');
        if (monthly || attempt >= 2 || waitMs > MAX_RETRY_WAIT_MS) {
          throw new HoldedError(429, 'rate_limited', monthly ? 'Monthly quota reached' : 'Rate limited');
        }
        await this.sleep(waitMs);
        continue;
      }
      if (res.status >= 500 && attempt < 1) {
        await this.sleep(1500);
        continue;
      }
      if (res.status >= 400 && res.status < 500) throw new HoldedError(res.status, 'bad_request', `Bad request ${path}`);
      throw new HoldedError(res.status, 'server', `Holded error ${res.status}`);
    }
  }

  private captureRateLimit(h: Headers) {
    const num = (k: string) => (h.get(k) != null && h.get(k) !== '' ? Number(h.get(k)) : null);
    if (h.has('x-ratelimit-remaining')) {
      this.rateLimit = { limit: num('x-ratelimit-limit'), remaining: num('x-ratelimit-remaining'), window: h.get('x-ratelimit-window') };
    }
  }

  /** Follows `cursor` until `has_more` is false. Tolerates endpoints that return a bare array. */
  async getAll<T>(path: string, params: Params = {}, maxPages = this.maxPages): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const body = await this.request<HoldedPage<T> | T[] | { data?: T[] }>(path, { ...params, limit: this.pageSize, cursor });
      if (Array.isArray(body)) {
        out.push(...body);
        break;
      }
      const items = 'items' in body && Array.isArray(body.items) ? body.items : 'data' in body && Array.isArray(body.data) ? body.data : [];
      out.push(...items);
      const next = 'cursor' in body ? body.cursor : null;
      const hasMore = 'has_more' in body ? body.has_more : false;
      if (!hasMore || !next || items.length === 0) break;
      cursor = next;
    }
    return out;
  }

  /** `status=outstanding` is documented for invoices; if an endpoint rejects it, ask for pending + partial. */
  async getOutstanding(path: string): Promise<HoldedDocV2[]> {
    try {
      return await this.getAll<HoldedDocV2>(path, { status: 'outstanding' });
    } catch (err) {
      if (!(err instanceof HoldedError) || err.code !== 'bad_request') throw err;
      const [pending, partial] = await Promise.all([
        this.getAll<HoldedDocV2>(path, { status: 'pending' }),
        this.getAll<HoldedDocV2>(path, { status: 'partial' }),
      ]);
      return [...pending, ...partial];
    }
  }

  /** Bank statement lines of one account; capped at a few pages to protect the monthly quota. */
  getBankMovements(accountId: string, from: string, to: string): Promise<HoldedBankMovementV2[]> {
    return this.getAll<HoldedBankMovementV2>(
      `/v2/treasury/accounts/${encodeURIComponent(accountId)}/bank-movements`,
      { start_date: from, end_date: to },
      5,
    );
  }

  /** Documents issued between two dates (inclusive). */
  getDocsInRange(path: '/v2/invoices' | '/v2/purchases', from: string, to: string): Promise<HoldedDocV2[]> {
    return this.getAll<HoldedDocV2>(path, { start_date: from, end_date: to });
  }

  /** Cheapest call that proves the key works: one invoice. */
  async testConnection(): Promise<void> {
    await this.request('/v2/invoices', { limit: 1 });
  }

  /** Downloads everything the game needs. A 403 on a resource locks that zone instead of failing. */
  async fetchAll(period: Period): Promise<RawFinanceData> {
    const step = this.opts.onProgress ?? (() => {});
    const lockable = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof HoldedError && err.code === 'forbidden') return null;
        throw err;
      }
    };

    step('invoices');
    const outstandingInvoices = await lockable(() => this.getOutstanding('/v2/invoices'));
    step('purchases');
    const outstandingPurchases = await lockable(() => this.getOutstanding('/v2/purchases'));
    step('payments');
    const payments = await lockable(() =>
      this.getAll<HoldedPaymentV2>('/v2/payments', { start_date: period.from, end_date: period.to }),
    );
    let periodInvoices: HoldedDocV2[] | null = null;
    if (payments === null && outstandingInvoices !== null) {
      periodInvoices = await lockable(() =>
        this.getAll<HoldedDocV2>('/v2/invoices', { start_date: period.from, end_date: period.to }),
      );
    }
    step('treasury');
    const accounts = await lockable(() => this.getAll<HoldedAccountV2>('/v2/treasury/accounts'));
    // Holded answers 403 (not 401) to an unknown key, so "everything forbidden" means the key itself is wrong.
    if (outstandingInvoices === null && outstandingPurchases === null && payments === null && accounts === null) {
      throw new HoldedError(403, 'unauthorized', 'Key rejected for every resource');
    }
    return { outstandingInvoices, outstandingPurchases, payments, periodInvoices, accounts };
  }
}
