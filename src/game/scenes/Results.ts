import Phaser from 'phaser';
import { goToWorld, startMinigame } from '../../app';
import { sfx } from '../../audio/sfx';
import { t, type MessageKey } from '../../i18n/i18n';
import { countUp, confetti, sparkle } from '../fx';
import { applyRun, levelInfo, type RunResult } from '../progress';
import { setProgress, state } from '../state';
import { Button, ButtonGroup, H, W, panel, text } from '../ui';

export interface ResultsData {
  run: RunResult;
  scene: 'VaultRush' | 'DebtDodge' | 'BalloonCatch';
  headline: string; // e.g. "¡Tiempo!"
  scoreLabel: string;
  formatScore: (n: number) => string;
  summary: string;
  listTitle?: string;
  list?: [string, string][];
}

/** Shared end-of-round screen: score, record, XP, level-ups, unlocked achievements, and an actionable list. */
export class Results extends Phaser.Scene {
  constructor() {
    super('Results');
  }

  create(data: ResultsData) {
    const outcome = applyRun(state.progress, data.run);
    setProgress(outcome.progress);
    for (const id of outcome.unlocked) state.events.emit('achievement', id);

    this.add.rectangle(W / 2, H / 2, W, H, 0x0d0820, 0.65).setInteractive();
    const pw = 1180;
    const ph = 860;
    const cy = H / 2;
    const container = this.add.container(0, 0);
    container.add(panel(this, W / 2, cy, pw, ph));
    container.add(text(this, W / 2, cy - ph / 2 + 64, data.headline, 60, '#FFE45C', { strokeThickness: 10, weight: 700 }));
    container.add(text(this, W / 2, cy - ph / 2 + 130, data.scoreLabel, 28, '#CFC7EF', { stroke: null }));
    const score = text(this, W / 2, cy - ph / 2 + 200, data.formatScore(0), 84, '#FFFFFF', { strokeThickness: 12, weight: 700 });
    container.add(score);
    countUp(this, score, data.run.score, data.formatScore, 1100, 300);
    this.time.delayedCall(300, () => sfx('coinBig'));

    container.add(text(this, W / 2, cy - ph / 2 + 270, data.summary, 28, '#FFFFFF', { stroke: null, wrap: pw - 120 }));

    let y = cy - ph / 2 + 330;
    if (outcome.newBest && data.run.score > 0) {
      const nb = text(this, W / 2 + 330, cy - ph / 2 + 200, t('results.newBest'), 30, '#FF6B9A', { strokeThickness: 6, weight: 700 }).setAngle(-8);
      container.add(nb);
      this.tweens.add({ targets: nb, scale: 1.15, duration: 400, yoyo: true, repeat: -1 });
      this.time.delayedCall(1400, () => {
        confetti(this, W / 2, cy - ph / 2 + 200, 80, 2000);
        sfx('fanfare');
      });
    } else {
      container.add(text(this, W / 2 + 330, cy - ph / 2 + 200, t('results.best', { v: data.formatScore(outcome.previousBest) }), 24, '#9A90C4', { stroke: null }));
    }

    // XP bar
    const barY = y;
    const lvAfter = levelInfo(outcome.progress.xp);
    const xpText = text(this, W / 2 - 300, y + 20, t('results.xp', { n: outcome.xpGained }), 32, '#FFE45C', { strokeThickness: 6, origin: [0, 0.5], weight: 700 });
    container.add(xpText);
    const bar = this.add.graphics();
    container.add(bar);
    const from = outcome.levelAfter > outcome.levelBefore ? 0 : (lvAfter.into - outcome.xpGained) / lvAfter.span;
    const o = { v: Math.max(0, from) };
    const drawBar = () => {
      bar.clear();
      bar.fillStyle(0x000000, 0.35);
      bar.fillRoundedRect(W / 2 - 60, barY + 8, 360, 24, 12);
      bar.fillStyle(0xffd54a, 1);
      bar.fillRoundedRect(W / 2 - 60, barY + 8, Math.max(24, 360 * o.v), 24, 12);
    };
    drawBar();
    this.tweens.add({ targets: o, v: lvAfter.into / lvAfter.span, duration: 900, delay: 1200, ease: 'Cubic.out', onUpdate: drawBar });
    container.add(text(this, W / 2 + 320, y + 20, t('hud.level', { n: lvAfter.level }), 28, '#FFFFFF', { origin: [0, 0.5], strokeThickness: 5 }));
    if (outcome.levelAfter > outcome.levelBefore) {
      this.time.delayedCall(1800, () => {
        sfx('levelUp');
        sparkle(this, W / 2 + 120, barY + 20, 30, [0xffe45c, 0xffffff], 2000);
        const lu = text(this, W / 2, barY - 26, t('results.levelup', { n: outcome.levelAfter }), 34, '#7CF5A8', { strokeThickness: 6, weight: 700 }).setScale(0);
        container.add(lu);
        this.tweens.add({ targets: lu, scale: 1, duration: 400, ease: 'Back.out' });
      });
    }
    y += 70;

    for (const id of outcome.unlocked) {
      container.add(text(this, W / 2, y, `🏆 ${t('results.unlocked')} ${t(`ach.${id}` as MessageKey)}`, 26, '#FFE45C', { strokeThickness: 5 }));
      y += 40;
    }

    if (data.list?.length) {
      y += 10;
      container.add(text(this, W / 2, y, data.listTitle ?? '', 26, '#FFB3C0', { stroke: null, weight: 600 }));
      y += 44;
      for (const [left, right] of data.list.slice(0, 5)) {
        const row = this.add.graphics();
        row.fillStyle(0xffffff, 0.06);
        row.fillRoundedRect(W / 2 - 440, y - 20, 880, 40, 14);
        container.add(row);
        container.add(text(this, W / 2 - 420, y, left, 22, '#FFFFFF', { stroke: null, origin: [0, 0.5], shadow: false }));
        container.add(text(this, W / 2 + 420, y, right, 22, '#FFE45C', { stroke: null, origin: [1, 0.5], shadow: false, weight: 700 }));
        y += 46;
      }
    }

    const again = new Button(this, W / 2 - 230, cy + ph / 2 - 80, '↻ ' + t('results.again'), () => startMinigame(data.scene), { w: 400, h: 90, color: 0xf5b700, textColor: '#3A2400' });
    again.label.setStroke('#FFF3B0', 0);
    const back = new Button(this, W / 2 + 230, cy + ph / 2 - 80, '🗺️ ' + t('results.back'), () => goToWorld(), { w: 400, h: 90, color: 0x7c4dff });
    new ButtonGroup(this, [again, back], true).focus(0);
    this.input.keyboard?.on('keydown-ESC', () => goToWorld());
    this.input.keyboard?.on('keydown-R', () => startMinigame(data.scene));

    container.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 350, ease: 'Back.out' });
  }
}
