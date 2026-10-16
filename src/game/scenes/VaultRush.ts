import Phaser from 'phaser';
import { sfx } from '../../audio/sfx';
import type { Payment } from '../../data/types';
import { lang, money, num, t } from '../../i18n/i18n';
import { drawBackdrop } from '../backdrop';
import { burst, confetti, hitStop, popText, rectZone, shockwave, sparkle, zoomPunch } from '../fx';
import { state } from '../state';
import { W, text } from '../ui';
import { MiniGame } from './MiniGame';
import type { ResultsData } from './Results';

const GROUND = 930;
const CAPACITY = 6;
const DEPOSIT_X = 1500;
const GRAVITY = 1300;

type Kind = 'coin' | 'bills' | 'bag' | 'crate' | 'clock' | 'magnet';

interface Item {
  img: Phaser.GameObjects.Image;
  kind: Kind;
  vx: number;
  vy: number;
  spin: number;
  bounces: number;
  payment: Payment | null;
  value: number;
  /** First time this payment falls (counts as real euros); replays only score points. */
  real: boolean;
  dead: boolean;
}

/** Catch the money tumbling off Gold Mountain and wheel it into the safe. */
export class VaultRush extends MiniGame {
  protected readonly song = 'rush' as const;
  protected readonly roundSeconds = 60;
  protected helpKey = 'rush.help' as const;

  private player!: Phaser.GameObjects.Container;
  private pig!: Phaser.GameObjects.Image;
  private barrow!: Phaser.GameObjects.Image;
  private wheel!: Phaser.GameObjects.Image;
  private safeWheel!: Phaser.GameObjects.Image;
  private loadText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private items: Item[] = [];
  private cargo: Item[] = [];
  private pile: Phaser.GameObjects.Image[] = [];
  private secured = 0;
  private securedRaw = 0;
  private spawnedValue = 0;
  private multiplier = 1;
  private maxMultiplier = 1;
  private droppedSinceDeposit = false;
  private spawnIn = 0.6;
  private elapsedRound = 0;
  private magnetLeft = 0;
  private targetX: number | null = null;
  private vx = 0;
  private deck: Payment[] = [];
  private deckIndex = 0;
  private caught: Payment[] = [];
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;
  private depositing = false;
  private currency = 'EUR';

  constructor() {
    super('VaultRush');
  }

  protected scoreLabel() {
    return `⭐ ${num(Math.round((this.secured ?? 0) / 10))}`;
  }

