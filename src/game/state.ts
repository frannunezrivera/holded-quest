import Phaser from 'phaser';
import type { SnapshotDiff } from '../data/diff';
import type { FinanceSnapshot } from '../data/types';
import { toIsoDate } from '../data/parse';
import { overdue } from '../data/aggregate';
import { loadProgress, saveProgress, touchStreak, unlock, type AchievementId, type Progress } from './progress';

/** Shared game state: the current finance snapshot and the player's progress. */
export const state = {
  snapshot: null as FinanceSnapshot | null,
  diff: null as SnapshotDiff | null,
  progress: loadProgress(),
  events: new Phaser.Events.EventEmitter(),
  /** The welcome banner shows once per session. */
  welcomed: false,
  /** Pending "since your last visit" diff, consumed once by the World scene. */
  takeDiff(): SnapshotDiff | null {
    const d = this.diff;
    this.diff = null;
    return d;
  },
};

export function setSnapshot(snapshot: FinanceSnapshot, diff: SnapshotDiff | null = null) {
  state.snapshot = snapshot;
  state.diff = diff;
  state.events.emit('snapshot', snapshot);
}

export function setProgress(p: Progress) {
  state.progress = p;
  saveProgress(p);
  state.events.emit('progress', p);
}

/** Unlocks achievements and announces them. Returns the newly unlocked ids. */
export function grant(ids: AchievementId[]): AchievementId[] {
  const { progress, unlocked } = unlock(state.progress, ids);
  if (unlocked.length) {
    setProgress(progress);
    for (const id of unlocked) state.events.emit('achievement', id);
  }
  return unlocked;
}

/** Daily visit: streak + data-driven achievements. */
export function touchVisit() {
  const today = toIsoDate(new Date());
  const streak = touchStreak(state.progress.streak, today);
  if (streak !== state.progress.streak) setProgress({ ...state.progress, streak });
  const ids: AchievementId[] = ['first_steps'];
  if (streak.count >= 3) ids.push('streak3');
  if (streak.count >= 7) ids.push('streak7');
  const s = state.snapshot;
  if (s && !s.locked.includes('purchases') && overdue(s.owedToSuppliers).length === 0) ids.push('no_overdue');
  grant(ids);
}

export function markExplored(zone: string) {
  if (state.progress.exploredZones.includes(zone)) return;
  const exploredZones = [...state.progress.exploredZones, zone];
  setProgress({ ...state.progress, exploredZones });
  if (['gold', 'harbor', 'debt'].every((z) => exploredZones.includes(z))) grant(['explorer']);
}
