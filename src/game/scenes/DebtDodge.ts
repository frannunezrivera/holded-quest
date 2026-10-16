import Phaser from 'phaser';
import { music } from '../../audio/music';
import { sfx } from '../../audio/sfx';
import type { Doc } from '../../data/types';
import { money, moneyShort, num, t } from '../../i18n/i18n';
import { planeKey } from '../art/textures';
import { drawBackdrop } from '../backdrop';
import { burst, confetti, flash, hitStop, popText, shockwave, sparkle } from '../fx';
import { state } from '../state';
import { H, W, text } from '../ui';
import { MiniGame } from './MiniGame';
import type { ResultsData } from './Results';

const HERO_R = 34;
const DASH_SPEED = 1800;
const DASH_TIME = 0.2;
const DASH_COOLDOWN = 1.1;

interface Plane {
  img: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
  speed: number;
  homing: number;
  r: number;
  doc: Doc | null;
  nearMiss: boolean;
  minDist: number;
  dead: boolean;
  smoke: number;
}

/** Your unpaid bills become paper airplanes. Dodge them; close calls build a combo. */
export class DebtDodge extends MiniGame {
  protected readonly song = 'dodge' as const;
  protected readonly roundSeconds = null;
  protected helpKey = 'dodge.help' as const;

  private hero!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Image[] = [];
  private lives = 3;
  private planes: Plane[] = [];
  private coins: Phaser.GameObjects.Image[] = [];
  private points = 0;
  private combo = 0;
  private comboTimer = 0;
  private nearMisses = 0;
  private wave = 1;
  private spawnIn = 1;
  private coinIn = 6;
  private invuln = 0;
  private dashLeft = 0;
  private dashCooldown = 0;
  private dashDir = new Phaser.Math.Vector2(1, 0);
  private vel = new Phaser.Math.Vector2();
  private lastPointerMove = -9999;
  private pointer = new Phaser.Math.Vector2(W / 2, H / 2);
  private hitBy: Doc[] = [];
  private deck: Doc[] = [];
  private deckIndex = 0;
  private comboText!: Phaser.GameObjects.Text;
  private keys!: Record<'left' | 'right' | 'up' | 'down' | 'a' | 'd' | 'w' | 's', Phaser.Input.Keyboard.Key>;

  constructor() {
    super('DebtDodge');
  }

  protected scoreLabel() {
    return `✈️ ${num(Math.round(this.points ?? 0))}`;
  }

