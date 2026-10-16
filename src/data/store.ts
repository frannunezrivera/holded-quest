import { get, set, del } from 'idb-keyval';
import type { FinanceSnapshot, PeriodId } from './types';
import type { RateLimitInfo } from './holdedClient';

export type Lang = 'es' | 'en';

export interface Settings {
  lang: Lang;
  period: PeriodId;
  volume: number; // 0..1
  muted: boolean;
  musicOn: boolean;
  rememberKey: boolean;
  mode: 'demo' | 'holded' | null;
  lastRateLimit: RateLimitInfo | null;
}

const SETTINGS_KEY = 'hq.settings';
const KEY_KEY = 'hq.apiKey';
const SNAPSHOT_KEY = 'hq.snapshot';

const defaults = (): Settings => ({
  lang: navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en',
  period: 'thisYear',
  volume: 0.7,
  muted: false,
  musicOn: true,
  rememberKey: false,
  mode: null,
  lastRateLimit: null,
});

// Storage can throw (private mode, blocked site data) — the game must still run.
function safeGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function safeSet(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    /* ignore */
  }
}

let cached: Settings | null = null;

export function loadSettings(): Settings {
  if (cached) return cached;
  try {
    const raw = safeGet(globalThis.localStorage, SETTINGS_KEY);
    cached = { ...defaults(), ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
  } catch {
    cached = defaults();
  }
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cached = { ...loadSettings(), ...patch };
  safeSet(globalThis.localStorage, SETTINGS_KEY, JSON.stringify(cached));
  window.dispatchEvent(new CustomEvent('hq:settings', { detail: cached }));
  return cached;
}

/** The key lives in sessionStorage unless the player opts into "remember on this device". */
export function loadApiKey(): string | null {
  return safeGet(globalThis.sessionStorage, KEY_KEY) ?? safeGet(globalThis.localStorage, KEY_KEY);
}

export function saveApiKey(key: string, remember: boolean) {
  safeSet(globalThis.sessionStorage, KEY_KEY, key);
  safeSet(globalThis.localStorage, KEY_KEY, remember ? key : null);
}

export function forgetApiKey() {
  safeSet(globalThis.sessionStorage, KEY_KEY, null);
  safeSet(globalThis.localStorage, KEY_KEY, null);
}

export async function loadCachedSnapshot(): Promise<FinanceSnapshot | null> {
  try {
    return ((await get(SNAPSHOT_KEY)) as FinanceSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveCachedSnapshot(s: FinanceSnapshot | null) {
  try {
    if (s) await set(SNAPSHOT_KEY, s);
    else await del(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
