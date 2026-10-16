import Phaser from 'phaser';
import { goToTitle, prepareExtra, startMinigame, type MinigameKey } from '../../app';
import { music } from '../../audio/music';
import { sfx, unlockAudio } from '../../audio/sfx';
import {
  agingStrata,
  heightRatio,
  monthlyStrata,
  overdue,
  sum,
  totalCash,
  totalCollected,
  totalOwedByClients,
  totalOwedToSuppliers,
} from '../../data/aggregate';
import type { SnapshotDiff } from '../../data/diff';
import { short } from '../../data/labels';
import { mulberry32 } from '../../data/demoData';
import { daysToDeadline, relevantQuarter } from '../../data/vat';
import type { Doc, FinanceSnapshot, ResourceId, Stratum } from '../../data/types';
import { locale, money, moneyShort, t, type MessageKey } from '../../i18n/i18n';
import { openLedger } from '../../ui/ledger';
import { isModalOpen } from '../../ui/overlay';
import { openTrophies } from '../../ui/trophies';
import { planeKey } from '../art/textures';
import { birds, drawBackdrop } from '../backdrop';
import { confetti, pick, popText, rectZone, say, shockwave, sparkle } from '../fx';
import { Hero } from '../hero';
import { grant, setProgress, state, touchVisit } from '../state';
import { Button, ButtonGroup, H, W, panel, skyColors, text } from '../ui';

const WW = 6300;
const GY = 900;
const GOLD_X = 1100;
const GOLD_HALF = 900;
const BANK_X = 2700;
const DOCK_FROM = 3300;
const DOCK_TO = 4300;
const DEBT_X = 5300;
const DEBT_HALF = 650;

type ZoneId = 'gold' | 'vault' | 'harbor' | 'debt';

interface Trigger {
  id: ZoneId;
  x: number;
  y: number;
}

interface Layer {
  stratum: Stratum;
  top: number;
  left: number;
  right: number;
  mountain: 'gold' | 'debt';
  index: number;
  last: boolean;
}

interface BalloonView {
  doc: Doc;
  img: Phaser.GameObjects.Image;
  postX: number;
  label: Phaser.GameObjects.Text;
}

const ZONE_RESOURCE: Record<ZoneId, ResourceId> = { gold: 'payments', vault: 'treasury', harbor: 'invoices', debt: 'purchases' };

export class World extends Phaser.Scene {
  private snap!: FinanceSnapshot;
  private hero!: Hero;
  private solids: Phaser.GameObjects.Zone[] = [];
  private layers: Layer[] = [];
  private triggers: Trigger[] = [];
  private balloons: BalloonView[] = [];
  private strings!: Phaser.GameObjects.Graphics;
  private water!: Phaser.GameObjects.Graphics;
  private prompt!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private bubble!: Phaser.GameObjects.Container;
  private bubbleText!: Phaser.GameObjects.Text;
  private currentLayer: Layer | null = null;
  private nearTrigger: Trigger | null = null;
  private pendingOpen: ZoneId | null = null;
  private menu: Phaser.GameObjects.Container | null = null;
  private menuGroup: ButtonGroup | null = null;
  private cinematic = false;
  /** Set once Play is pressed so a second click (or Close) during the fade can't double-start. */
  private starting = false;
  private summitsCelebrated = new Set<string>();
  private keys!: Record<'left' | 'right' | 'up' | 'a' | 'd' | 'w' | 'space', Phaser.Input.Keyboard.Key>;
  private jumpQueued = false;
  private planes: { img: Phaser.GameObjects.Image; a: number; speed: number; rx: number; ry: number }[] = [];
  private arrows = new Map<ZoneId, Phaser.GameObjects.Text>();
  /** Pip's one-liners, each at most once per visit to the world. */
  private said = new Set<string>();
  private idleFor = 0;
  private captionBox: Phaser.GameObjects.Container | null = null;
  private touch = { left: false, right: false, jump: false };
  private touchEnter: { box: Phaser.GameObjects.Container; zone: Phaser.GameObjects.Zone } | null = null;
  private summitY = { gold: GY, debt: GY };

  constructor() {
    super({ key: 'World' });
  }

