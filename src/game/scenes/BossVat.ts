import Phaser from 'phaser';
import { goToWorld } from '../../app';
import { music } from '../../audio/music';
import { sfx } from '../../audio/sfx';
import { daysBetween } from '../../data/parse';
import { short } from '../../data/labels';
import type { VatDoc, VatQuarter } from '../../data/types';
import { fmtDate, money, moneyShort, num, t } from '../../i18n/i18n';
import { drawBackdrop } from '../backdrop';
import { burst, confetti, flash, hitStop, popText, shockwave, sparkle } from '../fx';
import { state } from '../state';
import { H, W, text } from '../ui';
import { MiniGame } from './MiniGame';
import type { ResultsData } from './Results';

const PLAYER_Y = 960;
const MAX_HP = 100;
const SHOT_EVERY = 0.16;
const SHOT_DAMAGE = 1.25;
const MAX_RECEIPTS = 14;

interface Receipt {
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  docs: VatDoc[];
  tax: number;
  vx: number;
  dead: boolean;
}

interface Bullet {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  dead: boolean;
}

/**
 * The quarter's VAT return as a boss fight. Its health is gameplay, but every number shown is real:
 * VAT charged on sales, VAT paid on purchases (golden receipts = deductions) and the 303 deadline.
 */
export class BossVat extends MiniGame {
  protected readonly song = 'boss' as const;
  protected readonly roundSeconds = null;
  protected helpKey = 'boss.help' as const;

  private vat!: VatQuarter;
  private boss!: Phaser.GameObjects.Image;
  private hpBar!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private superBar!: Phaser.GameObjects.Graphics;
  private superText!: Phaser.GameObjects.Text;
  private player!: Phaser.GameObjects.Image;
  private hearts: Phaser.GameObjects.Image[] = [];
  private hp = MAX_HP;
  private lives = 3;
  private invuln = 0;
  private shotIn = 0;
  private attackIn = 2;
  private slamIn = 5;
  private receiptIn = 2.5;
  private superCharge = 0;
  private dealt = 0;
  private phase = 1;
  private targetX = W / 2;
  private shots: Phaser.GameObjects.Image[] = [];
  private bullets: Bullet[] = [];
  private receipts: Receipt[] = [];
  private queue: { docs: VatDoc[]; tax: number }[] = [];
  private gotTax = 0;
  private gotDocs = new Set<string>();
  private won = false;
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;
  private telegraph: Phaser.GameObjects.Rectangle | null = null;

  constructor() {
    super('BossVat');
  }

  protected scoreLabel() {
    return `⚔ ${num(Math.round(this.points()))}`;
  }

  private points() {
    if (!this.vat) return 0;
    return Math.max(0, this.dealt * 10 + (this.won ? 1500 : 0) + this.ratio() * 1000 + (this.won ? this.lives * 300 : 0));
  }

  private ratio() {
    return this.vat.input > 0 ? Math.min(1, this.gotTax / this.vat.input) : 0;
  }

