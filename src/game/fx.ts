import Phaser from 'phaser';
import { text } from './ui';

/** Floating text that pops, rises and fades — damage-number style. */
export function popText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  color = '#FFE45C',
  size = 40,
  o: { rise?: number; duration?: number; scrollFactor?: number; delay?: number; depth?: number } = {},
) {
  const t = text(scene, x, y, str, size, color).setDepth(o.depth ?? 500).setScale(0.3);
  if (o.scrollFactor !== undefined) t.setScrollFactor(o.scrollFactor);
  scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.out', delay: o.delay ?? 0 });
  scene.tweens.add({
    targets: t,
    y: y - (o.rise ?? 90),
    alpha: { from: 1, to: 0 },
    duration: o.duration ?? 1100,
    delay: (o.delay ?? 0) + 350,
    ease: 'Cubic.in',
    onComplete: () => t.destroy(),
  });
  return t;
}

export interface BurstOpts {
  count?: number;
  tint?: number | number[];
  speed?: [number, number];
  scale?: [number, number];
  lifespan?: number;
  gravityY?: number;
  angle?: [number, number];
  add?: boolean;
  rotate?: boolean;
  depth?: number;
  scrollFactor?: number;
}

/** One-shot particle explosion that cleans itself up. */
export function burst(scene: Phaser.Scene, x: number, y: number, key: string, o: BurstOpts = {}) {
  const lifespan = o.lifespan ?? 700;
  const emitter = scene.add.particles(x, y, key, {
    emitting: false,
    lifespan: { min: lifespan * 0.6, max: lifespan },
    speed: { min: o.speed?.[0] ?? 150, max: o.speed?.[1] ?? 450 },
    angle: { min: o.angle?.[0] ?? 0, max: o.angle?.[1] ?? 360 },
    scale: { start: o.scale?.[0] ?? 0.8, end: o.scale?.[1] ?? 0 },
    alpha: { start: 1, end: 0, ease: 'cubic.in' },
    gravityY: o.gravityY ?? 600,
    rotate: o.rotate ? { min: 0, max: 360 } : 0,
    tint: o.tint ?? 0xffffff,
    blendMode: o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
  });
  emitter.setDepth(o.depth ?? 400);
  if (o.scrollFactor !== undefined) emitter.setScrollFactor(o.scrollFactor);
  emitter.explode(o.count ?? 20);
  scene.time.delayedCall(lifespan + 100, () => emitter.destroy());
  return emitter;
}

export const CONFETTI = [0xff4d6d, 0xffd54a, 0x2ec4b6, 0x7c4dff, 0x5bd16a, 0xff9f43];

export function confetti(scene: Phaser.Scene, x: number, y: number, count = 40, depth = 400) {
  return burst(scene, x, y, 'confetti', {
    count,
    tint: CONFETTI,
    speed: [250, 700],
    angle: [200, 340],
    scale: [0.9, 0.6],
    lifespan: 1600,
    gravityY: 900,
    rotate: true,
    depth,
  });
}

export function sparkle(scene: Phaser.Scene, x: number, y: number, count = 12, tint: number | number[] = 0xffe45c, depth = 400) {
  return burst(scene, x, y, 'spark', { count, tint, speed: [80, 260], scale: [0.9, 0], lifespan: 600, gravityY: 0, add: true, depth });
}

export function shockwave(scene: Phaser.Scene, x: number, y: number, tint = 0xffffff, scale = 2.5, depth = 300) {
  const r = scene.add.image(x, y, 'ring').setTint(tint).setDepth(depth).setScale(0.2).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: r, scale, alpha: { from: 0.9, to: 0 }, duration: 450, ease: 'Cubic.out', onComplete: () => r.destroy() });
  return r;
}

