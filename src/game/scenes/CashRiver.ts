import Phaser from 'phaser';
import { goToWorld } from '../../app';
import { sfx } from '../../audio/sfx';
import { seriesExtremes } from '../../data/cash';
import type { CashPoint, CashSeries } from '../../data/types';
import { fmtDate, locale, money, moneyShort, num, t } from '../../i18n/i18n';
import { birds, drawBackdrop } from '../backdrop';
import { burst, popText, sparkle } from '../fx';
import { state } from '../state';
import { H, W, text } from '../ui';
import { MiniGame } from './MiniGame';
import type { ResultsData } from './Results';

const LEFT = 700; // where day 0 sits in the world
const TOP_Y = 380; // water surface at the highest balance
const LOW_Y = 880; // … and at the lowest
const DAYS_PER_SECOND = 6;
const GRAVITY = 2600;
const JUMP_V = 1000;

interface RiverEvent {
  x: number;
  y: number;
  amount: number;
  label: string;
  date: string;
  obj: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text;
  done: boolean;
}

/** Ride your bank balance: the water level is your real cash, day by day. */
export class CashRiver extends MiniGame {
  protected readonly song = 'river' as const;
  protected readonly roundSeconds = null;
  protected helpKey = 'river.help' as const;

  private series!: CashSeries;
  private pts: CashPoint[] = [];
  private pxPerDay = 20;
  private worldW = W;
  private minB = 0;
  private maxB = 1;
  private raft!: Phaser.GameObjects.Container;
  private pig!: Phaser.GameObjects.Image;
  private raftX = LEFT;
  private jumpH = 0;
  private vy = 0;
  private drops: RiverEvent[] = [];
  private score = 0;
  private combo = 0;
  private bumps = 0;
  private collected = 0;
  private speedMul = 1;
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;
  private pointerSide: -1 | 0 | 1 = 0;
  private wake!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('CashRiver');
  }

  protected scoreLabel() {
    return `⭐ ${num(Math.round(this.score ?? 0))}`;
  }

  /** The HUD clock shows the day you are sailing through and its balance. */
  protected updateTime() {
    if (!this.pts?.length) return;
    const p = this.pts[this.dayIndex()];
    this.timeText.setText(`📅 ${fmtDate(p.date)} · ${moneyShort(p.balance, this.series.currency)}`).setFontSize(32);
    this.timeText.setColor(p.balance < 0 ? '#FF6B7D' : '#FFFFFF');
  }

  private dayIndex() {
    return Phaser.Math.Clamp(Math.round((this.raftX - LEFT) / this.pxPerDay), 0, this.pts.length - 1);
  }

  private yOf(balance: number) {
    const span = this.maxB - this.minB || 1;
    return LOW_Y - ((balance - this.minB) / span) * (LOW_Y - TOP_Y);
  }

  private xOf(i: number) {
    return LEFT + i * this.pxPerDay;
  }

  /** Water surface height at any world x (linear between days). */
  private surfaceAt(x: number) {
    const f = (x - LEFT) / this.pxPerDay;
    if (f <= 0) return this.yOf(this.pts[0].balance);
    if (f >= this.pts.length - 1) return this.yOf(this.pts[this.pts.length - 1].balance);
    const i = Math.floor(f);
    const a = this.yOf(this.pts[i].balance);
    const b = this.yOf(this.pts[i + 1].balance);
    return a + (b - a) * (f - i);
  }

  protected build() {
    if (!state.cash || !state.cash.points.length) {
      goToWorld();
      return;
    }
    this.series = state.cash;
    this.pts = this.series.points;
    this.drops = [];
    this.score = 0;
    this.combo = 0;
    this.bumps = 0;
    this.collected = 0;
    this.jumpH = 0;
    this.vy = 0;
    this.speedMul = 1;
    this.pointerSide = 0;
    const n = this.pts.length;
    this.pxPerDay = Phaser.Math.Clamp(6000 / n, 14, 40);
    this.worldW = LEFT + (n - 1) * this.pxPerDay + 1100;
    this.raftX = LEFT;
    const { min, max } = seriesExtremes(this.pts);
    const pad = Math.max(1, (max.balance - min.balance) * 0.08);
    this.minB = min.balance - pad;
    this.maxB = max.balance + pad;

    this.cameras.main.setBounds(0, 0, this.worldW, H);
    drawBackdrop(this, { width: this.worldW, groundY: 960, seed: 23, ground: false });
    birds(this, this.worldW);
    this.drawRiver();
    this.drawMarkers(min, max);
    this.placeEvents();

    this.pig = this.add.image(0, -58, 'pig').setScale(0.9);
    this.raft = this.add.container(this.raftX, this.surfaceAt(this.raftX), [this.add.image(0, -10, 'raft'), this.pig]).setDepth(20);
    this.wake = this.add.particles(0, 0, 'dot', {
      lifespan: 700,
      speedX: { min: -160, max: -60 },
      speedY: { min: -60, max: 10 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: 0xffffff,
      frequency: 50,
    });
    this.wake.setDepth(19);
    this.cameras.main.startFollow(this.raft, true, 0.1, 0.06, -W * 0.18, 0);

    if (this.series.source === 'estimated') {
      const note = text(this, W / 2, 150, '≈ ' + t(this.series.anchored ? 'river.estimated' : 'river.unanchored'), 24, '#FFE6A8', { strokeThickness: 5 })
        .setScrollFactor(0)
        .setDepth(901);
      this.tweens.add({ targets: note, alpha: 0, delay: 6000, duration: 800 });
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ left: K.LEFT, right: K.RIGHT, a: K.A, d: K.D }) as typeof this.keys;
    const jump = () => this.jump();
    for (const k of ['SPACE', 'UP', 'W']) this.input.keyboard!.on(`keydown-${k}`, jump);
    // Tap/click jumps; holding on the left or right third slows down or speeds up.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointerSide = p.x < W / 3 ? -1 : p.x > (W * 2) / 3 ? 1 : 0;
      if (this.pointerSide === 0) this.jump();
    });
    this.input.on('pointerup', () => (this.pointerSide = 0));
  }

  private drawRiver() {
    const g = this.add.graphics().setDepth(5);
    const top: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(-50, this.surfaceAt(0)), new Phaser.Math.Vector2(LEFT, this.surfaceAt(LEFT))];
    for (let i = 0; i < this.pts.length; i++) top.push(new Phaser.Math.Vector2(this.xOf(i), this.yOf(this.pts[i].balance)));
    top.push(new Phaser.Math.Vector2(this.worldW + 50, this.surfaceAt(this.worldW)));
    // Deep water, then a lighter band under the surface, then foam.
    g.fillStyle(0x1f6fb2, 1);
    g.fillPoints([...top, new Phaser.Math.Vector2(this.worldW + 50, H), new Phaser.Math.Vector2(-50, H)], true);
    g.fillStyle(0x3d9be0, 1);
    g.fillPoints([...top, ...[...top].reverse().map((p) => new Phaser.Math.Vector2(p.x, p.y + 46))], true);
    g.lineStyle(6, 0xffffff, 0.75);
    g.strokePoints(top, false);
    // Zero line: below it the account is overdrawn.
    if (this.minB < 0 && this.maxB > 0) {
      const y0 = this.yOf(0);
      const z = this.add.graphics().setDepth(6);
      z.lineStyle(4, 0xff4d5e, 0.85);
      for (let x = 0; x < this.worldW; x += 46) z.lineBetween(x, y0, x + 26, y0);
      text(this, LEFT - 160, y0 - 22, t('river.zero'), 22, '#FFB3BD', { strokeThickness: 4 }).setDepth(6);
    }
    // Riverbank at the start and the finish flag at today.
    const bank = this.add.graphics().setDepth(7);
    bank.fillStyle(0x5cc45f, 1);
    bank.fillRoundedRect(-60, this.surfaceAt(0) - 10, LEFT - 260, H, 30);
    const endX = this.xOf(this.pts.length - 1);
    bank.fillRoundedRect(endX + 200, this.surfaceAt(endX) - 10, 2000, H, 30);
    this.add.image(endX + 120, this.surfaceAt(endX) - 6, 'flag-gold').setOrigin(0.1, 1).setDepth(8).setScale(1.3);
  }

  private drawMarkers(min: CashPoint, max: CashPoint) {
    const cur = this.series.currency;
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      if (p.date.slice(8, 10) !== '01' && i !== 0) continue;
      const x = this.xOf(i);
      const y = this.yOf(p.balance);
      this.add.rectangle(x, y - 60, 6, 120, 0x8b5e3c).setDepth(4);
      const label = new Intl.DateTimeFormat(locale(), { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, 15)));
      text(this, x, y - 150, `${label}\n${moneyShort(p.balance, cur)}`, 22, '#FFFFFF', { strokeThickness: 5 }).setDepth(4);
    }
    const mark = (p: CashPoint, label: string, color: string) => {
      const i = this.pts.indexOf(p);
      const x = this.xOf(i);
      const y = this.yOf(p.balance);
      const tx = text(this, x, y - 230, label, 28, color, { strokeThickness: 6, weight: 700 }).setDepth(9);
      this.tweens.add({ targets: tx, y: y - 245, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    };
    mark(min, t('river.low', { amount: money(min.balance, cur, 0) }), '#FFB3BD');
    mark(max, t('river.high', { amount: money(max.balance, cur, 0) }), '#FFE45C');
  }

  /** Big money in floats as a bag to grab; big money out sits in the water as a rock to hop. */
  private placeEvents() {
    const cur = this.series.currency;
    const maxAbs = Math.max(1, ...this.series.events.map((e) => Math.abs(e.amount)));
    let lastX = -Infinity;
    for (const e of this.series.events) {
      const i = this.pts.findIndex((p) => p.date === e.date);
      if (i < 0) continue;
      // Keep obstacles apart so every one of them can be cleared.
      const x = Math.max(this.xOf(i), lastX + 260);
      lastX = x;
      const surface = this.surfaceAt(x);
      const scale = 0.7 + 0.6 * Math.sqrt(Math.abs(e.amount) / maxAbs);
      const isIn = e.amount > 0;
      const y = isIn ? surface - 150 : surface - 26;
      const obj = this.add.image(x, y, isIn ? 'bag' : 'rock').setScale(scale).setDepth(isIn ? 15 : 12);
      if (isIn) this.tweens.add({ targets: obj, y: y - 14, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      const tag = text(this, x, y - 70 * scale, `${isIn ? '+' : '−'}${moneyShort(Math.abs(e.amount), cur)}\n${e.label}`.trim(), 20, isIn ? '#FFE45C' : '#FFB3BD', {
        strokeThickness: 4,
        wrap: 260,
      }).setDepth(16);
      this.drops.push({ x, y, amount: e.amount, label: e.label, date: e.date, obj, tag, done: false });
    }
  }

  private jump() {
    if (!this.running || this.jumpH > 4) return;
    this.vy = JUMP_V;
    sfx('jump');
    this.pig.setTexture('pig-walk1');
    burst(this, this.raft.x, this.raft.y, 'dot', { count: 8, tint: 0xffffff, speed: [80, 220], angle: [200, 340], gravityY: 600, lifespan: 500 });
  }

  protected tick(dt: number) {
    if (!this.pts.length || !this.raft) return;
    if (this.running) {
      const k = this.keys;
      const fast = k.right.isDown || k.d.isDown || this.pointerSide === 1;
      const slow = k.left.isDown || k.a.isDown || this.pointerSide === -1;
      this.speedMul = Phaser.Math.Linear(this.speedMul, fast ? 2.6 : slow ? 0.35 : 1, 0.08);
      this.raftX = Math.min(this.xOf(this.pts.length - 1), this.raftX + this.pxPerDay * DAYS_PER_SECOND * this.speedMul * dt);
    }
    // Jump arc above the water surface.
    if (this.jumpH > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.jumpH = Math.max(0, this.jumpH + this.vy * dt);
      if (this.jumpH === 0) {
        this.vy = 0;
        this.pig.setTexture('pig');
        sfx('land', { volume: 0.4 });
        burst(this, this.raft.x, this.raft.y, 'dot', { count: 10, tint: 0xd6f0ff, speed: [80, 260], angle: [200, 340], gravityY: 700, lifespan: 600 });
      }
    }
    const surface = this.surfaceAt(this.raftX);
    const slope = (this.surfaceAt(this.raftX + 20) - this.surfaceAt(this.raftX - 20)) / 40;
    const bob = this.jumpH === 0 ? Math.sin(this.time.now / 260) * 3 : 0;
    this.raft.setPosition(this.raftX, surface - this.jumpH + bob);
    this.raft.setRotation(Phaser.Math.Linear(this.raft.rotation, Math.atan(slope) * 0.8, 0.15));
    this.wake.setPosition(this.raftX - 70, surface + 4);
    this.wake.emitting = this.jumpH === 0 && this.running;

    for (const e of this.drops) {
      if (e.done) continue;
      const dx = e.x - this.raftX;
      if (e.amount > 0) {
        // Bags: grab them in the air.
        if (Math.abs(dx) < 70 && Math.abs(this.raft.y - 60 - e.obj.y) < 80) this.collect(e);
        else if (dx < -90) this.miss(e);
      } else if (Math.abs(dx) < 46) {
        if (this.jumpH > 55) this.clear(e);
        else this.bump(e);
      }
    }

    if (this.running && this.raftX >= this.xOf(this.pts.length - 1)) this.finish(t('river.end'));
  }

  private collect(e: RiverEvent) {
    e.done = true;
    this.combo++;
    this.collected++;
    const gain = Math.round(50 + Math.log10(1 + e.amount) * 40) * this.combo;
    this.score += gain;
    this.setScore();
    sfx('coinBig', { pitch: 1 + Math.min(0.5, this.combo * 0.05) });
    sparkle(this, e.x, e.obj.y, 14);
    popText(this, e.x, e.obj.y - 60, `+${gain}${this.combo > 1 ? ` ×${this.combo}` : ''}`, '#FFE45C', 34);
    this.tweens.killTweensOf(e.obj);
    this.tweens.add({ targets: [e.obj, e.tag], alpha: 0, y: '-=60', duration: 300, onComplete: () => (e.obj.destroy(), e.tag.destroy()) });
  }

  private miss(e: RiverEvent) {
    e.done = true;
    this.combo = 0;
    this.tweens.add({ targets: [e.obj, e.tag], alpha: 0.3, duration: 300 });
  }

  private clear(e: RiverEvent) {
    e.done = true;
    this.combo++;
    const gain = 80 * this.combo;
    this.score += gain;
    this.setScore();
    sfx('nearMiss');
    popText(this, e.x, e.obj.y - 80, `${t('river.clear')} +${gain}`, '#7CF5E8', 30);
  }

  private bump(e: RiverEvent) {
    e.done = true;
    this.combo = 0;
    this.bumps++;
    this.score = Math.max(0, this.score - 60);
    this.setScore();
    this.speedMul = 0.2;
    sfx('hit', { volume: 0.6 });
    this.cameras.main.shake(220, 0.01);
    this.pig.setTexture('pig-hurt');
    this.time.delayedCall(500, () => this.pig.setTexture('pig'));
    burst(this, e.x, e.obj.y, 'dot', { count: 18, tint: 0xd6f0ff, speed: [150, 420], angle: [200, 340], gravityY: 900, lifespan: 700 });
    popText(this, e.x, e.obj.y - 80, t('river.bump'), '#FF9AA6', 32);
  }

  protected results(headline: string): ResultsData {
    const cur = this.series.currency;
    const first = this.pts[0];
    const last = this.pts[this.pts.length - 1];
    const { min } = seriesExtremes(this.pts);
    const delta = last.balance - first.balance;
    // Payroll would fill the list on its own: show the biggest money in and the biggest money out.
    const byAbs = [...this.series.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const top = [...byAbs.filter((e) => e.amount > 0).slice(0, 3), ...byAbs.filter((e) => e.amount < 0).slice(0, 2)];
    const note = this.series.source === 'estimated' ? `\n≈ ${t(this.series.anchored ? 'river.estimated' : 'river.unanchored')}` : '';
    return {
      run: { game: 'river', score: Math.round(this.score), extra: { finished: true, caught: this.collected } },
      scene: 'CashRiver',
      headline,
      scoreLabel: t('game.score'),
      formatScore: (v) => `${num(Math.round(v))} pts`,
      summary:
        t('river.result', {
          from: money(first.balance, cur, 0),
          to: money(last.balance, cur, 0),
          delta: `${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), cur, 0)}`,
          min: money(min.balance, cur, 0),
          date: fmtDate(min.date),
        }) + note,
      listTitle: top.length ? t('river.biggest') : undefined,
      list: top.map((e) => [`${e.label || '—'} · ${fmtDate(e.date)}`, `${e.amount >= 0 ? '+' : '−'}${money(Math.abs(e.amount), cur, 0)}`]),
    };
  }
}