  protected build() {
    if (!state.vat) {
      goToWorld();
      return;
    }
    this.vat = state.vat;
    this.hp = MAX_HP;
    this.lives = 3;
    this.invuln = 0;
    this.shotIn = 0;
    this.attackIn = 2.2;
    this.slamIn = 6;
    this.receiptIn = 2.5;
    this.superCharge = this.vat.input > 0 ? 0 : 0.2;
    this.dealt = 0;
    this.phase = 1;
    this.shots = [];
    this.bullets = [];
    this.receipts = [];
    this.hearts = [];
    this.gotTax = 0;
    this.gotDocs = new Set();
    this.won = false;
    this.telegraph = null;
    this.targetX = W / 2;

    // Deductions fall as golden receipts, biggest first; the long tail is bundled into the last one.
    const docs = [...this.vat.purchases].filter((d) => d.tax > 0);
    const head = docs.slice(0, MAX_RECEIPTS - 1).map((d) => ({ docs: [d], tax: d.tax }));
    const tail = docs.slice(MAX_RECEIPTS - 1);
    if (tail.length) head.push({ docs: tail, tax: tail.reduce((a, d) => a + d.tax, 0) });
    this.queue = Phaser.Utils.Array.Shuffle(head);

    drawBackdrop(this, { stormy: true, groundY: 1010, seed: 31 });
    this.cameras.main.filters.external.addVignette(0.5, 0.5, 0.95, 0.25);
    this.boss = this.add.image(W / 2, 400, 'boss').setDepth(10);
    this.tweens.add({ targets: this.boss, scaleY: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.player = this.add.image(W / 2, PLAYER_Y, 'pig').setDepth(20).setScale(1.1);

    text(this, W / 2, 128, t('boss.name', { q: this.vat.quarter, y: this.vat.year }), 30, '#FFE45C', { strokeThickness: 6, weight: 700 }).setDepth(901);
    this.hpBar = this.add.graphics().setDepth(901);
    this.infoText = text(this, W / 2, 196, '', 22, '#FFFFFF', { strokeThickness: 4 }).setDepth(901);
    this.superBar = this.add.graphics().setDepth(901);
    this.superText = text(this, W - 230, H - 112, '', 20, '#FFE45C', { strokeThickness: 4 }).setDepth(901);
    for (let i = 0; i < 3; i++) this.hearts.push(this.add.image(60 + i * 58, 70, 'heart').setDepth(901));
    this.drawHud();
    if (this.vat.output <= 0) {
      const msg = text(this, W / 2, 560, t('boss.noSales'), 34, '#7CF5A8', { strokeThickness: 6 }).setDepth(901);
      this.tweens.add({ targets: msg, alpha: 0, delay: 4000, duration: 800 });
      this.boss.setScale(0.55);
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ left: K.LEFT, right: K.RIGHT, a: K.A, d: K.D }) as typeof this.keys;
    this.input.keyboard!.on('keydown-SPACE', () => this.superShot());
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => (this.targetX = p.x));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.targetX = p.x;
      this.superShot();
    });
  }

  private drawHud() {
    const cur = this.vat.currency;
    const g = this.hpBar;
    g.clear();
    const w = 900;
    const x0 = W / 2 - w / 2;
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(x0, 152, w, 22, 11);
    const k = Math.max(0, this.hp / MAX_HP);
    g.fillStyle(this.phase === 3 ? 0xff4d5e : this.phase === 2 ? 0xff9f43 : 0x9b6bff, 1);
    if (k > 0) g.fillRoundedRect(x0, 152, Math.max(22, w * k), 22, 11);
    const ded = this.vat.inputUnknown ? t('boss.inputUnknown') : t('boss.input', { got: moneyShort(this.gotTax, cur), total: moneyShort(this.vat.input, cur) });
    this.infoText.setText(`${t('boss.output', { amount: money(this.vat.output, cur, 0) })}   ·   ${ded}`);
    const s = this.superBar;
    s.clear();
    s.fillStyle(0x000000, 0.45);
    s.fillRoundedRect(W - 380, H - 90, 300, 20, 10);
    s.fillStyle(0xffd54a, 1);
    if (this.superCharge > 0) s.fillRoundedRect(W - 380, H - 90, Math.max(20, 300 * Math.min(1, this.superCharge)), 20, 10);
    this.superText.setText(this.superCharge >= 0.15 ? t('boss.ready') : '');
  }

  private superShot() {
    if (!this.running || this.superCharge < 0.15) return;
    const charge = Math.min(1, this.superCharge);
    this.superCharge = 0;
    const dmg = 6 + 34 * charge;
    sfx('powerup', { pitch: 0.8 });
    flash(this, 0xffe45c, 180);
    const beam = this.add.rectangle(this.player.x, (this.boss.y + PLAYER_Y) / 2, 60 + 80 * charge, PLAYER_Y - this.boss.y, 0xffe45c, 0.85).setDepth(15);
    beam.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, alpha: 0, scaleX: 0.2, duration: 380, onComplete: () => beam.destroy() });
    popText(this, this.player.x, PLAYER_Y - 160, t('boss.super'), '#FFE45C', 44);
    if (Math.abs(this.player.x - this.boss.x) < 170 * this.boss.scaleX + 40) this.damage(dmg, true);
    this.drawHud();
  }

  private damage(amount: number, big = false) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.dealt += amount;
    if (big) {
      // Only heavy hits flash white; regular coins would keep the boss blinking all the time.
      this.boss.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(120, () => this.boss.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
      hitStop(this, 90);
      this.cameras.main.shake(260, 0.012);
      shockwave(this, this.boss.x, this.boss.y, 0xffe45c, 3);
      burst(this, this.boss.x, this.boss.y, 'form', { count: 10, speed: [200, 500], rotate: true, gravityY: 800, lifespan: 1000, scale: [0.8, 0.5] });
      sfx('hit');
    }
    const phase = this.hp > 66 ? 1 : this.hp > 33 ? 2 : 3;
    if (phase !== this.phase) {
      this.phase = phase;
      popText(this, W / 2, 520, t(phase === 2 ? 'boss.phase2' : 'boss.phase3'), '#FF9AA6', 64, { rise: 40, duration: 900 });
      sfx('iva');
      if (phase === 3) {
        this.boss.setTexture('boss-angry');
        music.setIntensity(1);
      }
    }
    this.setScore();
    this.drawHud();
    if (this.hp <= 0) this.defeat();
  }

  private defeat() {
    this.won = true;
    this.running = false;
    for (const b of this.bullets) b.img.destroy();
    this.bullets = [];
    this.telegraph?.destroy();
    sfx('fanfare');
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 160, () => {
        burst(this, this.boss.x + (Math.random() - 0.5) * 260, this.boss.y + (Math.random() - 0.5) * 220, 'form', { count: 14, speed: [250, 700], rotate: true, gravityY: 900, lifespan: 1300 });
        shockwave(this, this.boss.x, this.boss.y, 0xffffff, 2 + i * 0.4);
        sfx('pop', { pitch: 0.6 + i * 0.1 });
      });
    }
    this.tweens.add({ targets: this.boss, scale: 0, angle: 200, alpha: 0, duration: 1000, delay: 400, ease: 'Back.in' });
    confetti(this, W / 2, 400, 120);
    this.finish(t('boss.win'));
  }

  private fireForm(angle: number, speed: number) {
    const img = this.add.image(this.boss.x, this.boss.y + 120, 'form').setDepth(14);
    this.bullets.push({ img, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dead: false });
  }

  private attack() {
    const aim = Math.atan2(PLAYER_Y - (this.boss.y + 120), this.player.x - this.boss.x);
    // Readable patterns: one form, then fans of three, then fans of four plus stamp slams.
    if (this.phase === 1) {
      this.fireForm(aim + (Math.random() - 0.5) * 0.3, 380);
      this.attackIn = 1.3;
    } else {
      const n = this.phase === 2 ? 3 : 4;
      const spread = this.phase === 2 ? 0.34 : 0.32;
      for (let i = 0; i < n; i++) this.fireForm(aim + (i - (n - 1) / 2) * spread, this.phase === 2 ? 420 : 440);
      this.attackIn = this.phase === 2 ? 1.15 : 1.2;
    }
    sfx('whoosh', { volume: 0.35, pitch: 0.7 });
  }

  /** Phase 3: a red column warns where the giant stamp will land. */
  private slam() {
    const x = this.player.x;
    this.telegraph = this.add.rectangle(x, H / 2 + 100, 150, H, 0xff4d5e, 0.22).setDepth(13);
    this.tweens.add({ targets: this.telegraph, alpha: 0.45, duration: 150, yoyo: true, repeat: 2 });
    this.time.delayedCall(900, () => {
      if (!this.running) return;
      this.telegraph?.destroy();
      this.telegraph = null;
      const stamp = this.add.image(x, -80, 'stamp').setScale(2).setDepth(16);
      this.tweens.add({
        targets: stamp,
        y: PLAYER_Y - 10,
        duration: 220,
        ease: 'Quad.in',
        onComplete: () => {
          this.cameras.main.shake(200, 0.014);
          sfx('land', { volume: 1 });
          burst(this, x, PLAYER_Y + 20, 'dot', { count: 16, tint: 0xff9aa6, speed: [150, 400], angle: [190, 350], gravityY: 300 });
          if (Math.abs(this.player.x - x) < 95) this.hurt();
          this.tweens.add({ targets: stamp, alpha: 0, y: PLAYER_Y + 40, delay: 300, duration: 300, onComplete: () => stamp.destroy() });
        },
      });
    });
    this.slamIn = 6;
  }

  private spawnReceipt() {
    const next = this.queue.shift();
    if (!next) return;
    const x = 160 + Math.random() * (W - 320);
    const img = this.add.image(x, -60, 'receipt').setDepth(17);
    const who = next.docs.length > 1 ? `+${next.docs.length}` : short(next.docs[0].contact, 18);
    const label = text(this, x, -10, `−${moneyShort(next.tax, this.vat.currency)} · ${who}`, 20, '#FFE45C', { strokeThickness: 4 }).setDepth(18);
    this.receipts.push({ img, label, docs: next.docs, tax: next.tax, vx: (Math.random() - 0.5) * 80, dead: false });
  }

  private hurt() {
    if (this.invuln > 0 || !this.running) return;
    this.lives--;
    this.invuln = 1.6;
    sfx('hit');
    hitStop(this, 80);
    flash(this, 0xff4d5e);
    this.cameras.main.shake(260, 0.014);
    this.player.setTexture('pig-hurt');
    this.time.delayedCall(500, () => this.player.setTexture('pig'));
    const heart = this.hearts[this.lives];
    if (heart) heart.setTexture('heart-empty');
    if (this.lives <= 0) {
      this.running = false;
      this.finish(t('boss.lose'));
    }
  }

  protected tick(dt: number, time: number) {
    if (!this.vat || !this.boss) return;
    // The boss drifts in a lazy figure eight.
    if (this.hp > 0) {
      const sp = this.phase === 3 ? 1.5 : this.phase === 2 ? 1.2 : 1;
      this.boss.x = W / 2 + Math.sin((time / 1000) * 0.55 * sp) * 560;
      this.boss.y = 400 + Math.sin((time / 1000) * 1.1 * sp) * 45;
    }
    // Player: mouse or keys.
    const k = this.keys;
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    if (kx) this.targetX = Phaser.Math.Clamp(this.player.x + kx * 60, 60, W - 60);
    if (this.running) {
      this.player.x = Phaser.Math.Clamp(Phaser.Math.Linear(this.player.x, this.targetX, Math.min(1, dt * 12)), 60, W - 60);
      this.player.setFlipX(this.targetX < this.player.x - 4);
    }
    if (this.invuln > 0) {
      this.invuln -= dt;
      this.player.setAlpha(Math.floor(time / 70) % 2 ? 0.35 : 1);
    } else this.player.setAlpha(1);

    if (this.running) {
      // Auto-fire coins upward.
      this.shotIn -= dt;
      if (this.shotIn <= 0) {
        this.shotIn = SHOT_EVERY;
        const shot = this.add.image(this.player.x, PLAYER_Y - 70, 'coin-sm').setDepth(15);
        this.shots.push(shot);
        sfx('select', { volume: 0.15, pitch: 1.6 });
      }
      this.attackIn -= dt;
      if (this.attackIn <= 0) this.attack();
      if (this.phase === 3) {
        this.slamIn -= dt;
        if (this.slamIn <= 0) this.slam();
      }
      this.receiptIn -= dt;
      if (this.receiptIn <= 0) {
        this.spawnReceipt();
        this.receiptIn = 3 + Math.random() * 1.5;
      }
      // Without deductions to collect, the super shot recharges slowly over time.
      if (!this.vat.purchases.length) this.superCharge = Math.min(1, this.superCharge + dt * 0.04);
    }

    // Coins up.
    for (const s of this.shots) {
      if (!s.active) continue;
      s.y -= 1300 * dt;
      s.rotation += 10 * dt;
      const dx = (s.x - this.boss.x) / (160 * this.boss.scaleX);
      const dy = (s.y - this.boss.y) / (170 * this.boss.scaleY);
      if (this.hp > 0 && dx * dx + dy * dy < 1) {
        s.destroy();
        this.damage(SHOT_DAMAGE);
        sparkle(this, s.x, s.y, 3);
      } else if (s.y < -40) s.destroy();
    }
    this.shots = this.shots.filter((s) => s.active);

    // Tax forms down.
    for (const b of this.bullets) {
      b.img.x += b.vx * dt;
      b.img.y += b.vy * dt;
      b.img.rotation += 4 * dt;
      if (Phaser.Math.Distance.Between(b.img.x, b.img.y, this.player.x, this.player.y) < 36) {
        b.dead = true;
        b.img.destroy();
        this.hurt();
      } else if (b.img.y > H + 60 || b.img.x < -60 || b.img.x > W + 60) {
        b.dead = true;
        b.img.destroy();
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // Golden receipts (deductions).
    for (const r of this.receipts) {
      r.img.y += 230 * dt;
      r.img.x += r.vx * dt + Math.sin(time / 300 + r.tax) * 0.8;
      r.img.rotation = Math.sin(time / 260 + r.tax) * 0.3;
      r.label.setPosition(r.img.x, r.img.y + 56);
      if (this.running && Math.abs(r.img.x - this.player.x) < 70 && Math.abs(r.img.y - this.player.y) < 70) this.catchReceipt(r);
      else if (r.img.y > H + 60) {
        r.dead = true;
        r.img.destroy();
        r.label.destroy();
      }
    }
    this.receipts = this.receipts.filter((r) => !r.dead);
  }

  private catchReceipt(r: Receipt) {
    r.dead = true;
    r.img.destroy();
    r.label.destroy();
    this.gotTax += r.tax;
    for (const d of r.docs) this.gotDocs.add(d.id);
    this.superCharge = Math.min(1, this.superCharge + (this.vat.input > 0 ? Math.max(0.15, (r.tax / this.vat.input) * 2) : 0.2));
    sfx('coinBig');
    sparkle(this, this.player.x, this.player.y - 40, 16);
    popText(this, this.player.x, this.player.y - 120, `${t('boss.deduction')} −${money(r.tax, this.vat.currency, 0)}`, '#FFE45C', 30);
    this.setScore();
    this.drawHud();
  }

  protected results(headline: string): ResultsData {
    const v = this.vat;
    const cur = v.currency;
    const left = daysBetween(state.snapshot?.today ?? v.to, v.deadline);
    const calc = t(v.net >= 0 ? 'boss.result.pay' : 'boss.result.refund', {
      out: money(v.output, cur, 0),
      in: money(v.input, cur, 0),
      net: money(Math.abs(v.net), cur, 0),
    });
    const deadline = v.closed ? t('boss.deadline', { date: fmtDate(v.deadline), n: Math.max(0, left) }) : t('boss.deadline.open', { date: fmtDate(v.deadline) });
    const notes = [calc, deadline, v.inputUnknown ? t('boss.inputUnknown') : '', t('boss.disclaimer')].filter(Boolean).join('\n');
    const pts = Math.round(this.points());
    return {
      run: { game: 'boss', score: pts, ratio: this.ratio(), extra: { won: this.won } },
      scene: 'BossVat',
      headline,
      scoreLabel: t('game.score'),
      formatScore: (n) => `${num(Math.round(n))} pts`,
      summary: notes,
      listTitle: v.purchases.length ? t('boss.deductionsList') : undefined,
      list: v.purchases.slice(0, 5).map((d) => [`${this.gotDocs.has(d.id) ? '✅' : '▫️'} ${short(d.contact, 32)} · ${d.number}`, money(d.tax, cur, 2)]),
    };
  }
}
