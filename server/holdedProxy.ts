/**
 * Read-only proxy to the Holded v2 API.
 *
 * Holded sends no CORS headers and asks that keys never be shipped in client code,
 * so the browser calls this handler instead: `/api/holded?path=/v2/invoices&limit=100`.
 * The same handler runs in the Vite dev server and as a Vercel function.
 *
 * It only forwards GET requests to an allowlist of read endpoints, only forwards the
 * Authorization header, and never logs or stores the key.
 */

export const HOLDED_BASE = 'https://api.holded.com/api';

const ALLOWED_PATHS: RegExp[] = [
  /^\/v2\/invoices$/,
  /^\/v2\/purchases$/,
  /^\/v2\/payments$/,
  /^\/v2\/treasury\/accounts$/,
  /^\/v2\/treasury\/accounts\/[A-Za-z0-9_-]{1,64}\/bank-movements$/,
  /^\/v2\/contacts$/,
  /^\/v2\/usage\/[a-z_]+$/,
];

const PASSTHROUGH_HEADERS = [
  'content-type',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-window',
];

const TIMEOUT_MS = 15_000;

export function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((re) => re.test(path));
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function handleHoldedRequest(
  request: Request,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  if (!isAllowedPath(path)) {
    return json(400, { error: 'path_not_allowed' });
  }

  const auth = request.headers.get('authorization');
  if (!auth || !/^Bearer \S+$/.test(auth)) {
    return json(401, { error: 'missing_key' });
  }

  const upstream = new URL(HOLDED_BASE + path);
  for (const [k, v] of url.searchParams) {
    if (k !== 'path') upstream.searchParams.append(k, v);
  }

  // The timeout covers both the response and reading its body; any failure becomes a 502/504.
  try {
    const res = await fetchImpl(upstream, {
      method: 'GET',
      headers: { authorization: auth, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const headers = new Headers({ 'cache-control': 'no-store' });
    for (const h of PASSTHROUGH_HEADERS) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(await res.arrayBuffer(), { status: res.status, headers });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return json(timedOut ? 504 : 502, { error: timedOut ? 'upstream_timeout' : 'upstream_unreachable' });
  }
}
