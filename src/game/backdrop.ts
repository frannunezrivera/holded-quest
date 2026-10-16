import Phaser from 'phaser';
import { mulberry32 } from '../data/demoData';
import { H, W, drawSky, skyColors } from './ui';

export interface BackdropOpts {
  width?: number; // world width the camera can scroll across
  groundY?: number;
  hour?: number;
  stormy?: boolean;
  seed?: number;
  ground?: boolean;
}

/**
 * Layered parallax scenery: sky gradient for the real time of day, sun or moon, stars,
 * far mountains, drifting clouds, rolling hills with pines and a grassy ground.
 */
export function drawBackdrop(scene: Phaser.Scene, o: BackdropOpts = {}) {
  const width = o.width ?? W;
  const groundY = o.groundY ?? 900;
  const sky = skyColors(o.hour);
  const rnd = mulberry32(o.seed ?? 7);
  const top = o.stormy ? 0x3b3478 : sky.top;
  const bottom = o.stormy ? 0xa77aa8 : sky.bottom;
  drawSky(scene, top, bottom);

  // Stars
  if (sky.night || o.stormy) {
    for (let i = 0; i < 90; i++) {
      const s = scene.add
        .image(rnd() * W, rnd() * H * 0.6, 'dot')
        .setScrollFactor(0.02)
        .setScale(0.1 + rnd() * 0.25)
        .setAlpha(0.4 + rnd() * 0.6)
        .setDepth(-95);
      scene.tweens.add({ targets: s, alpha: 0.15, duration: 600 + rnd() * 1800, yoyo: true, repeat: -1, delay: rnd() * 2000 });
    }
  }

  // Sun / moon with a soft glow
  if (!o.stormy) {
    const x = W * 0.78;
    const y = sky.dusk ? H * 0.42 : H * 0.18;
    const color = sky.night ? 0xf3f0ff : sky.dusk ? 0xffb36b : 0xfff3b0;
    scene.add.image(x, y, 'glow').setScrollFactor(0.04).setScale(sky.night ? 1.6 : 2.4).setTint(color).setAlpha(0.7).setDepth(-94).setBlendMode(Phaser.BlendModes.ADD);
    const orb = scene.add.circle(x, y, sky.night ? 46 : 64, color).setScrollFactor(0.04).setDepth(-93);
    if (sky.night) scene.add.circle(x + 18, y - 10, 40, top).setScrollFactor(0.04).setDepth(-92);
    scene.tweens.add({ targets: orb, scale: 1.05, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  // Far mountains
  const far = scene.add.graphics().setScrollFactor(0.12).setDepth(-90);
  const farColor = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(bottom),
    Phaser.Display.Color.ValueToColor(o.stormy ? 0x2b2450 : sky.night ? 0x1c2456 : 0x7b8fd6),
    100,
    55,
  );
  far.fillStyle(Phaser.Display.Color.GetColor(farColor.r, farColor.g, farColor.b), 1);
  const farWidth = W + width * 0.12 + 200;
  far.beginPath();
  far.moveTo(-100, groundY);
  let fx = -100;
  while (fx < farWidth) {
    const peak = groundY - 260 - rnd() * 260;
    const span = 220 + rnd() * 260;
    far.lineTo(fx + span / 2, peak);
    far.lineTo(fx + span, groundY - 150 - rnd() * 80);
    fx += span;
  }
  far.lineTo(farWidth, groundY);
  far.closePath();
  far.fillPath();

  // Clouds
  const cloudKey = sky.dusk ? 'cloud-dusk' : o.stormy ? 'storm' : 'cloud';
  const cloudWidth = W + width * 0.25;
  for (let i = 0; i < Math.ceil(cloudWidth / 380); i++) {
    const c = scene.add
      .image(i * 380 + rnd() * 200, 90 + rnd() * 300, cloudKey)
      .setScrollFactor(0.25)
      .setScale(0.6 + rnd() * 0.8)
      .setAlpha(sky.night ? 0.35 : 0.9)
      .setDepth(-85);
    scene.tweens.add({ targets: c, x: c.x + 120 + rnd() * 120, duration: 20000 + rnd() * 20000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  // Rolling hills with pines
  const hillColor = o.stormy ? 0x40365e : sky.night ? 0x1f3a4a : sky.dusk ? 0x6d8f5a : 0x7ccf7a;
  const hills = scene.add.graphics().setScrollFactor(0.45).setDepth(-80);
  hills.fillStyle(hillColor, 1);
  const hillWidth = W + width * 0.45 + 200;
  hills.beginPath();
  hills.moveTo(-100, H);
  for (let x = -100; x <= hillWidth; x += 40) {
    const y = groundY - 110 - Math.sin(x / 260) * 50 - Math.sin(x / 97 + 1.3) * 18;
    hills.lineTo(x, y);
  }
  hills.lineTo(hillWidth, H);
  hills.closePath();
  hills.fillPath();
  const pineKey = o.stormy || sky.night ? 'pine-dark' : 'pine';
  for (let x = 0; x < hillWidth; x += 90 + rnd() * 220) {
    const y = groundY - 110 - Math.sin(x / 260) * 50 - Math.sin(x / 97 + 1.3) * 18;
    scene.add.image(x, y + 10, pineKey).setOrigin(0.5, 1).setScale(0.35 + rnd() * 0.3).setScrollFactor(0.45).setDepth(-79).setAlpha(0.95);
  }

  // Ground
  if (o.ground !== false) {
    const g = scene.add.graphics().setDepth(-10);
    const grass = o.stormy ? 0x4f8a55 : sky.night ? 0x2f6b47 : 0x5cc45f;
    const grassDark = o.stormy ? 0x3a6b44 : sky.night ? 0x245338 : 0x3fa34d;
    const dirt = sky.night ? 0x5a3f2c : 0x8b5e3c;
    g.fillStyle(dirt, 1);
    g.fillRect(-50, groundY + 26, width + 100, H - groundY);
    g.fillStyle(grassDark, 1);
    g.fillRect(-50, groundY + 6, width + 100, 28);
    g.fillStyle(grass, 1);
    g.fillRect(-50, groundY - 4, width + 100, 20);
    // Grass scallops
    for (let x = -50; x < width + 50; x += 36) g.fillCircle(x, groundY + 2, 20);
    // Pebbles
    g.fillStyle(0x000000, 0.12);
    for (let i = 0; i < width / 60; i++) g.fillEllipse(rnd() * width, groundY + 50 + rnd() * (H - groundY - 60), 10 + rnd() * 18, 6 + rnd() * 8);
  }

  return { sky, groundY };
}

/** Occasional flock of birds crossing the screen. */
export function birds(scene: Phaser.Scene, width: number) {
  const spawn = () => {
    const y = 120 + Math.random() * 260;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const startX = dir > 0 ? -100 : width + 100;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const b = scene.add.sprite(startX - dir * i * 50, y + (i % 2) * 24, 'bird1').setDepth(-70).setScale(0.8).setScrollFactor(0.6);
      if (dir < 0) b.setFlipX(true);
      let frame = 0;
      const flap = scene.time.addEvent({ delay: 180, loop: true, callback: () => b.setTexture(++frame % 2 ? 'bird2' : 'bird1') });
      scene.tweens.add({
        targets: b,
        x: startX + dir * (width + 400),
        y: y - 60 + Math.random() * 120,
        duration: 16000 + Math.random() * 6000,
        onComplete: () => {
          flap.remove();
          b.destroy();
        },
      });
    }
  };
  scene.time.addEvent({ delay: 14000, loop: true, callback: spawn });
  scene.time.delayedCall(2500, spawn);
}
