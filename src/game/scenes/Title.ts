import Phaser from 'phaser';
import { changeLanguage, playDemo } from '../../app';
import { music, setSoundEnabled } from '../../audio/music';
import { audioContext, sfx, unlockAudio } from '../../audio/sfx';
import { loadSettings } from '../../data/store';
import { t } from '../../i18n/i18n';
import { openSettings } from '../../ui/settings';
import { drawBackdrop, birds } from '../backdrop';
import { burst } from '../fx';
import { Button, ButtonGroup, H, W, musicButton, text } from '../ui';

export class Title extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    drawBackdrop(this, { groundY: 930 });
    birds(this, W);

    // Gentle money rain behind the logo
    this.add.particles(0, -60, 'coin-sm', {
      x: { min: 0, max: W },
      lifespan: 6000,
      speedY: { min: 90, max: 200 },
      speedX: { min: -30, max: 30 },
      rotate: { min: 0, max: 360 },
      scale: { min: 0.6, max: 1.1 },
      alpha: { start: 0.85, end: 0.85 },
      frequency: 260,
    }).setDepth(-60);

    this.buildLogo();

    // Mascot
    const pig = this.add.image(W / 2, 880, 'pig').setScale(1.6).setDepth(5);
    this.tweens.add({ targets: pig, y: 850, scaleY: 1.68, scaleX: 1.52, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.time.addEvent({
      delay: 2800,
      loop: true,
      callback: () => {
        pig.setTexture('pig-blink');
        this.time.delayedCall(140, () => pig.setTexture('pig'));
      },
    });
    pig.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      unlockAudio();
      sfx('coin', { pitch: 0.9 + Math.random() * 0.3 });
      pig.setTexture('pig-happy');
      burst(this, pig.x, pig.y - 60, 'coin-sm', { count: 10, speed: [250, 500], angle: [220, 320], gravityY: 1200, rotate: true, scale: [1, 0.6], lifespan: 1200 });
      this.time.delayedCall(500, () => pig.setTexture('pig'));
    });

    const connect = new Button(this, W / 2, 560, '🔑  ' + t('title.connect'), () => openSettings({ focusKey: true }), { w: 520, color: 0xf5b700, textColor: '#3A2400' });
    connect.label.setStroke('#FFF3B0', 0);
    const demo = new Button(this, W / 2, 670, '🎮  ' + t('title.demo'), () => {
      unlockAudio();
      playDemo();
    }, { w: 520, color: 0x7c4dff });
    const group = new ButtonGroup(this, [connect, demo]);
    group.focus(loadSettings().mode === 'holded' ? 0 : 1);

    // Language toggle
    const lang = loadSettings().lang;
    const es = new Button(this, W - 230, 70, 'ES', () => changeLanguage('es'), { w: 110, h: 64, size: 26, color: lang === 'es' ? 0xf5b700 : 0x3b2f6b });
    const en = new Button(this, W - 105, 70, 'EN', () => changeLanguage('en'), { w: 110, h: 64, size: 26, color: lang === 'en' ? 0xf5b700 : 0x3b2f6b });
    void es;
    void en;
    new Button(this, 90, 70, '⚙', () => openSettings(), { w: 96, h: 64, size: 30, color: 0x3b2f6b });
    musicButton(this, 200, 70, (on) => {
      setSoundEnabled(on);
      if (on) music.play('title');
    });

    text(this, W / 2, H - 34, t('title.hint'), 24, '#FFFFFF', { strokeThickness: 4 }).setAlpha(0.85);

    const startMusic = () => {
      unlockAudio();
      music.play('title');
    };
    this.input.once('pointerdown', startMusic);
    this.input.keyboard?.once('keydown', startMusic);
    if (audioContext().state === 'running') music.play('title');
  }

  private buildLogo() {
    const word = 'Holded Quest';
    const size = 150;
    const tmp = text(this, 0, 0, word, size);
    const total = tmp.width - 8;
    tmp.destroy();
    let x = W / 2 - total / 2;
    [...word].forEach((ch, i) => {
      const l = text(this, 0, 0, ch, size, '#FFD54A', { strokeThickness: 16, weight: 700 }).setOrigin(0, 0.5);
      const grad = l.context.createLinearGradient(0, 20, 0, l.height - 20);
      grad.addColorStop(0, '#FFF6C2');
      grad.addColorStop(0.45, '#FFD54A');
      grad.addColorStop(1, '#F59E0B');
      l.setFill(grad);
      l.setPosition(x, -200);
      x += l.width - 14;
      // Each letter drops in, then starts its wave once it has landed (never before); the delay
      // puts all letters on one shared clock, 70 ms apart, after the last one lands.
      this.tweens.add({
        targets: l,
        y: 250,
        duration: 700,
        delay: 80 * i,
        ease: 'Bounce.out',
        onComplete: () => this.tweens.add({ targets: l, y: 236, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: 80 * (word.length - 1) + 20 - 10 * i }),
      });
    });
    const tag = text(this, W / 2, 380, t('title.tagline'), 40, '#FFFFFF', { strokeThickness: 7 }).setAlpha(0);
    this.tweens.add({ targets: tag, alpha: 1, y: 370, delay: 1200, duration: 600 });
  }
}
