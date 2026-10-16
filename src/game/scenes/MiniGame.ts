import Phaser from 'phaser';
import { music, type SongId } from '../../audio/music';
import { sfx, unlockAudio } from '../../audio/sfx';
import { t } from '../../i18n/i18n';
import { isModalOpen } from '../../ui/overlay';
import type { ResultsData } from './Results';
import { H, W, text } from '../ui';

/**
 * Shared minigame chrome: 3-2-1 countdown, round timer, score readout, pause and the
 * hand-off to the Results scene.
 */
export abstract class MiniGame extends Phaser.Scene {
  protected running = false;
  protected over = false;
  protected timeLeft = 60;
  protected scoreText!: Phaser.GameObjects.Text;
  protected timeText!: Phaser.GameObjects.Text;
  protected helpText!: Phaser.GameObjects.Text;
  private lastTick = 0;

  protected abstract readonly song: SongId;
  protected abstract readonly roundSeconds: number | null; // null = no timer (survival)
  protected abstract helpKey: Parameters<typeof t>[0];

  protected abstract build(): void;
  protected abstract tick(dt: number, time: number): void;
  protected abstract scoreLabel(): string;

  create() {
    this.running = false;
    this.over = false;
    this.timeLeft = this.roundSeconds ?? 0;
    this.lastTick = 0;
    unlockAudio();
    this.cameras.main.fadeIn(400, 18, 12, 38);
    this.build();
    this.buildChrome();
    music.play(this.song);
    this.countdown();
    this.input.keyboard?.on('keydown-ESC', () => this.pause());
    this.input.keyboard?.on('keydown-P', () => this.pause());
    const onResume = () => (this.lastTick = 0);
    this.events.on('resume', onResume);
    this.events.once('shutdown', () => {
      this.events.off('resume', onResume);
      this.tweens.killAll();
      this.time.removeAllEvents();
      music.setIntensity(0);
    });
  }

  private buildChrome() {
    const bar = this.add.graphics().setDepth(900).setScrollFactor(0);
    bar.fillStyle(0x0d0820, 0.35);
    bar.fillRoundedRect(W / 2 - 330, 22, 660, 92, 30);
    bar.fillStyle(0x241a45, 0.9);
    bar.fillRoundedRect(W / 2 - 330, 16, 660, 92, 30);
    this.scoreText = text(this, W / 2 - 300, 62, this.scoreLabel(), 40, '#FFE45C', { origin: [0, 0.5], strokeThickness: 7, weight: 700 }).setDepth(901).setScrollFactor(0);
    this.timeText = text(this, W / 2 + 300, 62, '', 40, '#FFFFFF', { origin: [1, 0.5], strokeThickness: 7, weight: 700 }).setDepth(901).setScrollFactor(0);
    this.helpText = text(this, W / 2, H - 44, t(this.helpKey), 26, '#FFFFFF', { strokeThickness: 5 }).setDepth(901).setScrollFactor(0);
    const pauseBtn = text(this, W - 70, 62, '⏸', 44, '#FFFFFF', { stroke: null }).setDepth(901).setScrollFactor(0).setInteractive({ useHandCursor: true });
    pauseBtn.on('pointerdown', () => this.pause());
    this.updateTime();
  }

  private countdown() {
    const steps = ['3', '2', '1', t('game.go')];
    steps.forEach((s, i) => {
      this.time.delayedCall(450 + i * 650, () => {
        const big = text(this, W / 2, H / 2, s, i === 3 ? 180 : 220, i === 3 ? '#7CF5A8' : '#FFFFFF', { strokeThickness: 18, weight: 700 })
          .setDepth(950)
          .setScale(0.2)
          .setScrollFactor(0);
        sfx(i === 3 ? 'go' : 'countdown');
        this.tweens.add({ targets: big, scale: 1, duration: 300, ease: 'Back.out' });
        this.tweens.add({ targets: big, alpha: 0, scale: 1.6, delay: 380, duration: 260, onComplete: () => big.destroy() });
        if (i === 3) {
          this.running = true;
          this.tweens.add({ targets: this.helpText, alpha: 0, delay: 4000, duration: 1000 });
        }
      });
    });
  }

  protected pause() {
    if (this.over || isModalOpen()) return;
    this.scene.launch('Pause', { from: this.scene.key });
    this.scene.pause();
  }

  protected updateTime() {
    if (this.roundSeconds === null) {
      this.timeText.setText(`⏱ ${this.timeLeft.toFixed(1)} s`);
      return;
    }
    const s = Math.max(0, Math.ceil(this.timeLeft));
    this.timeText.setText(`⏱ ${s}`);
    this.timeText.setColor(s <= 10 ? '#FF6B7D' : '#FFFFFF');
  }

  protected setScore() {
    this.scoreText.setText(this.scoreLabel());
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.18, to: 1 }, duration: 160 });
  }

  update(time: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    if (this.running && !this.over) {
      if (this.roundSeconds === null) this.timeLeft += dt;
      else {
        this.timeLeft -= dt;
        const s = Math.ceil(this.timeLeft);
        if (s <= 5 && s !== this.lastTick && s > 0) {
          this.lastTick = s;
          sfx('countdown', { pitch: 1.2 });
          this.tweens.add({ targets: this.timeText, scale: { from: 1.4, to: 1 }, duration: 250 });
        }
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this.updateTime();
          this.finish(t('game.timeup'));
          return;
        }
        music.setIntensity(this.timeLeft < 15 ? 1 : 0);
      }
      this.updateTime();
    }
    this.tick(dt, time);
  }

  protected abstract results(headline: string): ResultsData;

  protected finish(headline: string) {
    if (this.over) return;
    this.over = true;
    this.running = false;
    sfx('fanfare');
    const big = text(this, W / 2, H / 2, headline, 140, '#FFE45C', { strokeThickness: 16, weight: 700 }).setDepth(950).setScale(0.3).setScrollFactor(0);
    this.tweens.add({ targets: big, scale: 1, duration: 400, ease: 'Back.out' });
    this.time.delayedCall(1400, () => {
      big.destroy();
      this.scene.launch('Results', this.results(headline));
      this.scene.pause();
    });
  }
}