  create() {
    if (!state.snapshot) {
      goToTitle();
      return;
    }
    this.snap = state.snapshot;
    this.solids = [];
    this.layers = [];
    this.triggers = [];
    this.balloons = [];
    this.planes = [];
    this.menu = null;
    this.currentLayer = null;
    this.nearTrigger = null;
    this.jumpQueued = false;
    this.pendingOpen = null;
    this.cinematic = false;
    this.starting = false;
    this.summitsCelebrated = new Set();
    this.arrows = new Map();
    this.said = new Set();
    this.idleFor = 0;
    this.captionBox = null;
    this.touch = { left: false, right: false, jump: false };
    this.touchEnter = null;

    this.physics.world.setBounds(0, 0, WW, H);
    this.cameras.main.setBounds(0, 0, WW, H);
    drawBackdrop(this, { width: WW, groundY: GY, seed: 11 });
    birds(this, WW);
    this.decorate();

    const ground = this.add.zone(WW / 2, GY + 90, WW + 200, 180);
    this.physics.add.existing(ground, true);
    this.solids.push(ground);

    this.buildGoldMountain();
    this.buildBank();
    this.buildHarbor();
    this.buildDebtPeak();

    this.hero = new Hero(this, 2330, GY - 80);
    this.physics.add.collider(this.hero.sprite, this.solids);
    this.cameras.main.startFollow(this.hero.sprite, true, 0.09, 0.09, 0, 120);
    this.cameras.main.fadeIn(500, 18, 12, 38);

    this.buildPrompt();
    this.buildBubble();
    this.setupInput();
    if (this.sys.game.device.input.touch) this.buildTouchControls();

    music.play('world');
    // After the HUD (started right after this scene) is listening for achievement toasts.
    this.time.delayedCall(1200, touchVisit);

    const diff = state.takeDiff();
    if (!state.progress.guideDone) this.time.delayedCall(800, () => this.playTour());
    else if (diff) this.time.delayedCall(900, () => this.playSinceLastVisit(diff));
    else if (!state.welcomed) {
      this.time.delayedCall(700, () => this.banner(t('world.welcome', { company: this.snap.companyName }), []));
    }
    state.welcomed = true;

    this.events.once('shutdown', () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
    });
  }

  // ------------------------------------------------------------------ scenery

  private decorate() {
    const rnd = mulberry32(3);
    const spots = [150, 2200, 2470, 3120, 3200, 4430, 4500, 6100, 6220];
    for (const x of spots) {
      const tree = this.add.image(x + rnd() * 30, GY + 8, rnd() < 0.5 ? 'tree' : 'pine').setOrigin(0.5, 1).setScale(0.8 + rnd() * 0.5).setDepth(-6);
      this.tweens.add({ targets: tree, angle: { from: -1.2, to: 1.2 }, duration: 2200 + rnd() * 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    for (let x = 60; x < WW; x += 260 + rnd() * 380) {
      if (x > DOCK_FROM - 60 && x < DOCK_TO + 60) continue;
      this.add.image(x, GY + 12, 'bush').setOrigin(0.5, 1).setScale(0.6 + rnd() * 0.5).setDepth(-5);
    }
    // Foreground grass tufts for depth
    const fg = this.add.graphics().setDepth(80).setScrollFactor(1.12);
    fg.fillStyle(0x2f8f3e, 1);
    for (let x = 0; x < WW * 1.15; x += 150 + rnd() * 240) {
      if (x / 1.12 > DOCK_FROM - 80 && x / 1.12 < DOCK_TO + 80) continue;
      for (let i = 0; i < 5; i++) fg.fillTriangle(x + i * 8, H, x + i * 8 + 5, H - 40 - rnd() * 40, x + i * 8 + 10, H);
    }
  }

  private sign(x: number, title: string, sub: string, id: ZoneId, locked = false) {
    const c = this.add.container(x, GY + 12).setDepth(-4);
    const board = this.add.image(0, 0, 'sign').setOrigin(0.5, 1);
    const tt = text(this, 0, -64, title, 26, '#FFF8EC', { strokeThickness: 5, weight: 700 });
    const st = text(this, 0, -36, sub, 18, '#FFE6A8', { strokeThickness: 4 });
    c.add([board, tt, st]);
    if (locked) c.add(this.add.image(96, -90, 'lock').setScale(0.6));
    board.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.walkAndOpen(id, x));
    this.triggers.push({ id, x, y: GY - 120 });
    this.addArrow(id, x, GY - 200);
    return c;
  }

  /** Bouncing arrow over zones the player has never entered. */
  private addArrow(id: ZoneId, x: number, y: number) {
    if (state.progress.enteredZones.includes(id)) return;
    const a = text(this, x, y, '▼', 44, '#FFE45C', { strokeThickness: 7 }).setDepth(70);
    this.tweens.add({ targets: a, y: y + 22, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.arrows.set(id, a);
  }

  private markEntered(id: ZoneId) {
    const arrow = this.arrows.get(id);
    if (arrow) {
      this.arrows.delete(id);
      this.tweens.killTweensOf(arrow);
      this.tweens.add({ targets: arrow, scale: 1.8, alpha: 0, duration: 260, onComplete: () => arrow.destroy() });
    }
    if (!state.progress.enteredZones.includes(id)) setProgress({ ...state.progress, enteredZones: [...state.progress.enteredZones, id] });
  }

  private walkAndOpen(id: ZoneId, x: number) {
    if (this.menu || this.cinematic) return;
    unlockAudio();
    if (Math.abs(this.hero.sprite.x - x) < 60 && this.hero.onGround) {
      this.openZoneMenu(id);
      return;
    }
    this.hero.target = x;
    this.pendingOpen = id;
  }

  private isLocked(id: ZoneId) {
    if (id === 'gold') return this.snap.locked.includes('payments') && !this.snap.collectedEstimated;
    return this.snap.locked.includes(ZONE_RESOURCE[id]);
  }

  // ------------------------------------------------------------------ mountains

  private buildMountain(
    kind: 'gold' | 'debt',
    cx: number,
    strata: Stratum[],
    totalHeight: number,
    baseHalf: number,
    topHalf: number,
  ): number {
    const n = strata.length;
    const minT = kind === 'gold' ? 26 : 44;
    const maxT = kind === 'gold' ? 150 : 175;
    const total = sum(strata, (s) => s.total);
    // Every stratum gets a climbable minimum; the rest of the height is shared by amount.
    const flexible = Math.max(0, totalHeight - n * minT);
    const th = strata.map((s) => Math.min(maxT, minT + (total > 0 ? (flexible * s.total) / total : 0)));

    const g = this.add.graphics().setDepth(-3);
    const deco = this.add.graphics().setDepth(-2);
    const rnd = mulberry32(kind === 'gold' ? 5 : 9);
    let y = GY;
    let prevHalf = baseHalf + 40;
    strata.forEach((st, i) => {
      const half = n > 1 ? baseHalf - ((baseHalf - topHalf) * i) / (n - 1) : baseHalf;
      const h = th[i];
      const top = y - h;
      const flare = Math.min(22, (prevHalf - half) * 0.35);
      const body = this.add.zone(cx, top + h / 2, half * 2, h);
      this.physics.add.existing(body, true);
      this.solids.push(body);

      const colors = kind === 'gold' ? goldColors(i) : debtColors(st.key);
      // Slab
      g.fillStyle(colors.face, 1);
      g.fillPoints(
        [
          new Phaser.Math.Vector2(cx - half, top),
          new Phaser.Math.Vector2(cx + half, top),
          new Phaser.Math.Vector2(cx + half + flare, y),
          new Phaser.Math.Vector2(cx - half - flare, y),
        ],
        true,
      );
      g.fillStyle(colors.shade, 1);
      g.fillRect(cx - half - flare * 0.8, y - Math.min(10, h * 0.25), (half + flare * 0.8) * 2, Math.min(10, h * 0.25));
      g.fillStyle(colors.top, 1);
      g.fillRoundedRect(cx - half - 4, top - 4, half * 2 + 8, 12, 6);

      if (kind === 'gold') {
        // Embedded coins catch the light
        const coins = Math.round((half * 2) / 120);
        for (let c = 0; c < coins; c++) {
          const x = cx - half + 40 + rnd() * (half * 2 - 80);
          const cy = top + 14 + rnd() * Math.max(1, h - 28);
          if (h > 28) {
            deco.fillStyle(0xffe680, 1);
            deco.fillCircle(x, cy, 9);
            deco.lineStyle(2.5, 0xb87a00, 1);
            deco.strokeCircle(x, cy, 9);
          }
        }
      } else {
        // Cracks
        deco.lineStyle(3, colors.shade, 0.9);
        for (let c = 0; c < Math.round(half / 90); c++) {
          let x = cx - half + 30 + rnd() * (half * 2 - 60);
          let yy = top + 10;
          deco.beginPath();
          deco.moveTo(x, yy);
          while (yy < y - 12) {
            x += (rnd() - 0.5) * 24;
            yy += 10 + rnd() * 14;
            deco.lineTo(x, Math.min(yy, y - 8));
          }
          deco.strokePath();
        }
      }
      if (h >= 30) {
        text(this, cx - half + 18, top + h / 2 + 2, st.label, Math.min(22, h * 0.5), kind === 'gold' ? '#7A4E00' : '#FFFFFF', {
          stroke: null,
          shadow: false,
          origin: [0, 0.5],
          weight: 600,
        })
          .setAlpha(kind === 'gold' ? 0.7 : 0.85)
          .setDepth(-1);
      }
      this.layers.push({ stratum: st, top, left: cx - half, right: cx + half, mountain: kind, index: i, last: i === n - 1 });
      prevHalf = half;
      y = top;
    });
    return y;
  }

  private buildGoldMountain() {
    const s = this.snap;
    const collected = totalCollected(s);
    const maxV = Math.max(collected, totalOwedToSuppliers(s), 1);
    const strata = monthlyStrata(s.collected, s.period, locale());
    // Capped so the summit and its labels stay below the HUD.
    const height = Math.max(strata.length * 26 + 40, 200 + 230 * heightRatio(collected, maxV));
    const top = this.buildMountain('gold', GOLD_X, strata, height, GOLD_HALF, 120);
    this.summitY.gold = top;

    // Sparkles drifting over the gold
    this.add
      .particles(0, 0, 'spark', {
        emitZone: rectZone(GOLD_X - GOLD_HALF + 80, top, GOLD_HALF * 2 - 160, GY - top),
        lifespan: 900,
        frequency: 140,
        scale: { start: 0.6, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffffff, 0xfff3b0, 0xffd54a],
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(-1);
    const flag = this.add.image(GOLD_X, top + 4, 'flag-gold').setOrigin(0.1, 1).setDepth(-1);
    this.tweens.add({ targets: flag, scaleX: 0.92, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.image(GOLD_X + 20, top - 60, 'glow').setTint(0xffd54a).setAlpha(0.55).setScale(1.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(-4);
    const label = text(this, GOLD_X, top - 290, this.isLocked('gold') ? t('zone.locked.short') : money(collected, s.currency, 0), 54, '#FFE45C', { strokeThickness: 9, weight: 700 }).setDepth(-1);
    text(this, GOLD_X, top - 242, t('zone.gold') + (s.collectedEstimated ? ` (${t('stat.estimated')})` : ''), 28, '#FFFFFF', { strokeThickness: 6 }).setDepth(-1);
    this.tweens.add({ targets: label, y: label.y - 10, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.sign(GOLD_X + GOLD_HALF + 110, t('zone.gold'), t('stat.payments', { n: s.collected.length }), 'gold', this.isLocked('gold'));
  }

  private buildDebtPeak() {
    const s = this.snap;
    const owed = totalOwedToSuppliers(s);
    const maxV = Math.max(totalCollected(s), owed, 1);
    const strata = agingStrata(s.owedToSuppliers, (k) => t(`aging.${k}` as MessageKey));
    const height = Math.max(250, 200 + 200 * heightRatio(owed, maxV));
    const top = this.buildMountain('debt', DEBT_X, strata, height, DEBT_HALF, 120);
    this.summitY.debt = top;
    const locked = this.isLocked('debt');

    // Storm cloud and lightning over the peak
    const storm = this.add.image(DEBT_X, top - 190, 'storm').setScale(1.4).setDepth(-2).setAlpha(owed > 0 ? 1 : 0.4);
    this.tweens.add({ targets: storm, x: DEBT_X + 40, duration: 4000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const rain = this.add.particles(0, 0, 'dot', {
      emitZone: rectZone(DEBT_X - 170, top - 160, 340, 20),
      lifespan: 700,
      speedY: { min: 600, max: 800 },
      scaleX: 0.08,
      scaleY: 0.5,
      alpha: 0.5,
      tint: 0xb9c6e0,
      frequency: owed > 0 ? 40 : -1,
    });
    rain.setDepth(-2);
    const od = overdue(s.owedToSuppliers);
    if (od.length) {
      this.time.addEvent({
        delay: 3800,
        loop: true,
        callback: () => {
          const bolt = this.add.image(DEBT_X - 80 + Math.random() * 160, top - 100, 'bolt').setDepth(-2).setScale(1.3);
          this.tweens.add({ targets: bolt, alpha: { from: 1, to: 0 }, duration: 380, onComplete: () => bolt.destroy() });
          storm.setTint(0xffffff);
          this.time.delayedCall(90, () => storm.clearTint());
        },
      });
    }

    // Paper airplanes circling the summit: one per bill (capped), red when overdue
    const docs = [...s.owedToSuppliers].slice(0, 10);
    docs.forEach((d, i) => {
      const img = this.add.image(DEBT_X, top - 120, planeKey(d.daysToDue)).setDepth(-1).setScale(0.55 + 0.3 * Math.min(1, d.pending / Math.max(1, docs[0]?.pending ?? 1)));
      this.planes.push({ img, a: (i / docs.length) * Math.PI * 2, speed: 0.5 + (d.daysOverdue > 0 ? 0.35 : 0) + Math.random() * 0.2, rx: 260 + (i % 3) * 60, ry: 70 + (i % 2) * 30 });
    });

    const flag = this.add.image(DEBT_X, top + 4, 'flag-red').setOrigin(0.1, 1).setDepth(-1);
    this.tweens.add({ targets: flag, scaleX: 0.9, duration: 300, yoyo: true, repeat: -1 });
    const odAmount = sum(od, (d) => d.pending);
    const label = text(this, DEBT_X, top - 300, locked ? t('zone.locked.short') : owed > 0 ? money(owed, s.currency, 0) : t('world.noDebts'), 54, owed > 0 ? '#FF8A9A' : '#7CF5A8', {
      strokeThickness: 9,
      weight: 700,
    }).setDepth(-1);
    if (odAmount > 0) text(this, DEBT_X, top - 252, `⚠ ${money(odAmount, s.currency, 0)} ${t('stat.overdue')}`, 28, '#FFD0D6', { strokeThickness: 6 }).setDepth(-1);
    this.tweens.add({ targets: label, y: label.y - 8, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.sign(DEBT_X - DEBT_HALF - 110, t('zone.debt'), t('stat.docs', { n: s.owedToSuppliers.length }), 'debt', locked);
    this.vatReminder(DEBT_X - DEBT_HALF - 110, GY - 270);
  }

  /** A pulsing sign when the quarter's VAT return (model 303) is due within ten days. */
  private vatReminder(x: number, y: number) {
    if (this.snap.locked.includes('invoices')) return;
    const q = relevantQuarter(this.snap.today);
    const n = daysToDeadline(q, this.snap.today);
    if (!q.closed || n < 0 || n > 10) return;
    const label = n === 0 ? t('world.vatToday', { q: q.quarter }) : t('world.vatSoon', { q: q.quarter, n });
    const sign = text(this, x, y, label, 26, '#FFFFFF', { strokeThickness: 0, stroke: null, weight: 700 }).setDepth(-1);
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0xd02e45, 1);
    bg.fillRoundedRect(x - sign.width / 2 - 18, y - 28, sign.width + 36, 56, 20);
    this.tweens.add({ targets: [sign, bg], alpha: 0.55, duration: 600, yoyo: true, repeat: -1 });
  }

  // ------------------------------------------------------------------ bank

  private buildBank() {
    const s = this.snap;
    const night = skyColors().night;
    const bank = this.add.image(BANK_X, GY + 14, 'bank').setOrigin(0.5, 1).setDepth(-4);
    bank.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.walkAndOpen('vault', BANK_X));
    if (night) {
      for (const dx of [-170, 170]) {
        this.add.image(BANK_X + dx, GY - 160, 'glow').setTint(0xffd27a).setAlpha(0.6).setScale(0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(-3);
      }
    }
    const emblem = this.add.image(BANK_X, GY + 14 - 440 + 78, 'glow').setTint(0xffd54a).setScale(0.6).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(-3);
    this.tweens.add({ targets: emblem, alpha: 0.2, scale: 0.8, duration: 1200, yoyo: true, repeat: -1 });
    const cash = totalCash(s);
    const label = text(this, BANK_X, GY - 500, cash === null ? t('zone.locked.short') : money(cash, s.currency, 0), 50, '#FFFFFF', { strokeThickness: 9, weight: 700 }).setDepth(-1);
    text(this, BANK_X, GY - 452, t('zone.vault'), 28, '#FFE45C', { strokeThickness: 6 }).setDepth(-1);
    this.tweens.add({ targets: label, y: label.y - 8, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.triggers.push({ id: 'vault', x: BANK_X, y: GY - 120 });
    this.addArrow('vault', BANK_X, GY - 300);
    if (cash === null) this.add.image(BANK_X + label.width / 2 + 40, GY - 500, 'lock').setScale(0.6).setDepth(-1);
  }

  // ------------------------------------------------------------------ harbor

  private buildHarbor() {
    const s = this.snap;
    this.water = this.add.graphics().setDepth(-9);
    const dock = this.add.graphics().setDepth(-7);
    dock.fillStyle(0x8b5e3c, 1);
    dock.fillRect(DOCK_FROM - 30, GY - 6, DOCK_TO - DOCK_FROM + 60, 22);
    dock.fillStyle(0xa8754a, 1);
    dock.fillRect(DOCK_FROM - 30, GY - 6, DOCK_TO - DOCK_FROM + 60, 8);
    dock.lineStyle(2, 0x5e3b1f, 0.8);
    for (let x = DOCK_FROM - 30; x < DOCK_TO + 30; x += 46) dock.lineBetween(x, GY - 6, x, GY + 16);
    const posts: number[] = [];
    for (let x = DOCK_FROM + 30; x <= DOCK_TO - 30; x += 110) {
      this.add.image(x, GY - 26, 'post').setOrigin(0.5, 0).setDepth(-8);
      posts.push(x);
    }

    this.strings = this.add.graphics().setDepth(-6);
    const locked = this.isLocked('harbor');
    const docs = [...s.owedByClients].sort((a, b) => b.pending - a.pending).slice(0, posts.length);
    const maxPending = Math.max(1, ...docs.map((d) => d.pending));
    const rnd = mulberry32(21);
    const order = posts.map((p, i) => ({ p, k: rnd() + i * 0.0001 })).sort((a, b) => a.k - b.k).map((x) => x.p);
    docs.forEach((d, i) => {
      const postX = order[i];
      const colors = ['blue', 'green', 'purple'];
      const key = d.daysOverdue > 30 ? 'balloon-red' : d.daysOverdue > 0 ? 'balloon-orange' : `balloon-${colors[i % 3]}`;
      const scale = 0.75 + 0.75 * Math.sqrt(d.pending / maxPending);
      const baseY = 470 + rnd() * 260 - (d.daysOverdue > 0 ? 60 : 0);
      const img = this.add.image(postX + (rnd() - 0.5) * 40, baseY, key).setScale(scale).setDepth(-5);
      this.tweens.add({
        targets: img,
        x: img.x + (d.daysOverdue > 0 ? 34 : 18),
        y: baseY - (d.daysOverdue > 0 ? 26 : 12),
        angle: { from: -4, to: 4 },
        duration: 1400 + rnd() * 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      const label = text(this, img.x, baseY - 70 * scale, `${short(d.contact, 22)}\n${money(d.pending, d.currency, 0)}${d.daysOverdue > 0 ? ` · ⚠ ${d.daysOverdue} d` : ''}`, 22, d.daysOverdue > 0 ? '#FFD0D6' : '#FFFFFF', {
        strokeThickness: 5,
      })
        .setDepth(60)
        .setAlpha(0);
      img.setInteractive({ useHandCursor: true });
      img.on('pointerover', () => img.setData('hover', true));
      img.on('pointerout', () => img.setData('hover', false));
      img.on('pointerdown', () => {
        sfx('pop', { pitch: 1.4 });
        this.tweens.add({ targets: img, scale: scale * 1.15, duration: 90, yoyo: true });
      });
      this.balloons.push({ doc: d, img, postX, label });
    });

    const owed = totalOwedByClients(s);
    const label = text(this, (DOCK_FROM + DOCK_TO) / 2, 300, locked ? t('zone.locked.short') : money(owed, s.currency, 0), 52, '#9CF6EA', { strokeThickness: 9, weight: 700 }).setDepth(-1);
    text(this, (DOCK_FROM + DOCK_TO) / 2, 348, t('zone.harbor'), 28, '#FFFFFF', { strokeThickness: 6 }).setDepth(-1);
    this.tweens.add({ targets: label, y: 290, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.image(DOCK_TO - 70, GY - 6, 'register').setOrigin(0.5, 1).setScale(0.8).setDepth(-6);
    this.sign(DOCK_FROM - 110, t('zone.harbor'), t('stat.docs', { n: s.owedByClients.length }), 'harbor', locked);
  }

  private drawWater(time: number) {
    const g = this.water;
    g.clear();
    g.fillStyle(0x2f86c9, 1);
    g.fillRect(DOCK_FROM - 60, GY + 6, DOCK_TO - DOCK_FROM + 120, H - GY);
    g.fillStyle(0x56b4f0, 1);
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(DOCK_FROM - 60, H)];
    for (let x = DOCK_FROM - 60; x <= DOCK_TO + 60; x += 20) {
      pts.push(new Phaser.Math.Vector2(x, GY + 24 + Math.sin(x / 50 + time / 400) * 6));
    }
    pts.push(new Phaser.Math.Vector2(DOCK_TO + 60, H));
    g.fillPoints(pts, true);
    g.fillStyle(0xffffff, 0.25);
    for (let x = DOCK_FROM - 40; x <= DOCK_TO + 40; x += 90) g.fillEllipse(x + Math.sin(time / 700 + x) * 20, GY + 60 + (x % 3) * 30, 40, 5);
  }

  // ------------------------------------------------------------------ prompts & bubbles

  private buildPrompt() {
    const bg = this.add.graphics();
    this.promptText = text(this, 0, 0, '', 26, '#2B1B3D', { stroke: null, shadow: false, weight: 700 });
    this.prompt = this.add.container(0, 0, [bg, this.promptText]).setDepth(90).setVisible(false);
    this.prompt.setData('bg', bg);
  }

  private showPrompt(x: number, y: number, label: string) {
    const bg = this.prompt.getData('bg') as Phaser.GameObjects.Graphics;
    if (this.promptText.text !== label) {
      this.promptText.setText(label);
      const w = this.promptText.width + 40;
      bg.clear();
      bg.fillStyle(0x1b1030, 0.3);
      bg.fillRoundedRect(-w / 2, -24, w, 56, 28);
      bg.fillStyle(0xffffff, 1);
      bg.fillRoundedRect(-w / 2, -28, w, 54, 27);
      bg.fillTriangle(-10, 24, 10, 24, 0, 38);
    }
    if (!this.prompt.visible) {
      this.prompt.setVisible(true).setScale(0.4);
      this.tweens.add({ targets: this.prompt, scale: 1, duration: 220, ease: 'Back.out' });
    }
    this.prompt.setPosition(x, y + Math.sin(this.time.now / 220) * 5);
  }

  private buildBubble() {
    const bg = this.add.graphics();
    this.bubbleText = text(this, 0, 0, '', 24, '#FFFFFF', { strokeThickness: 0, stroke: null, weight: 600 });
    this.bubble = this.add.container(0, 0, [bg, this.bubbleText]).setDepth(95).setAlpha(0);
    this.bubble.setData('bg', bg);
  }

  private showBubble(layer: Layer | null) {
    if (layer === this.currentLayer) return;
    this.currentLayer = layer;
    if (!layer) {
      this.tweens.add({ targets: this.bubble, alpha: 0, duration: 150 });
      return;
    }
    const s = this.snap;
    const st = layer.stratum;
    const countLabel = layer.mountain === 'gold' ? t('stat.payments', { n: st.count }) : t('stat.docs', { n: st.count });
    this.bubbleText.setText(`${st.label}\n${money(st.total, s.currency, 0)} · ${countLabel}`);
    const w = this.bubbleText.width + 44;
    const h = this.bubbleText.height + 22;
    const bg = this.bubble.getData('bg') as Phaser.GameObjects.Graphics;
    const color = layer.mountain === 'gold' ? 0x8a5a00 : st.tone === 'danger' ? 0x8c1027 : st.tone === 'warn' ? 0x8a4b12 : 0x2f3b63;
    bg.clear();
    bg.fillStyle(color, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    bg.lineStyle(3, 0xffffff, 0.5);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    this.bubble.setScale(0.6);
    this.tweens.add({ targets: this.bubble, alpha: 1, scale: 1, duration: 200, ease: 'Back.out' });
    sfx('hover', { pitch: 0.8 + layer.index * 0.06 });
    if (layer.last) this.celebrateSummit(layer);
    else if (layer.stratum.key === 'd90plus' && layer.stratum.count > 0) this.pipSay('beard', t('pip.beard'));
  }

  private celebrateSummit(layer: Layer) {
    if (this.summitsCelebrated.has(layer.mountain)) return;
    this.summitsCelebrated.add(layer.mountain);
    const x = this.hero.sprite.x;
    const y = layer.top - 40;
    sfx('fanfare');
    confetti(this, x, y - 40, 60);
    shockwave(this, x, y, 0xffe45c, 3);
    this.hero.setMood('pig-happy', 1500);
    const total = sum(this.layers.filter((l) => l.mountain === layer.mountain), (l) => l.stratum.total);
    popText(this, x, y - 140, t('world.summit', { amount: money(total, this.snap.currency, 0) }), '#FFE45C', 46);
    const noDebts = layer.mountain === 'debt' && !this.snap.owedToSuppliers.length && !this.isLocked('debt');
    this.time.delayedCall(1700, () =>
      this.pipSay(layer.mountain + 'Top', layer.mountain === 'gold' ? pick([t('pip.goldTop.1'), t('pip.goldTop.2')]) : noDebts ? t('pip.noDebts') : t('pip.debtTop')),
    );
    grant([layer.mountain === 'gold' ? 'climber' : 'brave']);
  }

  /** Pip comments on what's around: at most once per line per visit, never during menus or tours. */
  private pipSay(id: string, line: string) {
    if (this.said.has(id) || this.menu || this.cinematic) return;
    this.said.add(id);
    // Beside Pip's head, so it never covers the stratum bubble or the summit labels above.
    say(this, this.hero.sprite, line, { dx: 250, dy: -70, depth: 96, size: 24 });
  }

  // ------------------------------------------------------------------ input

  private setupInput() {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      left: K.LEFT,
      right: K.RIGHT,
      up: K.UP,
      a: K.A,
      d: K.D,
      w: K.W,
      space: K.SPACE,
    }) as typeof this.keys;
    // Discrete actions use key events so even very short taps are never missed.
    const free = () => !this.menu && !this.cinematic && !isModalOpen();
    for (const k of ['SPACE', 'UP', 'W']) kb.on(`keydown-${k}`, () => free() && (this.jumpQueued = true));
    const interact = () => {
      if (free() && this.nearTrigger) this.openZoneMenu(this.nearTrigger.id);
    };
    kb.on('keydown-E', interact);
    kb.on('keydown-ENTER', interact);
    kb.on('keydown-L', () => free() && openLedger('collected'));
    kb.on('keydown-M', () => this.events.emit('toggle-mute'));
    kb.on('keydown-ESC', () => {
      if (this.menu) this.closeZoneMenu();
      else if (free()) {
        this.scene.launch('Pause', { from: 'World' });
        this.scene.pause();
      }
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      unlockAudio();
      if (this.menu || this.cinematic || over.length) return;
      this.pendingOpen = null;
      this.hero.target = Phaser.Math.Clamp(p.worldX, 40, WW - 40);
      const marker = this.add.image(this.hero.target, Math.min(p.worldY, GY), 'ring').setScale(0.1).setDepth(40).setTint(0xffffff);
      this.tweens.add({ targets: marker, scale: 0.45, alpha: 0, duration: 380, onComplete: () => marker.destroy() });
    });
  }

  // ------------------------------------------------------------------ zone menu

  private openZoneMenu(id: ZoneId) {
    if (this.menu) return;
    this.pendingOpen = null;
    this.hero.target = null;
    this.hero.frozen = true;
    const s = this.snap;
    const locked = this.isLocked(id);
    const cx = W / 2;
    const cy = H / 2;
    const dim = this.add.rectangle(cx, cy, W, H, 0x0d0820, 0.55).setInteractive();
    // The vault and the debt peak offer two games plus the ledger, so their menu is wider.
    const pw = id === 'vault' || id === 'debt' ? 1060 : 860;
    const ph = 600;
    const bg = panel(this, cx, cy, pw, ph);
    const title = text(this, cx, cy - 230, t(`zone.${id}` as MessageKey), 56, '#FFE45C', { strokeThickness: 9, weight: 700 });
    const sub = text(this, cx, cy - 175, t(`zone.${id}.sub` as MessageKey), 28, '#CFC7EF', { stroke: null });

    let value = '';
    let detail = '';
    if (id === 'gold') {
      value = money(totalCollected(s), s.currency, 0);
      detail = t('stat.payments', { n: s.collected.length });
    } else if (id === 'vault') {
      const cash = totalCash(s);
      value = cash === null ? '🔒' : money(cash, s.currency, 0);
      detail = s.accounts ? s.accounts.map((a) => `${a.name}: ${moneyShort(a.balance, a.currency)}`).slice(0, 3).join('  ·  ') : t('trophy.noBank');
    } else if (id === 'harbor') {
      const od = overdue(s.owedByClients);
      value = money(totalOwedByClients(s), s.currency, 0);
      detail = `${t('stat.docs', { n: s.owedByClients.length })} · ⚠ ${moneyShort(sum(od, (d) => d.pending), s.currency)} ${t('stat.overdue')}`;
    } else {
      const od = overdue(s.owedToSuppliers);
      value = money(totalOwedToSuppliers(s), s.currency, 0);
      detail = `${t('stat.docs', { n: s.owedToSuppliers.length })} · ⚠ ${moneyShort(sum(od, (d) => d.pending), s.currency)} ${t('stat.overdue')}`;
    }
    const valueText = text(this, cx, cy - 95, locked ? '🔒' : value, 72, '#FFFFFF', { strokeThickness: 10, weight: 700 });
    const detailText = text(this, cx, cy - 30, locked ? t('zone.locked', { what: t(`res.${ZONE_RESOURCE[id]}` as MessageKey) }) : detail, 24, '#CFC7EF', {
      stroke: null,
      wrap: pw - 100,
    });
    const gameDesc = text(this, cx, cy + 30, t(`zone.game.${id}.desc` as MessageKey), 24, '#9A90C4', { stroke: null, wrap: pw - 120 });

    const close = () => this.closeZoneMenu();
    const launch = (key: MinigameKey, extra?: 'river' | 'boss') => async () => {
      if (this.starting) return;
      this.starting = true;
      // The river and the boss need extra data, fetched only now (and cached) to spare API quota.
      if (extra && !(await prepareExtra(extra))) {
        this.starting = false;
        return;
      }
      this.cameras.main.fadeOut(300, 18, 12, 38);
      this.time.delayedCall(300, () => startMinigame(key));
    };
    const ledgerTab = id === 'gold' ? 'collected' : id === 'harbor' ? 'receivables' : id === 'debt' ? 'payables' : 'bank';
    const explore = { label: '📒 ' + t('zone.explore'), color: 0x2ec4b6, run: () => (close(), openLedger(ledgerTab)), enabled: true };
    const gold = (label: string, run: () => void, enabled = true) => ({ label, color: 0xf5b700, dark: true, run, enabled });
    const actions: { label: string; color: number; dark?: boolean; run: () => void; enabled: boolean }[] =
      id === 'gold'
        ? [gold('▶ ' + t('zone.game.gold'), launch('VaultRush'), !locked), explore]
        : id === 'harbor'
          ? [gold('▶ ' + t('zone.game.harbor'), launch('BalloonCatch'), !locked), explore]
          : id === 'debt'
            ? [
                gold('▶ ' + t('zone.game.debt'), launch('DebtDodge'), !locked),
                { label: '⚔ ' + t('zone.game.boss'), color: 0xd02e45, run: launch('BossVat', 'boss'), enabled: !s.locked.includes('invoices') },
                explore,
              ]
            : [
                gold('🌊 ' + t('zone.game.river'), launch('CashRiver', 'river')),
                { label: '🏆 ' + t('zone.game.vault'), color: 0x7c4dff, run: () => (close(), openTrophies()), enabled: true },
                explore,
              ];
    const bw = actions.length === 3 ? 310 : 380;
    const gap = 22;
    const total = actions.length * bw + (actions.length - 1) * gap;
    const buttons = actions.map((a, i) => {
      const b = new Button(this, cx - total / 2 + bw / 2 + i * (bw + gap), cy + 130, a.label, a.run, {
        w: bw,
        h: 90,
        size: actions.length === 3 ? 25 : 28,
        color: a.color,
        textColor: a.dark ? '#3A2400' : '#FFFFFF',
      });
      if (a.dark) b.label.setStroke('#FFF3B0', 0);
      if (!a.enabled) {
        b.enabled = false;
        b.setAlpha(0.4);
      }
      return b;
    });
    const closeBtn = new Button(this, cx, cy + 240, t('zone.close'), close, { w: 260, h: 70, size: 26, color: 0x4b3d80 });
    this.menu = this.add.container(0, 0, [dim, bg, title, sub, valueText, detailText, gameDesc, ...buttons, closeBtn]).setScrollFactor(0).setDepth(1000);
    this.menu.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));
    this.menu.setAlpha(0).setY(30);
    this.tweens.add({ targets: this.menu, alpha: 1, y: 0, duration: 220, ease: 'Back.out' });
    this.menuGroup = new ButtonGroup(this, [...buttons, closeBtn], true);
    this.menuGroup.focus(Math.max(0, buttons.findIndex((b) => b.enabled)));
    this.markEntered(id);
    sfx('open');
  }

  private closeZoneMenu() {
    if (!this.menu || this.starting) return;
    const m = this.menu;
    this.menu = null;
    this.menuGroup?.destroy();
    this.menuGroup = null;
    this.hero.frozen = false;
    sfx('close');
    this.tweens.add({ targets: m, alpha: 0, y: 20, duration: 140, onComplete: () => m.destroy() });
  }

  // ------------------------------------------------------------------ since last visit

  private banner(title: string, lines: string[]) {
    // Slides up from the bottom so it never hides the summits the camera is showing.
    const h = 110 + lines.length * 40;
    const c = this.add.container(W / 2, H + 40).setScrollFactor(0).setDepth(900);
    const g = this.add.graphics();
    g.fillStyle(0x0d0820, 0.4);
    g.fillRoundedRect(-430, 6, 860, h, 30);
    g.fillStyle(0x2a2056, 0.96);
    g.fillRoundedRect(-430, 0, 860, h, 30);
    g.lineStyle(4, 0xffd54a, 0.9);
    g.strokeRoundedRect(-430, 0, 860, h, 30);
    c.add(g);
    c.add(text(this, 0, 48, title, 38, '#FFE45C', { strokeThickness: 7, weight: 700 }));
    lines.forEach((l, i) => c.add(text(this, 0, 100 + i * 40, l, 28, '#FFFFFF', { stroke: null })));
    c.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));
    this.tweens.add({ targets: c, y: H - h - 90, duration: 500, ease: 'Back.out' });
    this.tweens.add({ targets: c, y: H + 40, duration: 400, delay: 3800 + lines.length * 700, ease: 'Back.in', onComplete: () => c.destroy() });
    sfx('fanfare');
  }

  /**
   * Camera tour over a list of stops, optionally with a caption at each one. Any key or tap skips
   * it: remaining stops are cancelled and the camera goes back to following the hero.
   */
  private runCinematic(stops: { x: number; title?: string; body?: string; onArrive?: () => void; dwell?: number }[], onDone?: () => void) {
    this.cinematic = true;
    this.hero.frozen = true;
    const cam = this.cameras.main;
    cam.stopFollow();
    const timers: Phaser.Time.TimerEvent[] = [];
    let delay = 0;
    for (const stop of stops) {
      timers.push(
        this.time.delayedCall(delay, () => {
          if (!this.cinematic) return;
          cam.pan(stop.x, H / 2, 900, Phaser.Math.Easing.Sine.InOut, true);
          if (stop.title) this.caption(stop.title, stop.body ?? '');
          timers.push(this.time.delayedCall(900, () => this.cinematic && stop.onArrive?.()));
        }),
      );
      delay += 900 + (stop.dwell ?? 1700);
    }
    const kb = this.input.keyboard;
    const finish = () => {
      if (!this.cinematic) return;
      this.cinematic = false;
      this.hero.frozen = false;
      for (const tm of timers) tm.remove();
      kb?.off('keydown', finish);
      this.input.off('pointerdown', finish);
      this.hideCaption();
      cam.panEffect.reset();
      cam.pan(this.hero.sprite.x, H / 2, 600, Phaser.Math.Easing.Sine.InOut, true, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => {
        if (p >= 1) cam.startFollow(this.hero.sprite, true, 0.09, 0.09, 0, 120);
      });
      onDone?.();
    };
    timers.push(this.time.delayedCall(delay + 200, finish));
    kb?.once('keydown', finish);
    this.input.once('pointerdown', finish);
  }

  private caption(title: string, body: string) {
    this.hideCaption(true);
    const c = this.add.container(W / 2, H + 20).setScrollFactor(0).setDepth(900);
    const w = 1080;
    const h = 190;
    const g = this.add.graphics();
    g.fillStyle(0x0d0820, 0.4);
    g.fillRoundedRect(-w / 2, 6, w, h, 30);
    g.fillStyle(0x2a2056, 0.96);
    g.fillRoundedRect(-w / 2, 0, w, h, 30);
    g.lineStyle(4, 0xffd54a, 0.9);
    g.strokeRoundedRect(-w / 2, 0, w, h, 30);
    c.add(g);
    c.add(text(this, 0, 46, title, 38, '#FFE45C', { strokeThickness: 7, weight: 700 }));
    c.add(text(this, 0, 104, body, 26, '#FFFFFF', { stroke: null, wrap: w - 80 }));
    c.add(text(this, 0, 160, t('tour.skip'), 18, '#9A90C4', { stroke: null, shadow: false }));
    c.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));
    this.tweens.add({ targets: c, y: H - h - 70, duration: 380, ease: 'Back.out' });
    this.captionBox = c;
    sfx('open');
  }

  private hideCaption(instant = false) {
    const c = this.captionBox;
    if (!c) return;
    this.captionBox = null;
    if (instant) c.destroy();
    else this.tweens.add({ targets: c, y: H + 40, duration: 300, ease: 'Back.in', onComplete: () => c.destroy() });
  }

  /** First visit: a guided camera tour of the four zones. */
  private playTour() {
    const touch = this.sys.game.device.input.touch;
    const harborX = (DOCK_FROM + DOCK_TO) / 2;
    this.runCinematic(
      [
        { x: this.hero.sprite.x, title: t('world.welcome', { company: this.snap.companyName }), body: t('title.tagline'), dwell: 1500 },
        { x: GOLD_X, title: t('zone.gold'), body: t('tour.gold.body'), dwell: 2600, onArrive: () => sparkle(this, GOLD_X, this.summitY.gold - 60, 24) },
        { x: BANK_X, title: t('zone.vault'), body: t('tour.vault.body'), dwell: 2400 },
        { x: harborX, title: t('zone.harbor'), body: t('tour.harbor.body'), dwell: 2400 },
        { x: DEBT_X, title: t('zone.debt'), body: t('tour.debt.body'), dwell: 2400 },
        { x: this.hero.sprite.x, title: t('tour.end.title'), body: t(touch ? 'tour.end.body.touch' : 'tour.end.body'), dwell: 2200 },
      ],
      () => setProgress({ ...state.progress, guideDone: true }),
    );
  }

  private playSinceLastVisit(d: SnapshotDiff) {
    const s = this.snap;
    const lines: string[] = [];
    const collected = sum(d.newCollected, (p) => p.amount);
    if (d.newCollected.length) lines.push('💰 ' + t('world.since.collected', { n: d.newCollected.length, amount: money(collected, s.currency, 0) }));
    if (d.clearedReceivables.length) lines.push('🎈 ' + t('world.since.clearedReceivables', { n: d.clearedReceivables.length }));
    if (d.clearedDebts.length) lines.push('🎉 ' + t('world.since.clearedDebts', { n: d.clearedDebts.length }));
    if (d.newDebts.length) lines.push('✈️ ' + t('world.since.newDebts', { n: d.newDebts.length }));
    if (d.newReceivables.length) lines.push('🧾 ' + t('world.since.newReceivables', { n: d.newReceivables.length }));
    this.banner(t('world.since'), lines);

    const stops: { x: number; onArrive: () => void; dwell: number }[] = [];
    if (d.newCollected.length) {
      stops.push({
        x: GOLD_X,
        dwell: 1700,
        onArrive: () => {
          for (let i = 0; i < Math.min(40, 8 + d.newCollected.length * 4); i++) {
            this.time.delayedCall(i * 60, () => {
              const coin = this.add.image(GOLD_X - 500 + Math.random() * 1000, -40, 'coin').setDepth(30);
              sfx('coin', { pitch: 0.9 + Math.random() * 0.4, volume: 0.5 });
              this.tweens.add({ targets: coin, y: this.summitY.gold + Math.random() * 200, angle: 360, duration: 900, ease: 'Bounce.out', onComplete: () => this.tweens.add({ targets: coin, alpha: 0, delay: 800, duration: 400, onComplete: () => coin.destroy() }) });
            });
          }
          popText(this, GOLD_X, this.summitY.gold - 220, '+' + money(collected, s.currency, 0), '#FFE45C', 64, { duration: 2000 });
        },
      });
    }
    if (d.clearedDebts.length || d.newDebts.length) {
      stops.push({
        x: DEBT_X,
        dwell: 1700,
        onArrive: () => {
          if (d.clearedDebts.length) {
            confetti(this, DEBT_X, this.summitY.debt - 100, 80);
            sfx('paid');
            popText(this, DEBT_X, this.summitY.debt - 220, `-${money(sum(d.clearedDebts, (x) => x.pending), s.currency, 0)}`, '#7CF5A8', 60, { duration: 2000 });
          }
          if (d.newDebts.length) {
            const p = this.add.image(DEBT_X + 900, this.summitY.debt - 300, 'plane-orange').setDepth(30);
            sfx('whoosh');
            this.tweens.add({ targets: p, x: DEBT_X, y: this.summitY.debt - 120, duration: 1200, ease: 'Cubic.out', onComplete: () => this.tweens.add({ targets: p, alpha: 0, duration: 600, onComplete: () => p.destroy() }) });
          }
        },
      });
    }
    if (d.clearedReceivables.length || d.newReceivables.length) {
      const hx = (DOCK_FROM + DOCK_TO) / 2;
      stops.push({
        x: hx,
        dwell: 1700,
        onArrive: () => {
          sparkle(this, hx, 500, 30);
          if (d.clearedReceivables.length) {
            sfx('coinBig');
            popText(this, hx, 420, '+' + money(sum(d.clearedReceivables, (x) => x.pending), s.currency, 0), '#9CF6EA', 60, { duration: 2000 });
          }
        },
      });
    }
    this.runCinematic(stops);
  }

  // ------------------------------------------------------------------ touch controls

  /** On-screen buttons for phones and tablets: walk left/right, jump and enter. */
  private buildTouchControls() {
    this.input.addPointer(2);
    const make = (x: number, y: number, r: number, label: string, onDown: () => void, onUp: () => void) => {
      const g = this.add.graphics();
      g.fillStyle(0x0d0820, 0.35);
      g.fillCircle(0, 6, r);
      g.fillStyle(0x241a45, 0.78);
      g.fillCircle(0, 0, r);
      g.lineStyle(4, 0xffffff, 0.35);
      g.strokeCircle(0, 0, r);
      const box = this.add.container(x, y, [g, text(this, 0, -2, label, Math.round(r * 0.75), '#FFFFFF', { stroke: null })]).setScrollFactor(0).setDepth(950);
      box.list.forEach((o) => (o as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor?.(0));
      const zone = this.add.zone(x, y, r * 2.3, r * 2.3).setScrollFactor(0).setDepth(951).setInteractive();
      const release = () => {
        onUp();
        box.setScale(1);
      };
      zone.on('pointerdown', () => {
        unlockAudio();
        onDown();
        box.setScale(0.9);
      });
      zone.on('pointerup', release);
      zone.on('pointerout', release);
      return { box, zone };
    };
    make(140, H - 150, 80, '◀', () => (this.touch.left = true), () => (this.touch.left = false));
    make(340, H - 150, 80, '▶', () => (this.touch.right = true), () => (this.touch.right = false));
    make(W - 170, H - 175, 100, '⤒', () => ((this.touch.jump = true), (this.jumpQueued = true)), () => (this.touch.jump = false));
    this.touchEnter = make(W - 400, H - 130, 68, 'E', () => {
      if (this.nearTrigger && !this.menu && !this.cinematic) this.openZoneMenu(this.nearTrigger.id);
    }, () => {});
    this.touchEnter.box.setVisible(false);
    this.touchEnter.zone.disableInteractive();
  }

  // ------------------------------------------------------------------ loop

  update(time: number, deltaMs: number) {
    if (!this.hero?.sprite.body || !this.sys.isActive()) return;
    const dt = Math.min(0.05, deltaMs / 1000);
    const k = this.keys;
    const blocked = !!this.menu || this.cinematic || isModalOpen();
    const input = blocked
      ? { left: false, right: false, jumpPressed: false, jumpHeld: false }
      : {
          left: k.left.isDown || k.a.isDown || this.touch.left,
          right: k.right.isDown || k.d.isDown || this.touch.right,
          jumpPressed: this.jumpQueued,
          jumpHeld: k.space.isDown || k.up.isDown || k.w.isDown || this.touch.jump,
        };
    this.jumpQueued = false;
    this.hero.update(dt, input);

    // Zone triggers
    const hx = this.hero.sprite.x;
    const onGroundLevel = this.hero.body.bottom > GY - 20;
    let near: Trigger | null = null;
    for (const tr of this.triggers) if (Math.abs(tr.x - hx) < 110 && onGroundLevel) near = tr;
    this.nearTrigger = near;
    if (near && !this.menu && !this.cinematic) this.showPrompt(near.x, near.y - 90, `E · ${t('zone.enter')}`);
    else if (this.prompt.visible) this.prompt.setVisible(false);
    if (this.touchEnter) {
      const show = !!near && !this.menu && !this.cinematic;
      if (show !== this.touchEnter.box.visible) {
        this.touchEnter.box.setVisible(show);
        if (show) this.touchEnter.zone.setInteractive();
        else this.touchEnter.zone.disableInteractive();
      }
    }
    if (this.pendingOpen && this.hero.target === null && near?.id === this.pendingOpen) this.openZoneMenu(this.pendingOpen);
    if (near?.id === 'harbor') this.pipSay('harbor', t('pip.harbor'));
    if (near?.id === 'vault') this.pipSay('bank', t('pip.bank'));
    // Standing around for a while gets a nudge.
    const still = !blocked && this.hero.onGround && Math.abs(this.hero.body.velocity.x) < 5 && this.hero.target === null;
    this.idleFor = still ? this.idleFor + dt : 0;
    if (this.idleFor > 15) this.pipSay('idle', t('pip.idle'));

    // Standing on a stratum?
    let layer: Layer | null = null;
    if (this.hero.onGround) {
      const bottom = this.hero.body.bottom;
      layer = this.layers.find((l) => Math.abs(bottom - l.top) < 8 && hx > l.left - 10 && hx < l.right + 10) ?? null;
    }
    this.showBubble(layer);
    if (this.currentLayer) this.bubble.setPosition(hx, this.hero.sprite.y - 120);

    // Harbor: reveal balloon labels as the hero walks under them (or on hover)
    for (const b of this.balloons) {
      b.label.setPosition(b.img.x, b.img.y - 70 * b.img.scaleY - 20);
      const show = Math.abs(b.postX - hx) < 70 || b.img.getData('hover') === true;
      b.label.setAlpha(Phaser.Math.Linear(b.label.alpha, show ? 1 : 0, 0.15));
    }
    this.drawStrings();
    this.drawWater(time);

    // Debt planes orbit the summit
    for (const p of this.planes) {
      p.a += p.speed * dt;
      const x = DEBT_X + Math.cos(p.a) * p.rx;
      const y = this.summitY.debt - 120 + Math.sin(p.a) * p.ry;
      const dx = -Math.sin(p.a) * p.rx;
      const dy = Math.cos(p.a) * p.ry;
      p.img.setPosition(x, y).setRotation(Math.atan2(dy, dx));
      p.img.setDepth(Math.sin(p.a) > 0 ? 1 : -3);
    }
  }

  private drawStrings() {
    const g = this.strings;
    g.clear();
    g.lineStyle(2.5, 0xffffff, 0.8);
    for (const b of this.balloons) {
      const bx = b.img.x;
      const by = b.img.y + 46 * b.img.scaleY;
      g.beginPath();
      g.moveTo(b.postX, GY - 26);
      const mx = (b.postX + bx) / 2 + Math.sin(this.time.now / 500 + b.postX) * 12;
      const my = (GY - 26 + by) / 2;
      const curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(b.postX, GY - 26), new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(bx, by));
      curve.draw(g, 16);
    }
  }
}

function goldColors(i: number) {
  return i % 2
    ? { face: 0xf7c431, shade: 0xc98a00, top: 0xffe680 }
    : { face: 0xf2b21b, shade: 0xb87a00, top: 0xffdd55 };
}

function debtColors(key: string) {
  switch (key) {
    case 'notDue':
      return { face: 0x55607e, shade: 0x3a4260, top: 0x7a86a8 };
    case 'd1_30':
      return { face: 0x8e5f86, shade: 0x5e3b5a, top: 0xb486aa };
    case 'd31_60':
      return { face: 0xa8506a, shade: 0x6e2b42, top: 0xd27891 };
    case 'd61_90':
      return { face: 0xbd3f55, shade: 0x7a1f30, top: 0xe56a7d };
    default:
      return { face: 0xd02e45, shade: 0x84142a, top: 0xff6b7d };
  }
}