/** Freeze the scene for a few frames to sell an impact. */
export function hitStop(scene: Phaser.Scene, ms = 70) {
  const physics = (scene as Phaser.Scene & { physics?: Phaser.Physics.Arcade.ArcadePhysics }).physics;
  scene.tweens.timeScale = 0.02;
  scene.time.timeScale = 0.02;
  physics?.world?.pause();
  setTimeout(() => {
    if (!scene.sys.isActive() && !scene.sys.isPaused()) return;
    scene.tweens.timeScale = 1;
    scene.time.timeScale = 1;
    physics?.world?.resume();
  }, ms);
}

export function flash(scene: Phaser.Scene, color = 0xffffff, duration = 220) {
  const cam = scene.cameras.main;
  const rgb = Phaser.Display.Color.IntegerToRGB(color);
  cam.flash(duration, rgb.r, rgb.g, rgb.b, false);
}

export function zoomPunch(scene: Phaser.Scene, amount = 0.04, duration = 120) {
  const cam = scene.cameras.main;
  const base = cam.zoom;
  scene.tweens.add({ targets: cam, zoom: base + amount, duration, yoyo: true, ease: 'Quad.out' });
}

/** Animated counter on a Text object. */
export function countUp(scene: Phaser.Scene, t: Phaser.GameObjects.Text, to: number, format: (n: number) => string, duration = 900, delay = 0) {
  const o = { v: 0 };
  scene.tweens.add({
    targets: o,
    v: to,
    duration,
    delay,
    ease: 'Cubic.out',
    onUpdate: () => t.setText(format(o.v)),
    onComplete: () => t.setText(format(to)),
  });
}

/** Random emission zone over a rectangle (typed for the particle config). */
export function rectZone(x: number, y: number, w: number, h: number): Phaser.Types.GameObjects.Particles.EmitZoneData {
  return {
    type: 'random',
    source: {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        p.x = x + Math.random() * w;
        p.y = y + Math.random() * h;
      },
    },
  };
}

const speaking = new WeakMap<object, Phaser.GameObjects.Container>();

/**
 * Comic speech bubble that follows a game object (Pip, the boss) for a few seconds.
 * A new line from the same speaker replaces the previous one.
 */
export function say(
  scene: Phaser.Scene,
  speaker: { x: number; y: number },
  line: string,
  o: { dx?: number; dy?: number; duration?: number; depth?: number; color?: number; size?: number; screen?: boolean } = {},
) {
  speaking.get(speaker)?.destroy();
  const label = text(scene, 0, 0, line, o.size ?? 26, '#2B1B3D', { stroke: null, shadow: false, weight: 600, wrap: 460 });
  const w = label.width + 36;
  const h = label.height + 20;
  const g = scene.add.graphics();
  g.fillStyle(0x1b1030, 0.25);
  g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 22);
  g.fillStyle(o.color ?? 0xffffff, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  g.fillTriangle(-14, h / 2 - 2, 14, h / 2 - 2, -4, h / 2 + 20);
  // Stay fully on screen (when the scene doesn't scroll) even if the speaker is near an edge.
  const place = () => {
    let x = speaker.x + (o.dx ?? 0);
    if (o.screen) x = Phaser.Math.Clamp(x, w / 2 + 12, scene.scale.width - w / 2 - 12);
    return [x, speaker.y + (o.dy ?? -150)] as const;
  };
  const box = scene.add.container(...place(), [g, label]).setDepth(o.depth ?? 600).setScale(0.3);
  speaking.set(speaker, box);
  scene.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.out' });
  const follow = () => box.active && box.setPosition(...place());
  scene.events.on('update', follow);
  scene.events.once('shutdown', () => scene.events.off('update', follow));
  scene.time.delayedCall(o.duration ?? 2600, () => {
    scene.events.off('update', follow);
    if (!box.active) return;
    scene.tweens.add({ targets: box, alpha: 0, scale: 0.8, duration: 200, onComplete: () => box.destroy() });
    if (speaking.get(speaker) === box) speaking.delete(speaker);
  });
  return box;
}

/** A random entry from a list. */
export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];
