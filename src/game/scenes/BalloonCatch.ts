import Phaser from 'phaser';
import { sfx } from '../../audio/sfx';
import type { Doc } from '../../data/types';
import { money, moneyShort, t } from '../../i18n/i18n';
import { birds, drawBackdrop } from '../backdrop';
import { burst, confetti, popText, shockwave, sparkle } from '../fx';
import { state } from '../state';
import { H, W, text } from '../ui';
import { MiniGame } from './MiniGame';
import type { ResultsData } from './Results';

const SEA_Y = 880;
const ORIGIN = { x: W / 2, y: SEA_Y - 120 };
const HOOK_SPEED = 2600;
const HOOK_MAX = 1150;

interface Balloon {
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  doc: Doc | null;
  value: number;
  vy: number;
  phase: number;
  r: number;
  hooked: boolean;
  dead: boolean;
  golden: boolean;
}

/** Clients who owe you float away on balloons. Hook them and reel the money in. */
export class BalloonCatch extends MiniGame {
  protected readonly song = 'balloon' as const;
  protected readonly roundSeconds = 60;
  protected helpKey = 'balloon.help' as const;

  private pig!: Phaser.GameObjects.Image;
  private register!: Phaser.GameObjects.Image;
  private crosshair!: Phaser.GameObjects.Image;
  private rope!: Phaser.GameObjects.Graphics;
  private hook!: Phaser.GameObjects.Image;
  private sea!: Phaser.GameObjects.Graphics;
  private balloons: Balloon[] = [];
  private hookState: 'idle' | 'out' | 'back' = 'idle';
  private hookTarget = new Phaser.Math.Vector2();
  private hookDir = new Phaser.Math.Vector2();
  private hooked: Balloon | null = null;
  private aim = new Phaser.Math.Vector2(W / 2, H / 2);
  private recovered = 0;
  private released = 0;
  private caughtCount = 0;
  private streak = 0;
  private escaped: Doc[] = [];
  private deck: Doc[] = [];
  private practice = false;
  private maxPending = 1;
  private spawnIn = 0.5;
  private elapsedRound = 0;
  private currency = 'EUR';
  private keys!: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('BalloonCatch');
  }

  protected scoreLabel() {
    return `🎈 ${money(this.recovered ?? 0, this.currency, 0)}`;
  }

  protected build() {
    const s = state.snapshot!;
    this.currency = s.currency;
    this.balloons = [];
    this.hookState = 'idle';
    this.hooked = null;
    this.recovered = 0;
    this.released = 0;
    this.caughtCount = 0;
    this.streak = 0;
    this.escaped = [];
    this.spawnIn = 0.5;
    this.elapsedRound = 0;
    // Most overdue first-ish: shuffle, then float the overdue ones a little earlier.
    this.deck = Phaser.Utils.Array.Shuffle([...s.owedByClients]).sort((a, b) => Number(b.daysOverdue > 0) - Number(a.daysOverdue > 0) || 0);
    this.released = s.owedByClients.reduce((a, d) => a + d.pending, 0);
    this.practice = this.deck.length === 0;
    this.maxPending = Math.max(1, ...s.owedByClients.map((d) => d.pending));

    drawBackdrop(this, { groundY: SEA_Y, seed: 17, ground: false });
    birds(this, W);
    this.sea = this.add.graphics().setDepth(4);

    // Dock
    const dock = this.add.graphics().setDepth(6);
    dock.fillStyle(0x8b5e3c, 1);
    dock.fillRect(W / 2 - 420, SEA_Y - 40, 840, 30);
    dock.fillStyle(0xa8754a, 1);
    dock.fillRect(W / 2 - 420, SEA_Y - 40, 840, 10);
    for (let x = W / 2 - 400; x <= W / 2 + 400; x += 100) this.add.image(x, SEA_Y - 30, 'post').setOrigin(0.5, 0).setDepth(5);
    this.register = this.add.image(W / 2 + 230, SEA_Y - 38, 'register').setOrigin(0.5, 1).setDepth(7);
    this.pig = this.add.image(ORIGIN.x - 40, SEA_Y - 90, 'pig').setDepth(8).setScale(1.1);

    this.rope = this.add.graphics().setDepth(9);
    this.hook = this.add.image(ORIGIN.x, ORIGIN.y, 'hook').setDepth(10).setVisible(false);
    this.crosshair = this.add.image(W / 2, H / 2, 'crosshair').setDepth(30);
    this.tweens.add({ targets: this.crosshair, angle: 360, duration: 6000, repeat: -1 });

    if (this.practice) {
      const msg = text(this, W / 2, 230, s.locked.includes('invoices') ? t('zone.locked.short') : '🎉 ' + t('balloon.none'), 34, '#7CF5A8', { strokeThickness: 7 }).setDepth(901);
      this.tweens.add({ targets: msg, alpha: 0, delay: 5000, duration: 800 });
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN, a: K.A, d: K.D, w: K.W, s: K.S }) as typeof this.keys;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.aim.set(p.x, p.y));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.aim.set(p.x, p.y);
      this.fire();
    });
    this.input.keyboard!.on('keydown-SPACE', () => this.fire());
    this.input.keyboard!.on('keydown-ENTER', () => this.fire());
    this.input.setDefaultCursor('none');
    this.events.once('shutdown', () => this.input.setDefaultCursor('default'));
    const showCursor = () => this.input.setDefaultCursor('default');
    const hideCursor = () => this.input.setDefaultCursor('none');
    this.events.on('pause', showCursor);
    this.events.on('resume', hideCursor);
    this.events.once('shutdown', () => {
      this.events.off('pause', showCursor);
      this.events.off('resume', hideCursor);
    });
  }

  private spawnBalloon() {
    let doc: Doc | null = null;
    let value: number;
    // Golden balloons are bonus extras: they never take an invoice off the queue.
    const golden = Math.random() < 0.06;
    if (this.practice || golden) value = golden ? 0 : 100 + Math.round(Math.random() * 1900);
    else {
      // Each unpaid invoice floats once; escaped ones rejoin the queue, caught ones are gone.
      const next = this.deck.shift();
      if (!next) return;
      doc = next;
      value = doc.pending;
    }
    const maxA = this.practice ? 2000 : this.maxPending;
    const scale = golden ? 1 : 0.8 + 0.7 * Math.sqrt(value / maxA);
    const key = golden ? 'balloon-gold' : doc && doc.daysOverdue > 30 ? 'balloon-red' : doc && doc.daysOverdue > 0 ? 'balloon-orange' : ['balloon-blue', 'balloon-green', 'balloon-purple'][Math.floor(Math.random() * 3)];
    const x = 160 + Math.random() * (W - 320);
    const img = this.add.image(x, H + 80, key).setScale(scale).setDepth(12);
    const labelStr = golden ? '⏱ +5 s' : doc ? `${doc.contact}\n${moneyShort(doc.pending, doc.currency)}${doc.daysOverdue > 0 ? ` · ⚠${doc.daysOverdue}d` : ''}` : `${t('balloon.practice')}\n${moneyShort(value, this.currency)}`;
    const label = text(this, x, H + 160, labelStr, 20, doc && doc.daysOverdue > 0 ? '#FFD0D6' : '#FFFFFF', { strokeThickness: 4 }).setDepth(13);
    const difficulty = Math.min(1, this.elapsedRound / 55);
    this.balloons.push({
      img,
      label,
      doc,
      value: golden ? 0 : value,
      vy: -(95 + Math.random() * 60 + difficulty * 110 + (doc && doc.daysOverdue > 0 ? 55 : 0)),
      phase: Math.random() * Math.PI * 2,
      r: 34 * scale,
      hooked: false,
      dead: false,
      golden,
    });
  }

  private fire() {
    if (!this.running || this.hookState !== 'idle') return;
    this.hookState = 'out';
    this.hookTarget.copy(this.aim);
    this.hookDir.set(this.aim.x - ORIGIN.x, this.aim.y - ORIGIN.y).normalize();
    this.hook.setPosition(ORIGIN.x, ORIGIN.y).setVisible(true).setRotation(this.hookDir.angle() + Math.PI / 2 + Math.PI);
    sfx('hook');
    this.pig.setTexture('pig-walk1');
    this.tweens.add({ targets: this.pig, scaleY: { from: 0.95, to: 1.1 }, duration: 150 });
  }

  protected tick(dt: number, time: number) {
    this.drawSea(time);
    // Aim with keys
    const k = this.keys;
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (kx || ky) {
      this.aim.x = Phaser.Math.Clamp(this.aim.x + kx * 950 * dt, 40, W - 40);
      this.aim.y = Phaser.Math.Clamp(this.aim.y + ky * 950 * dt, 40, SEA_Y - 140);
    }
    this.crosshair.setPosition(this.aim.x, this.aim.y);
    this.pig.setFlipX(this.aim.x < this.pig.x);

    if (this.running) {
      this.elapsedRound += dt;
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawnBalloon();
        const kk = Math.min(1, this.elapsedRound / 55);
        this.spawnIn = Phaser.Math.Linear(1.15, 0.5, kk) * (0.7 + Math.random() * 0.6);
      }
    }

    // Hook
    if (this.hookState !== 'idle') {
      const speed = HOOK_SPEED * dt;
      if (this.hookState === 'out') {
        this.hook.x += this.hookDir.x * speed;
        this.hook.y += this.hookDir.y * speed;
        for (const b of this.balloons) {
          if (b.dead || b.hooked) continue;
          if (Phaser.Math.Distance.Between(this.hook.x, this.hook.y, b.img.x, b.img.y) < b.r + 22) {
            b.hooked = true;
            this.hooked = b;
            this.hookState = 'back';
            sfx('pop', { pitch: 1.8 });
            sfx('reel');
            shockwave(this, b.img.x, b.img.y, 0xffffff, 1.2, 14);
            break;
          }
        }
        const dist = Phaser.Math.Distance.Between(ORIGIN.x, ORIGIN.y, this.hook.x, this.hook.y);
        const targetDist = Phaser.Math.Distance.Between(ORIGIN.x, ORIGIN.y, this.hookTarget.x, this.hookTarget.y);
        if (this.hookState === 'out' && (dist > Math.min(HOOK_MAX, targetDist + 70) || this.hook.y < -40)) {
          this.hookState = 'back';
          if (this.streak > 0) this.streak = 0;
        }
      } else {
        const back = new Phaser.Math.Vector2(ORIGIN.x - this.hook.x, ORIGIN.y - this.hook.y);
        const len = back.length();
        const sp = (this.hooked ? HOOK_SPEED * 0.6 : HOOK_SPEED) * dt;
        if (len <= sp) this.hookHome();
        else {
          back.normalize().scale(sp);
          this.hook.x += back.x;
          this.hook.y += back.y;
        }
        if (this.hooked) {
          this.hooked.img.setPosition(this.hook.x, this.hook.y - this.hooked.r - 10);
          this.hooked.label.setPosition(this.hooked.img.x, this.hooked.img.y + this.hooked.r + 30);
        }
      }
      this.rope.clear();
      this.rope.lineStyle(4, 0x5b3a1e, 1);
      this.rope.lineBetween(ORIGIN.x, ORIGIN.y, this.hook.x, this.hook.y);
    }

    // Balloons drift up and sway; the ones that reach the top escape.
    for (const b of this.balloons) {
      if (b.dead || b.hooked) continue;
      b.phase += dt * 2;
      b.img.y += b.vy * dt;
      b.img.x += Math.sin(b.phase) * 40 * dt;
      b.img.setAngle(Math.sin(b.phase) * 6);
      b.label.setPosition(b.img.x, b.img.y + b.r + 36);
      if (b.img.y < -120) this.escape(b);
    }
    this.balloons = this.balloons.filter((b) => !b.dead);
  }

  private hookHome() {
    this.hookState = 'idle';
    this.hook.setVisible(false);
    this.rope.clear();
    this.pig.setTexture('pig');
    const b = this.hooked;
    this.hooked = null;
    if (!b) return;
    b.dead = true;
    b.label.destroy();
    if (b.golden) {
      this.timeLeft += 5;
      sfx('powerup');
      popText(this, ORIGIN.x, ORIGIN.y - 160, '⏱ +5 s', '#FFE45C', 48);
      sparkle(this, b.img.x, b.img.y, 20);
      b.img.destroy();
      return;
    }
    this.caughtCount++;
    this.streak++;
    if (b.doc) this.escaped = this.escaped.filter((d) => d.id !== b.doc!.id);
    this.tweens.add({
      targets: b.img,
      x: this.register.x,
      y: this.register.y - 90,
      scale: 0.2,
      duration: 260,
      ease: 'Cubic.in',
      onComplete: () => {
        b.img.destroy();
        this.recovered += b.value;
        this.setScore();
        sfx('coinBig', { pitch: 1 + Math.min(0.6, this.streak * 0.06) });
        burst(this, this.register.x, this.register.y - 100, 'coin-sm', { count: 12, speed: [250, 550], angle: [220, 320], gravityY: 1300, rotate: true, lifespan: 1000, scale: [1, 0.7] });
        this.tweens.add({ targets: this.register, scaleY: { from: 0.85, to: 1 }, duration: 220, ease: 'Back.out' });
        const who = b.doc ? `${b.doc.contact} ` : '';
        // Alternate sides so consecutive catches don't stack on top of each other.
        const side = this.caughtCount % 2 ? -1 : 1;
        popText(this, this.register.x + side * 160, this.register.y - 200 - (this.caughtCount % 3) * 36, `${who}+${moneyShort(b.value, this.currency)}`, '#9CF6EA', 32);
        if (this.streak >= 3) popText(this, this.register.x, this.register.y - 290, `🔥 ×${this.streak}`, '#FF9F43', 36, { delay: 150 });
        this.pig.setTexture('pig-happy');
        this.time.delayedCall(400, () => this.pig.setTexture('pig'));
        if (!this.practice && this.deck.length === 0 && !this.balloons.some((x) => !x.dead && x.doc)) this.allCollected();
      },
    });
  }

  private allCollected() {
    if (this.over) return;
    confetti(this, W / 2, H / 2, 120);
    sfx('fanfare');
    this.finish('🎉 ' + t('balloon.all'));
  }

  private escape(b: Balloon) {
    b.dead = true;
    if (b.doc) {
      if (!this.escaped.some((d) => d.id === b.doc!.id)) this.escaped.push(b.doc);
      this.deck.push(b.doc);
    }
    if (!b.golden) {
      sfx('sad', { volume: 0.35 });
      popText(this, b.img.x, 60, `${t('balloon.escaped')}`, '#FFB3C0', 26, { rise: -40, duration: 700 });
    }
    b.img.destroy();
    b.label.destroy();
    this.streak = 0;
  }

  private drawSea(time: number) {
    const g = this.sea;
    g.clear();
    g.fillStyle(0x2f86c9, 1);
    g.fillRect(0, SEA_Y, W, H - SEA_Y);
    for (let layer = 0; layer < 2; layer++) {
      g.fillStyle(layer ? 0x56b4f0 : 0x3d9be0, 1);
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, H)];
      for (let x = 0; x <= W; x += 30) pts.push(new Phaser.Math.Vector2(x, SEA_Y - 10 + layer * 30 + Math.sin(x / 70 + time / (500 + layer * 200) + layer) * 9));
      pts.push(new Phaser.Math.Vector2(W, H));
      g.fillPoints(pts, true);
    }
  }

  protected results(headline: string): ResultsData {
    const cur = this.currency;
    const ratio = this.released > 0 ? this.recovered / this.released : 0;
    const escaped = [...this.escaped].sort((a, b) => b.daysOverdue - a.daysOverdue || b.pending - a.pending);
    return {
      run: { game: 'balloon', score: Math.round(this.recovered), ratio, extra: { caught: this.caughtCount } },
      scene: 'BalloonCatch',
      headline,
      scoreLabel: t('balloon.caught'),
      formatScore: (n) => money(n, cur, 0),
      summary: `${t('balloon.result', { amount: money(this.recovered, cur, 0) })} · ${this.caughtCount} 🎈 · ${Math.round(ratio * 100)}%`,
      listTitle: escaped.length ? t('balloon.escapedList') : undefined,
      list: escaped.map((d) => [`${d.contact} · ${d.number}`, `${money(d.pending, d.currency, 0)}${d.daysOverdue > 0 ? ` · ⚠ ${d.daysOverdue} d` : ''}`]),
    };
  }
}
