import Phaser from 'phaser';
import { sfx } from '../audio/sfx';

export const W = 1920;
export const H = 1080;
export const FONT = 'Fredoka, "Baloo 2", system-ui, sans-serif';
export const INK = '#2B1B3D';

export interface TextOpts {
  weight?: 400 | 500 | 600 | 700;
  stroke?: string | null;
  strokeThickness?: number;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  shadow?: boolean;
  origin?: [number, number];
}

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size = 32,
  color = '#FFFFFF',
  o: TextOpts = {},
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: String(o.weight ?? 600),
    color,
    align: o.align ?? 'center',
    stroke: o.stroke === null ? undefined : (o.stroke ?? INK),
    strokeThickness: o.stroke === null ? 0 : (o.strokeThickness ?? Math.max(4, Math.round(size / 6))),
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
    padding: { x: 4, y: 4 },
  });
  t.setOrigin(...(o.origin ?? [0.5, 0.5]));
  if (o.shadow !== false) t.setShadow(0, Math.max(2, size / 12), 'rgba(20,10,40,0.45)', 0, true, true);
  return t;
}

export interface ButtonOpts {
  w?: number;
  h?: number;
  color?: number;
  edge?: number;
  textColor?: string;
  size?: number;
  icon?: string;
  iconScale?: number;
}

export class Button extends Phaser.GameObjects.Container {
  readonly label: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Graphics;
  private focused = false;
  private hovered = false;
  enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    caption: string,
    readonly onClick: () => void,
    readonly o: ButtonOpts = {},
  ) {
    super(scene, x, y);
    const w = o.w ?? 360;
    const h = o.h ?? 84;
    this.bg = scene.add.graphics();
    this.label = text(scene, 0, -3, caption, o.size ?? 34, o.textColor ?? '#FFFFFF', { strokeThickness: 5 });
    this.add([this.bg, this.label]);
    if (o.icon) {
      const icon = scene.add.image(-w / 2 + 44, -3, o.icon).setScale(o.iconScale ?? 0.7);
      this.add(icon);
      this.label.setX(22);
    }
    this.setSize(w, h);
    this.draw();
    // Container hit areas are measured from the top-left of a box centred on the container.
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';
    this.on('pointerover', () => {
      this.hovered = true;
      sfx('hover');
      this.draw();
      scene.tweens.add({ targets: this, scale: 1.06, duration: 120, ease: 'Back.out' });
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.draw();
      scene.tweens.add({ targets: this, scale: 1, duration: 120 });
    });
    this.on('pointerdown', () => scene.tweens.add({ targets: this, scale: 0.94, duration: 60 }));
    this.on('pointerup', () => this.activate());
    scene.add.existing(this);
  }

  activate() {
    if (!this.enabled || !this.visible) return;
    sfx('select');
    this.scene.tweens.add({ targets: this, scale: { from: 0.92, to: 1 }, duration: 180, ease: 'Back.out' });
    this.onClick();
  }

  setFocus(f: boolean) {
    this.focused = f;
    this.draw();
    this.scene.tweens.add({ targets: this, scale: f ? 1.06 : 1, duration: 120, ease: 'Back.out' });
  }

  setCaption(s: string) {
    this.label.setText(s);
  }

  private draw() {
    const w = this.width;
    const h = this.height;
    const color = this.o.color ?? 0x7c4dff;
    const edge = this.o.edge ?? Phaser.Display.Color.ValueToColor(color).darken(28).color;
    const g = this.bg;
    g.clear();
    if (this.focused || this.hovered) {
      g.fillStyle(0xffffff, 0.9);
      g.fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 14, h / 2 + 6);
    }
    g.fillStyle(0x1b1030, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 10, w, h, h / 2);
    g.fillStyle(edge, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, h / 2);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h - 4, h / 2);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-w / 2 + 16, -h / 2 + 7, w - 32, h * 0.32, h * 0.16);
  }
}

/** Keyboard navigation (arrows/WASD + Enter/Space) across a group of buttons. */
export class ButtonGroup {
  private index = -1;
  private readonly handler = (e: KeyboardEvent) => this.onKey(e);
  /** Key events that happened before the group existed (e.g. the Enter that opened a menu) are ignored. */
  private readonly createdAt = performance.now();

  constructor(
    private readonly scene: Phaser.Scene,
    readonly buttons: Button[],
    private readonly horizontal = false,
  ) {
    scene.input.keyboard?.on('keydown', this.handler);
    scene.events.once('shutdown', () => this.destroy());
  }

  private onKey(e: KeyboardEvent) {
    if (e.timeStamp < this.createdAt) return;
    const visible = this.buttons.filter((b) => b.visible && b.enabled);
    if (!visible.length) return;
    const prev = this.horizontal ? ['ArrowLeft', 'KeyA'] : ['ArrowUp', 'KeyW'];
    const next = this.horizontal ? ['ArrowRight', 'KeyD'] : ['ArrowDown', 'KeyS'];
    if (prev.includes(e.code) || next.includes(e.code)) {
      const cur = visible.indexOf(this.buttons[this.index]);
      const n = prev.includes(e.code) ? (cur <= 0 ? visible.length - 1 : cur - 1) : (cur + 1) % visible.length;
      this.focus(this.buttons.indexOf(visible[n]));
      sfx('hover');
    } else if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && this.index >= 0) {
      this.buttons[this.index]?.activate();
    }
  }

  focus(i: number) {
    this.buttons.forEach((b, j) => b.setFocus(j === i));
    this.index = i;
  }

  destroy() {
    this.scene.input.keyboard?.off('keydown', this.handler);
  }
}

/** Rounded glassy panel drawn with Graphics. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color = 0x241a45, alpha = 0.92) {
  const g = scene.add.graphics();
  g.fillStyle(0x0d0820, 0.35);
  g.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 12, w, h, 36);
  g.fillStyle(color, alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 36);
  g.lineStyle(4, 0xffffff, 0.18);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 36);
  g.fillStyle(0xffffff, 0.06);
  g.fillRoundedRect(x - w / 2 + 12, y - h / 2 + 10, w - 24, 60, 26);
  return g;
}

/** Sky gradient for a given hour, used by every outdoor scene. */
/** Real local hour, overridable with ?hour=12 to preview other times of day. */
export function currentHour(): number {
  const forced = Number(new URLSearchParams(globalThis.location?.search ?? '').get('hour'));
  return Number.isInteger(forced) && forced >= 0 && forced < 24 && globalThis.location?.search.includes('hour=') ? forced : new Date().getHours();
}

export function skyColors(hour = currentHour()): { top: number; bottom: number; night: boolean; dusk: boolean } {
  if (hour >= 21 || hour < 6) return { top: 0x0b1640, bottom: 0x34407e, night: true, dusk: false };
  if (hour < 8) return { top: 0x6a7fdb, bottom: 0xffc59e, night: false, dusk: true };
  if (hour >= 18) return { top: 0x5a63c8, bottom: 0xffa47a, night: false, dusk: true };
  return { top: 0x48a8ff, bottom: 0xc8ecff, night: false, dusk: false };
}

export function drawSky(scene: Phaser.Scene, top: number, bottom: number, w = W, h = H) {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(-100);
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, w, h);
  return g;
}
