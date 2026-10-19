import { daysBetween } from '../data/parse';

export const ACHIEVEMENTS = [
  'first_steps',
  'climber',
  'brave',
  'vault_10k',
  'combo5',
  'dodge_30',
  'dodge_60',
  'near10',
  'balloon10',
  'no_overdue',
  'streak3',
  'streak7',
  'explorer',
  'river',
  'boss',
  'deductions',
] as const;

export type AchievementId = (typeof ACHIEVEMENTS)[number];
export type GameId = 'vault' | 'dodge' | 'balloon' | 'river' | 'boss';

export interface Progress {
  xp: number;
  streak: { count: number; lastDay: string | null };
  bests: Record<GameId, number>;
  plays: Record<GameId, number>;
  achievements: AchievementId[];
  exploredZones: string[];
  totalSecured: number;
  /** The first-visit tour has been shown (or skipped). */
  guideDone: boolean;
  /** Zones whose menu the player has opened; the others get a bouncing arrow. */
  enteredZones: string[];
}

export const emptyProgress = (): Progress => ({
  xp: 0,
  streak: { count: 0, lastDay: null },
  bests: { vault: 0, dodge: 0, balloon: 0, river: 0, boss: 0 },
  plays: { vault: 0, dodge: 0, balloon: 0, river: 0, boss: 0 },
  achievements: [],
  exploredZones: [],
  totalSecured: 0,
  guideDone: false,
  enteredZones: [],
});

/** Total XP needed to reach `level` (level 1 = 0 XP): 100, 300, 600, 1000… */
export function xpForLevel(level: number): number {
  const n = level - 1;
  return 50 * n * (n + 1);
}

export function levelInfo(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, span: xpForLevel(level + 1) - base };
}

/** Streak counts consecutive calendar days with at least one visit. */
export function touchStreak(streak: Progress['streak'], today: string): Progress['streak'] {
  if (!streak.lastDay) return { count: 1, lastDay: today };
  const gap = daysBetween(streak.lastDay, today);
  if (gap <= 0) return streak;
  if (gap === 1) return { count: streak.count + 1, lastDay: today };
  return { count: 1, lastDay: today };
}

export interface RunResult {
  game: GameId;
  /** Vault: points (€ × multiplier / 10) · Dodge: seconds survived · Balloon: € recovered. */
  score: number;
  /** 0..1 share of what was available (vault/balloon/boss deductions); unused for dodge. */
  ratio?: number;
  extra?: { maxMultiplier?: number; nearMisses?: number; caught?: number; secured?: number; won?: boolean; finished?: boolean };
}

export function xpForRun(r: RunResult): number {
  switch (r.game) {
    case 'vault':
      return Math.round(15 + 60 * Math.min(1, r.ratio ?? 0) + 5 * (r.extra?.maxMultiplier ?? 1));
    case 'dodge':
      return Math.round(10 + Math.min(90, r.score * 1.2) + 2 * (r.extra?.nearMisses ?? 0));
    case 'balloon':
      return Math.round(15 + 60 * Math.min(1, r.ratio ?? 0) + 2 * (r.extra?.caught ?? 0));
    case 'river':
      return Math.round(20 + Math.min(60, r.score / 100) + (r.extra?.finished ? 20 : 0));
    case 'boss':
      return Math.round(20 + (r.extra?.won ? 80 : 0) + 40 * Math.min(1, r.ratio ?? 0));
  }
}

export function achievementsForRun(r: RunResult): AchievementId[] {
  const out: AchievementId[] = [];
  if (r.game === 'vault') {
    if ((r.extra?.secured ?? r.score) >= 10_000) out.push('vault_10k');
    if ((r.extra?.maxMultiplier ?? 0) >= 5) out.push('combo5');
  }
  if (r.game === 'dodge') {
    if (r.score >= 30) out.push('dodge_30');
    if (r.score >= 60) out.push('dodge_60');
    if ((r.extra?.nearMisses ?? 0) >= 10) out.push('near10');
  }
  if (r.game === 'balloon' && (r.extra?.caught ?? 0) >= 10) out.push('balloon10');
  if (r.game === 'river' && r.extra?.finished) out.push('river');
  if (r.game === 'boss') {
    if (r.extra?.won) out.push('boss');
    if ((r.ratio ?? 0) >= 0.999) out.push('deductions');
  }
  return out;
}

export interface RunOutcome {
  xpGained: number;
  newBest: boolean;
  previousBest: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: AchievementId[];
  progress: Progress;
}

export function applyRun(p: Progress, r: RunResult): RunOutcome {
  const xpGained = xpForRun(r);
  const levelBefore = levelInfo(p.xp).level;
  const previousBest = p.bests[r.game];
  const newBest = r.score > previousBest;
  const progress: Progress = {
    ...p,
    xp: p.xp + xpGained,
    bests: { ...p.bests, [r.game]: Math.max(previousBest, r.score) },
    plays: { ...p.plays, [r.game]: p.plays[r.game] + 1 },
    totalSecured: p.totalSecured + (r.game === 'vault' ? (r.extra?.secured ?? r.score) : 0),
  };
  const { progress: withAch, unlocked } = unlock(progress, achievementsForRun(r));
  return { xpGained, newBest, previousBest, levelBefore, levelAfter: levelInfo(withAch.xp).level, unlocked, progress: withAch };
}

export function unlock(p: Progress, ids: AchievementId[]): { progress: Progress; unlocked: AchievementId[] } {
  const unlocked = ids.filter((id, i) => !p.achievements.includes(id) && ids.indexOf(id) === i);
  if (!unlocked.length) return { progress: p, unlocked };
  return { progress: { ...p, achievements: [...p.achievements, ...unlocked], xp: p.xp + 25 * unlocked.length }, unlocked };
}

// ---------- persistence ----------

const KEY = 'hq.progress';

export function loadProgress(): Progress {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const base = emptyProgress();
    return {
      ...base,
      ...parsed,
      bests: { ...base.bests, ...parsed.bests },
      plays: { ...base.plays, ...parsed.plays },
      streak: { ...base.streak, ...parsed.streak },
      enteredZones: parsed.enteredZones ?? [],
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
