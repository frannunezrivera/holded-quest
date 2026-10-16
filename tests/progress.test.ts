import { describe, expect, it } from 'vitest';
import { applyRun, emptyProgress, levelInfo, touchStreak, unlock, xpForLevel } from '../src/game/progress';

describe('levels', () => {
  it('uses an increasing XP curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelInfo(150)).toEqual({ level: 2, into: 50, span: 200 });
  });
});

describe('streaks', () => {
  it('counts consecutive days and resets after a gap', () => {
    let s = touchStreak({ count: 0, lastDay: null }, '2026-10-13');
    expect(s).toEqual({ count: 1, lastDay: '2026-10-13' });
    s = touchStreak(s, '2026-10-13');
    expect(s.count).toBe(1);
    s = touchStreak(s, '2026-10-14');
    expect(s.count).toBe(2);
    s = touchStreak(s, '2026-10-17');
    expect(s).toEqual({ count: 1, lastDay: '2026-10-17' });
  });
});

describe('runs', () => {
  it('awards XP, bests and achievements once', () => {
    const r1 = applyRun(emptyProgress(), { game: 'dodge', score: 65, extra: { nearMisses: 12 } });
    expect(r1.newBest).toBe(true);
    expect(r1.unlocked).toEqual(['dodge_30', 'dodge_60', 'near10']);
    expect(r1.progress.bests.dodge).toBe(65);
    expect(r1.progress.xp).toBe(r1.xpGained + 75);
    const r2 = applyRun(r1.progress, { game: 'dodge', score: 40, extra: { nearMisses: 1 } });
    expect(r2.newBest).toBe(false);
    expect(r2.unlocked).toEqual([]);
    expect(r2.progress.plays.dodge).toBe(2);
  });

  it('tracks vault euros (not points) and multiplier achievements', () => {
    // VaultRush reports points as score and the real euros moved as extra.secured.
    const r = applyRun(emptyProgress(), { game: 'vault', score: 1500, ratio: 0.8, extra: { maxMultiplier: 5, secured: 12_000 } });
    expect(r.unlocked).toEqual(['vault_10k', 'combo5']);
    expect(r.progress.totalSecured).toBe(12_000);
    expect(r.progress.bests.vault).toBe(1500);
    const small = applyRun(emptyProgress(), { game: 'vault', score: 20_000, ratio: 0.5, extra: { maxMultiplier: 5, secured: 9_000 } });
    expect(small.unlocked).toEqual(['combo5']);
  });

  it('does not unlock duplicates', () => {
    const { progress } = unlock(emptyProgress(), ['climber', 'climber']);
    expect(progress.achievements).toEqual(['climber']);
    expect(unlock(progress, ['climber']).unlocked).toEqual([]);
  });

  it('rewards finishing the river and beating the VAT boss', () => {
    const river = applyRun(emptyProgress(), { game: 'river', score: 2500, extra: { finished: true } });
    expect(river.unlocked).toEqual(['river']);
    const boss = applyRun(emptyProgress(), { game: 'boss', score: 1800, ratio: 1, extra: { won: true } });
    expect(boss.unlocked).toEqual(['boss', 'deductions']);
    expect(boss.progress.bests.boss).toBe(1800);
  });
});
