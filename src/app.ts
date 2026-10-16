import Phaser from 'phaser';
import { HoldedError } from './data/holdedClient';
import { loadCashSeries, loadVatQuarter } from './data/extras';
import { buildDemoSnapshot, loadForStartup, refreshFromHolded } from './data/service';
import { loadApiKey, loadSettings, saveApiKey, saveSettings, type Lang } from './data/store';
import { openSettings } from './ui/settings';
import type { PeriodId } from './data/types';
import { setSnapshot, state } from './game/state';
import { t, type MessageKey } from './i18n/i18n';
import { hideLoading, showLoading, toast } from './ui/overlay';

/** App-level navigation and data flows shared by scenes and DOM overlays. */

let game: Phaser.Game | null = null;

export function initApp(g: Phaser.Game) {
  game = g;
}

export type MinigameKey = 'VaultRush' | 'DebtDodge' | 'BalloonCatch' | 'CashRiver' | 'BossVat';

const MINIGAMES: MinigameKey[] = ['VaultRush', 'DebtDodge', 'BalloonCatch', 'CashRiver', 'BossVat'];
const OVERLAYS = ['Results', 'Pause'];

/**
 * SceneManager.stop() is immediate, so navigating from inside a scene's update (a timer, a key
 * handler) would destroy that scene mid-step. Run navigation after the current step instead.
 */
function afterStep(fn: () => void) {
  if (!game) return;
  game.events.once(Phaser.Core.Events.POST_STEP, fn);
}

export function goToWorld() {
  afterStep(goToWorldNow);
}

function goToWorldNow() {
  if (!game) return;
  const sm = game.scene;
  for (const key of ['Boot', 'Title', ...MINIGAMES, ...OVERLAYS]) {
    if (sm.isActive(key) || sm.isPaused(key) || sm.isSleeping(key)) sm.stop(key);
  }
  sm.start('World');
  sm.start('Hud');
  sm.bringToTop('Hud');
}

export function goToTitle() {
  afterStep(() => {
    if (!game) return;
    const sm = game.scene;
    for (const key of ['Boot', 'World', 'Hud', ...MINIGAMES, ...OVERLAYS]) {
      if (sm.isActive(key) || sm.isPaused(key) || sm.isSleeping(key)) sm.stop(key);
    }
    sm.start('Title');
  });
}

export function startMinigame(key: MinigameKey) {
  afterStep(() => {
    if (!game) return;
    const sm = game.scene;
    for (const k of ['World', 'Hud', ...MINIGAMES, ...OVERLAYS]) {
      if (sm.isActive(k) || sm.isPaused(k) || sm.isSleeping(k)) sm.stop(k);
    }
    sm.start(key);
  });
}

/**
 * Loads what the river or the VAT boss needs before entering it. Returns false (after telling the
 * player why) if it couldn't.
 */
export async function prepareExtra(kind: 'river' | 'boss'): Promise<boolean> {
  const snap = state.snapshot;
  if (!snap) return false;
  if (kind === 'river' ? state.cash : state.vat) return true;
  showLoading(t(kind === 'river' ? 'loading.river' : 'loading.vat'));
  try {
    if (kind === 'river') state.cash = await loadCashSeries(snap, (account) => showLoading(`${t('loading.river')} ${account}`));
    else state.vat = await loadVatQuarter(snap);
    return true;
  } catch (err) {
    toast(errorMessage(err), 4500);
    return false;
  } finally {
    hideLoading();
  }
}

export function playDemo() {
  saveSettings({ mode: 'demo' });
  setSnapshot(buildDemoSnapshot(loadSettings().period));
  goToWorld();
}

export function errorMessage(err: unknown): string {
  if (err instanceof HoldedError) {
    const key = `settings.err.${err.code}` as MessageKey;
    if (['unauthorized', 'forbidden', 'rate_limited', 'network'].includes(err.code)) return t(key);
    return t('settings.err.generic', { status: err.status });
  }
  return t('settings.err.generic', { status: (err as Error)?.message ?? '?' });
}

const progressLabel = (step: string) => t(`loading.${step}` as MessageKey) || funnyLoading();

/** Generic waits get a joke instead of "Loading…". */
function funnyLoading() {
  return t(`loading.joke${1 + Math.floor(Math.random() * 5)}` as MessageKey);
}

/**
 * Downloads everything with the new key and only then saves it, so a typo never replaces a
 * working key. Throws on failure (the caller shows it).
 */
export async function connectHolded(key: string, remember: boolean) {
  const clean = key.trim();
  // A different key may be a different company: don't diff against the old cache.
  const sameKey = loadApiKey() === clean;
  showLoading(funnyLoading());
  try {
    const { snapshot, diff } = await refreshFromHolded(clean, loadSettings().period, (s) => showLoading(progressLabel(s)), sameKey);
    saveApiKey(clean, remember);
    saveSettings({ mode: 'holded', rememberKey: remember });
    setSnapshot(snapshot, diff);
    goToWorld();
  } finally {
    hideLoading();
  }
}

export async function refreshData(): Promise<boolean> {
  const s = loadSettings();
  if (s.mode === 'demo') {
    setSnapshot(buildDemoSnapshot(s.period));
    goToWorld();
    return true;
  }
  const key = loadApiKey();
  if (!key) {
    // The key lived only in this session; ask for it again instead of failing silently.
    toast(t('settings.err.needKey'), 4500);
    openSettings({ focusKey: true });
    return false;
  }
  showLoading(funnyLoading());
  try {
    const { snapshot, diff } = await refreshFromHolded(key, s.period, (step) => showLoading(progressLabel(step)));
    setSnapshot(snapshot, diff);
    toast(t('toast.refreshed'));
    goToWorld();
    return true;
  } catch (err) {
    toast(errorMessage(err), 4500);
    return false;
  } finally {
    hideLoading();
  }
}

export async function changePeriod(period: PeriodId) {
  const previous = loadSettings().period;
  if (previous === period) return;
  saveSettings({ period });
  // Keep the setting in sync with what is on screen if the download fails.
  if (state.snapshot && !(await refreshData())) saveSettings({ period: previous });
}

export function changeLanguage(lang: Lang) {
  if (loadSettings().lang === lang) return;
  saveSettings({ lang });
  document.documentElement.lang = lang;
  if (!game) return;
  // Rebuild visible scenes so every label is re-rendered in the new language.
  const sm = game.scene;
  if (sm.isActive('World') || sm.isPaused('World')) goToWorld();
  else if (sm.isActive('Title')) afterStep(() => sm.start('Title'));
}

/** Startup: open from cache/demo if possible, otherwise show the title screen. */
export async function boot(): Promise<boolean> {
  const s = loadSettings();
  if (!s.mode) return false;
  try {
    if (s.mode === 'holded') showLoading(funnyLoading());
    const res = await loadForStartup((step) => showLoading(progressLabel(step)));
    if (!res) return false;
    setSnapshot(res.snapshot, res.diff);
    return true;
  } catch (err) {
    toast(errorMessage(err), 5000);
    return false;
  } finally {
    hideLoading();
  }
}
