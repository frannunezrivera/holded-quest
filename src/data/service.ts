import { DEMO_COMPANY, generateDemoRaw } from './demoData';
import { diffSnapshots, isEmptyDiff, type SnapshotDiff } from './diff';
import { HoldedClient, HoldedError } from './holdedClient';
import { normalize } from './normalize';
import { periodFor, toIsoDate } from './parse';
import { loadApiKey, loadCachedSnapshot, loadSettings, saveCachedSnapshot, saveSettings } from './store';
import type { FinanceSnapshot, PeriodId } from './types';

export const STALE_MS = 12 * 60 * 60 * 1000;

export interface LoadResult {
  snapshot: FinanceSnapshot;
  diff: SnapshotDiff | null;
}

export function buildDemoSnapshot(periodId: PeriodId, today = toIsoDate(new Date())): FinanceSnapshot {
  const period = periodFor(periodId, today);
  return normalize(generateDemoRaw(today, period), { source: 'demo', companyName: DEMO_COMPANY, period, today });
}

export async function testKey(apiKey: string): Promise<void> {
  const client = new HoldedClient({ apiKey });
  await client.testConnection();
  if (client.rateLimit.remaining !== null) saveSettings({ lastRateLimit: client.rateLimit });
}

/** Downloads fresh data, caches it and returns what changed since the cached snapshot. */
export async function refreshFromHolded(
  apiKey: string,
  periodId: PeriodId,
  onProgress?: (step: string) => void,
  compareWithCache = true,
): Promise<LoadResult> {
  const today = toIsoDate(new Date());
  const period = periodFor(periodId, today);
  const client = new HoldedClient({ apiKey, onProgress });
  try {
    const raw = await client.fetchAll(period);
    const snapshot = normalize(raw, { source: 'holded', companyName: 'Holded', period, today });
    const prev = await loadCachedSnapshot();
    const diff = compareWithCache && prev && prev.source === 'holded' ? diffSnapshots(prev, snapshot) : null;
    await saveCachedSnapshot(snapshot);
    return { snapshot, diff: diff && !isEmptyDiff(diff) ? diff : null };
  } finally {
    if (client.rateLimit.remaining !== null) saveSettings({ lastRateLimit: client.rateLimit });
  }
}

/**
 * Startup: demo mode builds data locally; Holded mode opens from cache and only calls the API
 * when the cache is missing, stale (12 h) or for a different period — monthly quotas are small.
 */
export async function loadForStartup(onProgress?: (step: string) => void): Promise<LoadResult | null> {
  const settings = loadSettings();
  if (settings.mode === 'demo') return { snapshot: buildDemoSnapshot(settings.period), diff: null };
  if (settings.mode !== 'holded') return null;
  const key = loadApiKey();
  const cached = await loadCachedSnapshot();
  const today = toIsoDate(new Date());
  const fresh =
    cached &&
    cached.source === 'holded' &&
    cached.period.id === settings.period &&
    cached.today === today &&
    Date.now() - Date.parse(cached.fetchedAt) < STALE_MS;
  if (fresh || (cached?.source === 'holded' && !key)) return { snapshot: cached!, diff: null };
  if (!key) return null;
  try {
    return await refreshFromHolded(key, settings.period, onProgress);
  } catch (err) {
    // Offline or out of quota: fall back to whatever we had.
    if (cached?.source === 'holded' && err instanceof HoldedError && err.code !== 'unauthorized') {
      return { snapshot: cached, diff: null };
    }
    throw err;
  }
}