  protected build() {
    const s = state.snapshot!;
    this.currency = s.currency;
    this.items = [];
    this.cargo = [];
    this.pile = [];
    this.secured = 0;
    this.securedRaw = 0;
    this.spawnedValue = 0;
    this.multiplier = 1;
    this.maxMultiplier = 1;
    this.droppedSinceDeposit = false;
    this.spawnIn = 0.6;
    this.elapsedRound = 0;
    this.magnetLeft = 0;
    this.targetX = null;
    this.vx = 0;
    this.caught = [];
    this.depositing = false;
    this.deck = Phaser.Utils.Array.Shuffle([...s.collected]);
    this.deckIndex = 0;

    drawBackdrop(this, { groundY: GROUND, seed: 4 });
    this.drawMountain();

    // The safe
    this.add.image(1745, GROUND + 18, 'glow').setTint(0xffd54a).setScale(2.2).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    const safe = this.add.image(1745, GROUND + 18, 'safe').setOrigin(0.5, 1).setDepth(2);
    this.safeWheel = this.add.image(1745, safe.y - safe.height / 2 - 8, 'safe-wheel').setDepth(3);
    const arrow = text(this, 1745, GROUND - 330, '⬇', 60, '#FFE45C', { strokeThickness: 8 }).setDepth(3);
    this.tweens.add({ targets: arrow, y: arrow.y + 20, duration: 450, yoyo: true, repeat: -1 });

    // Player: Pip pushing the wheelbarrow
    this.pig = this.add.image(-70, -12, 'pig');
    this.barrow = this.add.image(46, 6, 'barrow').setScale(1.05);
    this.wheel = this.add.image(84, 44, 'wheel');
    this.player = this.add.container(700, GROUND - 46, [this.pig, this.wheel, this.barrow]).setDepth(10);

    this.loadText = text(this, 0, 0, '', 26, '#FFFFFF', { strokeThickness: 5 }).setDepth(12);
    this.multText = text(this, W / 2, 150, '', 40, '#7CF5A8', { strokeThickness: 7, weight: 700 }).setDepth(901);

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ left: K.LEFT, right: K.RIGHT, a: K.A, d: K.D }) as typeof this.keys;
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => (this.targetX = p.x));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.targetX = p.x));
    this.updateLoad();
  }

  private drawMountain() {
    const g = this.add.graphics().setDepth(1);
    const bands = [0xf2b21b, 0xf7c431, 0xf2b21b, 0xf7c431, 0xffd54a];
    const peakX = 230;
    const baseL = -140;
    const baseR = 640;
    const peakY = 250;
    for (let i = 0; i < bands.length; i++) {
      const k0 = i / bands.length;
      const k1 = (i + 1) / bands.length;
      const y0 = GROUND - (GROUND - peakY) * k0;
      const y1 = GROUND - (GROUND - peakY) * k1;
      const l0 = baseL + (peakX - 60 - baseL) * k0;
      const r0 = baseR - (baseR - peakX - 60) * k0;
      const l1 = baseL + (peakX - 60 - baseL) * k1;
      const r1 = baseR - (baseR - peakX - 60) * k1;
      g.fillStyle(bands[i], 1);
      g.fillPoints([new Phaser.Math.Vector2(l0, y0), new Phaser.Math.Vector2(r0, y0), new Phaser.Math.Vector2(r1, y1), new Phaser.Math.Vector2(l1, y1)], true);
      g.fillStyle(0xffe680, 1);
      g.fillRect(l1, y1 - 4, r1 - l1, 8);
      for (let c = 0; c < 6; c++) {
        const x = l0 + 40 + Math.random() * (r0 - l0 - 80);
        const y = y1 + 16 + Math.random() * (y0 - y1 - 30);
        g.fillStyle(0xffe680, 1);
        g.fillCircle(x, y, 10);
        g.lineStyle(2.5, 0xb87a00, 1);
        g.strokeCircle(x, y, 10);
      }
    }
    this.add.image(peakX, peakY, 'flag-gold').setOrigin(0.1, 1).setDepth(2);
    this.add.image(peakX, peakY + 150, 'glow').setTint(0xffd54a).setScale(2).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(0);
    this.add
      .particles(0, 0, 'spark', {
        emitZone: rectZone(-60, peakY, 640, GROUND - peakY),
        lifespan: 800,
        frequency: 120,
        scale: { start: 0.6, end: 0 },
        tint: [0xffffff, 0xffd54a],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(2);
  }

  /** Real payments fall once; after that they come back as replays that only score points. */
  private nextPayment(): { p: Payment; real: boolean } | null {
    if (!this.deck.length) return null;
    const p = this.deck[this.deckIndex % this.deck.length];
    const real = this.deckIndex < this.deck.length;
    this.deckIndex++;
    return { p, real };
  }

  private spawn() {
    const r = Math.random();
    let kind: Kind;
    let payment: Payment | null = null;
    let value = 0;
    let real = false;
    if (r < 0.1 && this.elapsedRound > 4) kind = 'crate';
    else if (r < 0.15) kind = 'clock';
    else if (r < 0.19 && this.magnetLeft <= 0) kind = 'magnet';
    else {
      const next = this.nextPayment();
      payment = next?.p ?? null;
      real = !!next?.real;
      value = payment ? payment.amount : 50 + Math.round(Math.random() * 1500);
      kind = value < 500 ? 'coin' : value < 5000 ? 'bills' : 'bag';
      if (real) this.spawnedValue += value;
    }
    const key = kind === 'crate' ? `crate-${lang()}` : kind === 'bills' ? 'bills' : kind;
    const x = 80 + Math.random() * 380;
    const y = 300 + (Math.abs(x - 230) / 400) * 400;
    const img = this.add.image(x, y, key).setDepth(8);
    if (kind === 'bills') img.setScale(0.85);
    if (kind === 'coin') img.setScale(0.9 + Math.min(0.4, value / 1200));
    const difficulty = Math.min(1, this.elapsedRound / 50);
    this.items.push({
      img,
      kind,
      vx: 280 + Math.random() * (420 + 260 * difficulty),
      vy: -300 - Math.random() * 420,
      spin: (Math.random() - 0.5) * 8,
      bounces: 0,
      payment,
      value,
      real,
      dead: false,
    });
    sfx('whoosh', { volume: 0.25, pitch: 1.5 });
  }

  private trayRect() {
    const x = this.player.x + 46;
    const y = this.player.y - 18;
    return new Phaser.Geom.Rectangle(x - 78, y - 30, 156, 44);
  }

  protected tick(dt: number) {
    // Movement
    if (!this.over) {
      const left = this.keys.left.isDown || this.keys.a.isDown;
      const right = this.keys.right.isDown || this.keys.d.isDown;
      if (left || right) {
        this.targetX = null;
        this.vx = Phaser.Math.Linear(this.vx, (right ? 1 : -1) * 950, 0.18);
      } else if (this.targetX !== null) {
        const want = Phaser.Math.Clamp((this.targetX - (this.player.x + 46)) * 9, -1100, 1100);
        this.vx = Phaser.Math.Linear(this.vx, want, 0.25);
      } else this.vx = Phaser.Math.Linear(this.vx, 0, 0.2);
      if (!this.running) this.vx = 0;
      this.player.x = Phaser.Math.Clamp(this.player.x + this.vx * dt, 140, 1610);
      this.wheel.rotation += (this.vx * dt) / 22;
      this.barrow.setAngle(Math.sin(this.time.now / 90) * Math.min(4, Math.abs(this.vx) / 220) - this.vx / 200);
      this.pig.setTexture(Math.abs(this.vx) > 60 ? (Math.floor(this.time.now / 110) % 2 ? 'pig-walk1' : 'pig-walk2') : 'pig');
      this.pile.forEach((p, i) => p.setPosition(this.player.x + 20 + (i % 3) * 26 - this.vx / 60, this.player.y - 42 - Math.floor(i / 3) * 22 + Math.sin(this.time.now / 80 + i) * 2));
      this.loadText.setPosition(this.player.x + 46, this.player.y - 120).setText(this.cargo.length ? `${this.cargo.length}/${CAPACITY}` : '');
      this.loadText.setColor(this.cargo.length >= CAPACITY ? '#FF6B7D' : '#FFFFFF');
    }

    if (this.running) {
      this.elapsedRound += dt;
      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawn();
        const k = Math.min(1, this.elapsedRound / 50);
        this.spawnIn = Phaser.Math.Linear(0.95, 0.42, k) * (0.7 + Math.random() * 0.6);
      }
      if (this.magnetLeft > 0) this.magnetLeft -= dt;
      if (this.player.x >= DEPOSIT_X && this.cargo.length && !this.depositing) this.deposit();
    }

    const tray = this.trayRect();
    for (const it of this.items) {
      if (it.dead) continue;
      it.vy += GRAVITY * dt;
      if (this.magnetLeft > 0 && it.kind !== 'crate' && it.vy > 0) {
        const dx = tray.centerX - it.img.x;
        if (Math.abs(dx) < 380) it.vx = Phaser.Math.Linear(it.vx, dx * 3, 0.08);
      }
      it.img.x += it.vx * dt;
      it.img.y += it.vy * dt;
      it.img.rotation += it.spin * dt;

      if (it.vy > 0 && this.running && tray.contains(it.img.x, it.img.y)) {
        this.catchItem(it);
        continue;
      }
      const floor = GROUND - it.img.displayHeight / 2 + 6;
      if (it.img.y >= floor) {
        it.img.y = floor;
        it.bounces++;
        if (it.bounces === 1) {
          it.vy = -Math.abs(it.vy) * 0.35;
          it.vx *= 0.6;
          sfx('land', { volume: 0.3 });
          burst(this, it.img.x, GROUND, 'dot', { count: 4, tint: 0xe8d5b5, speed: [40, 120], angle: [200, 340], gravityY: 0, lifespan: 300 });
        } else this.dropItem(it);
      }
      if (it.img.x > W + 100) this.dropItem(it, true);
    }
    this.items = this.items.filter((i) => !i.dead);
  }

  private catchItem(it: Item) {
    if (it.kind === 'clock') {
      this.killItem(it);
      this.timeLeft += 5;
      sfx('powerup');
      popText(this, it.img.x, it.img.y - 30, t('rush.clock'), '#7CF5E8', 44);
      sparkle(this, it.img.x, it.img.y, 16, 0x7cf5e8);
      return;
    }
    if (it.kind === 'magnet') {
      this.killItem(it);
      this.magnetLeft = 8;
      sfx('powerup', { pitch: 1.3 });
      popText(this, it.img.x, it.img.y - 30, t('rush.magnet'), '#FF9AA6', 44);
      return;
    }
    if (it.kind === 'crate') {
      this.killItem(it);
      const lost = Math.round(this.cargo.length * 0.21 + 0.5);
      const removed = this.cargo.splice(0, Math.min(lost, this.cargo.length));
      removed.forEach((r) => (r.value *= 0));
      for (const p of this.pile.splice(0, removed.length)) {
        this.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 600, y: p.y - 300, alpha: 0, angle: 360, duration: 700, onComplete: () => p.destroy() });
      }
      this.cargo.forEach((l) => (l.value *= 0.79));
      sfx('iva');
      this.cameras.main.shake(260, 0.012);
      hitStop(this, 80);
      burst(this, it.img.x, it.img.y, 'shred', { count: 16, tint: [0xe0a96d, 0xb27740], speed: [200, 500], rotate: true });
      popText(this, it.img.x, it.img.y - 40, t('rush.iva'), '#FF6B7D', 52);
      this.updateLoad();
      return;
    }
    if (this.cargo.length >= CAPACITY) {
      it.vy = -520;
      it.vx = -120 + Math.random() * 240;
      sfx('full');
      popText(this, this.player.x + 46, this.player.y - 170, t('rush.full'), '#FFFFFF', 30, { rise: 40 });
      return;
    }
    it.dead = true;
    it.img.destroy();
    this.cargo.push(it);
    if (it.payment && it.real) this.caught.push(it.payment);
    const icon = this.add.image(0, 0, it.kind === 'bills' ? 'bill' : it.kind === 'bag' ? 'bag' : 'coin').setScale(it.kind === 'bag' ? 0.45 : 0.55).setDepth(11);
    this.pile.push(icon);
    sfx(it.kind === 'coin' ? 'coin' : 'coinBig', { pitch: 0.9 + this.cargo.length * 0.08 });
    sparkle(this, this.player.x + 46, this.player.y - 40, 8);
    this.tweens.add({ targets: this.barrow, scaleY: { from: 0.9, to: 1.05 }, duration: 160, ease: 'Back.out' });
    const who = it.payment ? ` · ${it.payment.contact}` : '';
    popText(this, this.player.x + 46, this.player.y - 150, `+${money(it.value, this.currency, 0)}${who}`, '#FFE45C', 28, { rise: 70, duration: 900 });
    this.updateLoad();
  }

  private killItem(it: Item) {
    it.dead = true;
    this.tweens.add({ targets: it.img, scale: 0, duration: 150, onComplete: () => it.img.destroy() });
  }

  private dropItem(it: Item, offscreen = false) {
    it.dead = true;
    const isMoney = it.kind === 'coin' || it.kind === 'bills' || it.kind === 'bag';
    if (isMoney && this.running) {
      this.droppedSinceDeposit = true;
      if (this.multiplier > 1) {
        popText(this, Math.min(W - 120, it.img.x), GROUND - 80, t('rush.dropped'), '#FF9AA6', 30, { rise: 50 });
        sfx('sad', { volume: 0.4 });
      }
      this.multiplier = 1;
      this.updateLoad();
    }
    if (offscreen) it.img.destroy();
    else this.tweens.add({ targets: it.img, alpha: 0, y: it.img.y + 10, duration: 500, onComplete: () => it.img.destroy() });
  }

  private deposit() {
    this.depositing = true;
    const items = this.cargo.splice(0);
    const icons = this.pile.splice(0);
    const raw = items.reduce((a, i) => a + i.value, 0);
    const realEuros = items.filter((i) => i.real).reduce((a, i) => a + i.value, 0);
    if (!this.droppedSinceDeposit) this.multiplier = Math.min(5, this.multiplier + (items.length >= 3 ? 1 : 0));
    const mult = Math.max(1, this.multiplier);
    const bonus = items.length >= CAPACITY ? 1.1 : 1;
    const gained = raw * mult * bonus;
    this.droppedSinceDeposit = false;
    this.maxMultiplier = Math.max(this.maxMultiplier, mult);
    const door = { x: this.safeWheel.x, y: this.safeWheel.y };
    icons.forEach((icon, i) => {
      this.tweens.add({
        targets: icon,
        x: door.x,
        y: door.y,
        scale: 0.2,
        angle: 540,
        duration: 380,
        delay: i * 70,
        ease: 'Cubic.in',
        onComplete: () => {
          icon.destroy();
          sfx('coin', { pitch: 1 + i * 0.12 });
          sparkle(this, door.x, door.y, 6);
        },
      });
    });
    this.time.delayedCall(icons.length * 70 + 400, () => {
      this.secured += gained;
      this.securedRaw += realEuros;
      this.setScore();
      sfx('deposit');
      shockwave(this, door.x, door.y, 0xffe45c, 3);
      burst(this, door.x, door.y, 'coin-sm', { count: 14 + icons.length * 3, speed: [300, 700], angle: [200, 340], gravityY: 1400, rotate: true, scale: [1, 0.7], lifespan: 1100 });
      zoomPunch(this, 0.03);
      this.cameras.main.shake(140, 0.004);
      this.tweens.add({ targets: this.safeWheel, angle: this.safeWheel.angle + 360, duration: 700, ease: 'Cubic.out' });
      popText(this, door.x - 300, door.y - 150, `+${money(raw, this.currency, 0)}${mult > 1 ? ` · ×${mult}` : ''}`, '#FFE45C', 50);
      if (bonus > 1) popText(this, door.x - 300, door.y - 210, '🔥 +10%', '#FF9F43', 36, { delay: 200 });
      if (mult >= 3) confetti(this, door.x, door.y - 100, 30);
      this.updateLoad();
      this.depositing = false;
    });
  }

  private updateLoad() {
    const m = this.multiplier;
    this.multText.setText(m > 1 ? `×${m}` : '');
    if (m > 1) this.tweens.add({ targets: this.multText, scale: { from: 1.5, to: 1 }, duration: 220, ease: 'Back.out' });
    this.multText.setColor(m >= 4 ? '#FF9F43' : m >= 3 ? '#FFE45C' : '#7CF5A8');
  }

  protected results(headline: string): ResultsData {
    const pct = this.spawnedValue > 0 ? Math.round((this.securedRaw / this.spawnedValue) * 100) : 0;
    const top = [...this.caught].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const cur = this.currency;
    return {
      run: { game: 'vault', score: Math.round(this.secured / 10), ratio: pct / 100, extra: { maxMultiplier: this.maxMultiplier, secured: this.securedRaw } },
      scene: 'VaultRush',
      headline,
      scoreLabel: t('game.score'),
      formatScore: (n) => `${num(Math.round(n))} pts`,
      summary: t('rush.result', { pct, amount: money(this.securedRaw, cur, 0) }),
      listTitle: top.length ? t('rush.biggest') : undefined,
      list: top.map((p) => [p.contact, money(p.amount, cur, 0)]),
    };
  }
}