  protected build() {
    const s = state.snapshot!;
    this.planes = [];
    this.coins = [];
    this.hearts = [];
    this.lives = 3;
    this.points = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.wave = 1;
    this.spawnIn = 1.6;
    this.coinIn = 6;
    this.invuln = 0;
    this.dashLeft = 0;
    this.dashCooldown = 0;
    this.hitBy = [];
    this.lastPointerMove = -9999;
    // Overdue bills show up twice as often: they are the ones that hurt.
    this.deck = Phaser.Utils.Array.Shuffle(s.owedToSuppliers.flatMap((d) => (d.daysOverdue > 0 ? [d, d] : [d])));
    this.deckIndex = 0;

    drawBackdrop(this, { stormy: true, groundY: 1050, seed: 13 });
    this.cameras.main.filters.external.addVignette(0.5, 0.5, 0.9, 0.25);

    this.hero = this.add.image(W / 2, H / 2, 'pig-fly1').setDepth(20);
    this.ring = this.add.graphics().setDepth(19);
    for (let i = 0; i < 3; i++) this.hearts.push(this.add.image(60 + i * 58, 70, 'heart').setDepth(901).setScrollFactor(0));
    this.comboText = text(this, W / 2, 150, '', 38, '#FFE45C', { strokeThickness: 7, weight: 700 }).setDepth(901);

    if (!this.deck.length) {
      const msg = text(this, W / 2, 230, s.locked.includes('purchases') ? t('zone.locked.short') : '🎉 ' + t('dodge.noDebts'), 36, '#7CF5A8', { strokeThickness: 7 }).setDepth(901);
      this.tweens.add({ targets: msg, alpha: 0, delay: 5000, duration: 800 });
    }

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN, a: K.A, d: K.D, w: K.W, s: K.S }) as typeof this.keys;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointer.set(p.x, p.y);
      this.lastPointerMove = this.time.now;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointer.set(p.x, p.y);
      this.lastPointerMove = this.time.now;
      this.dash();
    });
    this.input.keyboard!.on('keydown-SPACE', () => this.dash());
    this.input.keyboard!.on('keydown-SHIFT', () => this.dash());
  }

  private nextDoc(): Doc | null {
    if (!this.deck.length) return null;
    const d = this.deck[this.deckIndex % this.deck.length];
    this.deckIndex++;
    return d;
  }

  private spawnPlane() {
    const doc = this.nextDoc();
    const amounts = this.deck.map((d) => d.pending);
    const maxA = Math.max(1, ...amounts);
    const scale = doc ? 0.9 + 0.8 * (Math.log10(1 + doc.pending) / Math.log10(1 + maxA)) : 0.8 + Math.random() * 0.4;
    const overdue = !!doc && doc.daysOverdue > 0;
    const edge = Math.random();
    let x: number;
    let y: number;
    if (edge < 0.6) [x, y] = [W + 80, 120 + Math.random() * (H - 240)];
    else if (edge < 0.75) [x, y] = [200 + Math.random() * (W - 400), -60];
    else if (edge < 0.9) [x, y] = [200 + Math.random() * (W - 400), H + 60];
    else [x, y] = [-80, 120 + Math.random() * (H - 240)];
    // Early waves aim loosely; later waves get sharper and faster.
    const spread = Math.max(220, 620 - this.wave * 70);
    const aim = new Phaser.Math.Vector2(this.hero.x + (Math.random() - 0.5) * spread * 2, this.hero.y + (Math.random() - 0.5) * spread * 2);
    const speed = 300 + this.wave * 36 + (overdue ? 90 : 0) + Math.random() * 110;
    const dir = aim.subtract(new Phaser.Math.Vector2(x, y)).normalize();
    const key = doc ? planeKey(doc.daysToDue) : 'plane-white';
    const img = this.add.image(x, y, key).setScale(scale).setDepth(15).setRotation(dir.angle());
    const labelStr = doc ? `${doc.contact} · ${moneyShort(doc.pending, doc.currency)}${overdue ? ` · ${doc.daysOverdue}d` : ''}` : t('dodge.future');
    const label = text(this, x, y + 40, labelStr, 20, overdue ? '#FFB3BD' : doc && doc.daysToDue !== null && doc.daysToDue <= 7 ? '#FFD08A' : '#FFFFFF', { strokeThickness: 4 }).setDepth(16);
    this.planes.push({ img, label, vx: dir.x * speed, vy: dir.y * speed, speed, homing: doc && doc.daysOverdue > 30 && this.wave >= 2 ? 1.6 : 0, r: 24 * scale, doc, nearMiss: false, minDist: Infinity, dead: false, smoke: 0 });
    sfx('whoosh', { volume: 0.35, pitch: overdue ? 0.8 : 1.1 });
  }

  private spawnCoin() {
    const x = 220 + Math.random() * (W - 440);
    const y = 200 + Math.random() * (H - 400);
    const c = this.add.image(x, y, 'coin').setDepth(14).setScale(0);
    this.tweens.add({ targets: c, scale: 1.2, duration: 300, ease: 'Back.out' });
    this.tweens.add({ targets: c, scaleX: { from: 1.2, to: 0.2 }, duration: 500, yoyo: true, repeat: -1, delay: 300 });
    const glow = this.add.image(x, y, 'glow').setTint(0xffd54a).setScale(0.6).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(13);
    c.setData('glow', glow);
    this.coins.push(c);
    this.time.delayedCall(6000, () => {
      if (!c.active) return;
      this.tweens.add({ targets: [c, glow], alpha: 0, duration: 400, onComplete: () => this.removeCoin(c) });
    });
  }

  private removeCoin(c: Phaser.GameObjects.Image) {
    (c.getData('glow') as Phaser.GameObjects.Image)?.destroy();
    c.destroy();
    this.coins = this.coins.filter((x) => x !== c);
  }

  private dash() {
    if (!this.running || this.dashCooldown > 0) return;
    const dir = this.vel.lengthSq() > 100 ? this.vel.clone().normalize() : new Phaser.Math.Vector2(this.pointer.x - this.hero.x, this.pointer.y - this.hero.y).normalize();
    if (dir.lengthSq() < 0.1) dir.set(1, 0);
    this.dashDir.copy(dir);
    this.dashLeft = DASH_TIME;
    this.dashCooldown = DASH_COOLDOWN;
    this.invuln = Math.max(this.invuln, DASH_TIME + 0.15);
    sfx('whoosh', { pitch: 1.6 });
    shockwave(this, this.hero.x, this.hero.y, 0xb9c6e0, 1.2, 18);
  }

  protected tick(dt: number) {
    const now = this.time.now;
    // ----- hero movement
    if (this.running) {
      const k = this.keys;
      const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      const prev = new Phaser.Math.Vector2(this.hero.x, this.hero.y);
      if (this.dashLeft > 0) {
        this.dashLeft -= dt;
        this.hero.x += this.dashDir.x * DASH_SPEED * dt;
        this.hero.y += this.dashDir.y * DASH_SPEED * dt;
        if (Math.random() < 0.8) {
          const ghost = this.add.image(this.hero.x, this.hero.y, this.hero.texture.key).setAlpha(0.5).setTint(0xb9c6e0).setDepth(18).setFlipX(this.hero.flipX);
          this.tweens.add({ targets: ghost, alpha: 0, scale: 0.8, duration: 250, onComplete: () => ghost.destroy() });
        }
      } else if (kx || ky) {
        this.lastPointerMove = -9999;
        const v = new Phaser.Math.Vector2(kx, ky).normalize().scale(760);
        this.hero.x += v.x * dt;
        this.hero.y += v.y * dt;
      } else if (now - this.lastPointerMove < 1500) {
        this.hero.x = Phaser.Math.Linear(this.hero.x, this.pointer.x, Math.min(1, dt * 9));
        this.hero.y = Phaser.Math.Linear(this.hero.y, this.pointer.y, Math.min(1, dt * 9));
      }
      this.hero.x = Phaser.Math.Clamp(this.hero.x, 60, W - 60);
      this.hero.y = Phaser.Math.Clamp(this.hero.y, 150, H - 70);
      this.vel.set((this.hero.x - prev.x) / Math.max(dt, 0.001), (this.hero.y - prev.y) / Math.max(dt, 0.001));
      if (Math.abs(this.vel.x) > 30) this.hero.setFlipX(this.vel.x < 0);
      this.hero.setAngle(Phaser.Math.Clamp(this.vel.y / 40, -18, 18) * (this.hero.flipX ? -1 : 1));
    }
    const flap = Math.floor(now / 110) % 2;
    this.hero.setTexture(this.invuln > 0 && this.dashLeft <= 0 && this.lives < 3 && this.hero.getData('hurt') ? 'pig-fly-hurt' : flap ? 'pig-fly1' : 'pig-fly2');
    this.hero.y += Math.sin(now / 160) * 0.6;
    if (this.invuln > 0) {
      this.invuln -= dt;
      this.hero.setAlpha(this.dashLeft > 0 ? 1 : Math.floor(now / 70) % 2 ? 0.35 : 1);
    } else {
      this.hero.setAlpha(1);
      this.hero.setData('hurt', false);
    }
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    this.ring.clear();
    if (this.dashCooldown > 0) {
      this.ring.lineStyle(5, 0xffffff, 0.6);
      this.ring.beginPath();
      this.ring.arc(this.hero.x, this.hero.y, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.dashCooldown / DASH_COOLDOWN));
      this.ring.strokePath();
    }

    if (!this.running) return;

    // ----- waves & spawning
    const wave = 1 + Math.floor(this.timeLeft / 10);
    if (wave !== this.wave) {
      this.wave = wave;
      sfx('powerup', { pitch: 0.7 });
      popText(this, W / 2, H / 2 - 120, t('dodge.wave', { n: wave }), '#FFE45C', 80, { rise: 40, duration: 900 });
      music.setIntensity(wave >= 3 ? 1 : 0);
    }
    this.points += dt * 10;
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnPlane();
      if (this.wave >= 4 && Math.random() < 0.3) this.spawnPlane();
      this.spawnIn = Math.max(0.26, 1.15 - this.wave * 0.11) * (0.7 + Math.random() * 0.6);
    }
    this.coinIn -= dt;
    if (this.coinIn <= 0) {
      this.spawnCoin();
      this.coinIn = 7 + Math.random() * 3;
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboText.setText('');
      }
    }

    // ----- coins
    for (const c of [...this.coins]) {
      if (Phaser.Math.Distance.Between(c.x, c.y, this.hero.x, this.hero.y) < HERO_R + 34) this.collectCoin(c);
    }

    // ----- planes
    for (const p of this.planes) {
      if (p.dead) continue;
      if (p.homing > 0) {
        p.homing -= dt;
        const want = Math.atan2(this.hero.y - p.img.y, this.hero.x - p.img.x);
        const cur = Math.atan2(p.vy, p.vx);
        const next = Phaser.Math.Angle.RotateTo(cur, want, 0.7 * dt);
        p.vx = Math.cos(next) * p.speed;
        p.vy = Math.sin(next) * p.speed;
      }
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.img.setRotation(Math.atan2(p.vy, p.vx));
      p.img.y += Math.sin(now / 200 + p.r) * 0.8;
      p.label.setPosition(p.img.x, p.img.y + 34 * p.img.scaleY + 10);
      if (p.doc && p.doc.daysOverdue > 0) {
        p.smoke -= dt;
        if (p.smoke <= 0) {
          p.smoke = 0.05;
          const puff = this.add.image(p.img.x - Math.cos(p.img.rotation) * 40, p.img.y - Math.sin(p.img.rotation) * 40, 'dot').setTint(0x6b6688).setAlpha(0.6).setScale(0.6).setDepth(12);
          this.tweens.add({ targets: puff, alpha: 0, scale: 1.4, duration: 500, onComplete: () => puff.destroy() });
        }
      }

      const d = Phaser.Math.Distance.Between(p.img.x, p.img.y, this.hero.x, this.hero.y);
      if (d < HERO_R * 0.8 + p.r * 0.75 && this.invuln <= 0) {
        this.hit(p);
        continue;
      }
      if (d < p.minDist) p.minDist = d;
      else if (!p.nearMiss && p.minDist < HERO_R + p.r + 50 && d > p.minDist + 8) {
        p.nearMiss = true;
        this.nearMiss(p);
      }
      if (p.img.x < -200 || p.img.x > W + 200 || p.img.y < -200 || p.img.y > H + 200) this.removePlane(p);
    }
    this.planes = this.planes.filter((p) => !p.dead);
  }

  private nearMiss(p: Plane) {
    this.combo++;
    this.comboTimer = 3;
    this.nearMisses++;
    const gain = 50 * this.combo;
    this.points += gain;
    this.setScore();
    sfx('nearMiss', { pitch: 1 + Math.min(1, this.combo * 0.08) });
    sparkle(this, (p.img.x + this.hero.x) / 2, (p.img.y + this.hero.y) / 2, 8, 0xffffff);
    popText(this, this.hero.x, this.hero.y - 70, `${t('dodge.nearmiss')} +${gain}`, '#7CF5E8', 30, { rise: 60, duration: 700 });
    this.comboText.setText(`🔥 combo ×${this.combo}`);
    this.tweens.add({ targets: this.comboText, scale: { from: 1.4, to: 1 }, duration: 200, ease: 'Back.out' });
  }

  private hit(p: Plane) {
    this.lives--;
    if (p.doc) this.hitBy.push(p.doc);
    this.invuln = 1.6;
    this.hero.setData('hurt', true);
    this.combo = 0;
    this.comboText.setText('');
    sfx('hit');
    hitStop(this, 90);
    this.cameras.main.shake(280, 0.016);
    flash(this, 0xff4d5e);
    burst(this, p.img.x, p.img.y, 'shred', { count: 24, speed: [200, 600], rotate: true, gravityY: 500, lifespan: 900, scale: [1.2, 0.6] });
    const heart = this.hearts[this.lives];
    if (heart) {
      heart.setTexture('heart-empty');
      this.tweens.add({ targets: heart, scale: { from: 1.6, to: 1 }, duration: 300 });
    }
    if (p.doc) popText(this, p.img.x, p.img.y - 50, `${p.doc.contact} · ${money(p.doc.pending, p.doc.currency, 0)}`, '#FF9AA6', 30);
    this.removePlane(p);
    if (this.lives <= 0) {
      this.hero.setTexture('pig-fly-hurt');
      this.tweens.add({ targets: this.hero, y: H + 200, angle: 540, duration: 1200, ease: 'Cubic.in' });
      this.finish(t('game.gameover'));
    }
  }

  private collectCoin(c: Phaser.GameObjects.Image) {
    this.removeCoin(c);
    sfx('paid');
    sparkle(this, c.x, c.y, 16);
    this.points += 150;
    this.setScore();
    // Pay the closest debt: it folds into confetti.
    let best: Plane | null = null;
    let bestD = Infinity;
    for (const p of this.planes) {
      const d = Phaser.Math.Distance.Between(p.img.x, p.img.y, this.hero.x, this.hero.y);
      if (!p.dead && d < bestD) [best, bestD] = [p, d];
    }
    if (best) {
      confetti(this, best.img.x, best.img.y, 40);
      shockwave(this, best.img.x, best.img.y, 0x7cf5a8, 2);
      popText(this, best.img.x, best.img.y - 40, '✅ ' + t('dodge.paid'), '#7CF5A8', 40);
      this.removePlane(best);
    } else popText(this, c.x, c.y - 40, '+150', '#FFE45C', 36);
  }

  private removePlane(p: Plane) {
    p.dead = true;
    p.img.destroy();
    p.label.destroy();
  }

  protected results(headline: string): ResultsData {
    const secs = Math.round(this.timeLeft * 10) / 10;
    const unique = [...new Map(this.hitBy.map((d) => [d.id, d])).values()].sort((a, b) => b.daysOverdue - a.daysOverdue || b.pending - a.pending);
    return {
      run: { game: 'dodge', score: secs, extra: { nearMisses: this.nearMisses } },
      scene: 'DebtDodge',
      headline,
      scoreLabel: t('game.time'),
      formatScore: (n) => `${n.toFixed(1)} s`,
      summary: `${t('dodge.result', { s: Math.floor(secs) })} · ${num(Math.round(this.points))} pts · ${this.nearMisses}× ${t('dodge.nearmiss')}`,
      listTitle: unique.length ? t('dodge.hitBy') : undefined,
      list: unique.map((d) => [`${d.contact} · ${d.number}`, `${money(d.pending, d.currency, 0)}${d.daysOverdue > 0 ? ` · ⚠ ${d.daysOverdue} d` : ''}`]),
    };
  }
}
