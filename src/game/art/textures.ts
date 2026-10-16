import type Phaser from 'phaser';

/**
 * All game art is drawn here with Canvas 2D (gradients, shadows, curves) and registered as
 * Phaser textures at boot. No image files to download or license.
 */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export const PALETTE = {
  gold: '#FFD54A',
  goldMid: '#F5B700',
  goldDark: '#B87A00',
  goldLight: '#FFF3B0',
  pink: '#FF9EC4',
  pinkDark: '#E8679C',
  pinkLight: '#FFD1E3',
  ink: '#2B1B3D',
  teal: '#2EC4B6',
  red: '#FF4D5E',
  orange: '#FF9F43',
  green: '#5BD16A',
  greenDark: '#2F9E44',
  steel: '#A7B4C2',
  steelDark: '#5B6878',
  cream: '#FFF8EC',
  purple: '#6C4AB6',
} as const;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx, w, h);
  scene.textures.addCanvas(key, c);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function linear(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function euro(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, light?: string) {
  ctx.font = `700 ${size}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (light) {
    ctx.fillStyle = light;
    ctx.fillText('€', x + 1.5, y + 2);
  }
  ctx.fillStyle = color;
  ctx.fillText('€', x, y);
}

// ---------------------------------------------------------------- money

function drawCoin(ctx: CanvasRenderingContext2D, w: number) {
  const c = w / 2;
  const r = c - 3;
  ellipse(ctx, c, c, r, r);
  ctx.fillStyle = radial(ctx, c - r * 0.35, c - r * 0.35, 2, r * 1.3, [
    [0, PALETTE.goldLight],
    [0.45, PALETTE.gold],
    [1, PALETTE.goldMid],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.stroke();
  ellipse(ctx, c, c, r * 0.74, r * 0.74);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(184,122,0,0.55)';
  ctx.stroke();
  euro(ctx, c, c + 1, r * 1.05, PALETTE.goldDark, 'rgba(255,255,255,0.6)');
  ellipse(ctx, c - r * 0.38, c - r * 0.45, r * 0.32, r * 0.16, -0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fill();
}

function drawBill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rr(ctx, x, y, w, h, 6);
  ctx.fillStyle = linear(ctx, x, y, x, y + h, [
    [0, '#A8E6A1'],
    [1, '#6CC46A'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#2F7D32';
  ctx.stroke();
  rr(ctx, x + 5, y + 5, w - 10, h - 10, 4);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(47,125,50,0.5)';
  ctx.stroke();
  ellipse(ctx, x + w / 2, y + h / 2, h * 0.3, h * 0.3);
  ctx.fillStyle = '#E8F8E4';
  ctx.fill();
  ctx.strokeStyle = '#2F7D32';
  ctx.stroke();
  euro(ctx, x + w / 2, y + h / 2 + 1, h * 0.42, '#2F7D32');
}

function drawBag(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 12, 22);
  ctx.bezierCurveTo(cx - 44, 34, cx - 40, h - 4, cx, h - 4);
  ctx.bezierCurveTo(cx + 40, h - 4, cx + 44, 34, cx + 12, 22);
  ctx.closePath();
  ctx.fillStyle = radial(ctx, cx - 12, h * 0.5, 4, 50, [
    [0, '#F0C48A'],
    [1, '#B9803F'],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7A4E1E';
  ctx.stroke();
  // Top flaps
  ctx.beginPath();
  ctx.moveTo(cx - 12, 22);
  ctx.lineTo(cx - 22, 6);
  ctx.lineTo(cx - 4, 14);
  ctx.lineTo(cx + 2, 4);
  ctx.lineTo(cx + 8, 14);
  ctx.lineTo(cx + 22, 6);
  ctx.lineTo(cx + 12, 22);
  ctx.closePath();
  ctx.fillStyle = '#D9A066';
  ctx.fill();
  ctx.stroke();
  // Rope
  rr(ctx, cx - 16, 19, 32, 7, 3);
  ctx.fillStyle = '#C0392B';
  ctx.fill();
  // Coin badge
  ellipse(ctx, cx, h * 0.62, 15, 15);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.stroke();
  euro(ctx, cx, h * 0.62 + 1, 18, PALETTE.goldDark);
}

// ---------------------------------------------------------------- hero

interface PigOpts {
  blink?: boolean;
  legs?: 0 | 1 | 2;
  wings?: 0 | 1 | 2;
  hurt?: boolean;
  happy?: boolean;
}

function drawPig(ctx: CanvasRenderingContext2D, w: number, h: number, o: PigOpts) {
  const cx = w / 2 - 4;
  const cy = h / 2 + 4;
  // Shadow-side legs
  const legY = cy + 22;
  const legOffsets = o.legs === 1 ? [-5, 5] : o.legs === 2 ? [5, -5] : [0, 0];
  ctx.fillStyle = PALETTE.pinkDark;
  rr(ctx, cx - 22 + legOffsets[1], legY, 11, 16, 5);
  ctx.fill();
  rr(ctx, cx + 14 + legOffsets[0], legY, 11, 16, 5);
  ctx.fill();
  // Wings (behind body)
  if (o.wings) {
    const lift = o.wings === 1 ? -14 : 6;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 14);
    ctx.quadraticCurveTo(cx - 34, cy - 40 + lift, cx - 46, cy - 18 + lift);
    ctx.quadraticCurveTo(cx - 30, cy - 18 + lift / 2, cx - 34, cy - 6 + lift / 3);
    ctx.quadraticCurveTo(cx - 18, cy - 10, cx - 6, cy - 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#B9C6E0';
    ctx.stroke();
  }
  // Tail
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy - 2);
  ctx.bezierCurveTo(cx - 48, cy - 10, cx - 46, cy + 6, cx - 40, cy + 2);
  ctx.bezierCurveTo(cx - 36, cy - 2, cx - 44, cy - 6, cx - 48, cy - 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = PALETTE.pinkDark;
  ctx.stroke();
  // Body
  ellipse(ctx, cx, cy, 36, 29);
  ctx.fillStyle = radial(ctx, cx - 10, cy - 14, 4, 46, [
    [0, PALETTE.pinkLight],
    [0.55, PALETTE.pink],
    [1, PALETTE.pinkDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#C24D80';
  ctx.stroke();
  // Front legs
  ctx.fillStyle = PALETTE.pink;
  ctx.strokeStyle = '#C24D80';
  ctx.lineWidth = 2.5;
  rr(ctx, cx - 16 - legOffsets[0], legY - 2, 12, 17, 5);
  ctx.fill();
  ctx.stroke();
  rr(ctx, cx + 20 - legOffsets[1], legY - 2, 12, 17, 5);
  ctx.fill();
  ctx.stroke();
  // Ear
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 24);
  ctx.quadraticCurveTo(cx + 8, cy - 46, cx + 20, cy - 34);
  ctx.quadraticCurveTo(cx + 20, cy - 26, cx + 14, cy - 24);
  ctx.closePath();
  ctx.fillStyle = PALETTE.pinkDark;
  ctx.fill();
  ctx.stroke();
  // Coin slot + peeking coin
  ellipse(ctx, cx - 10, cy - 30, 9, 9);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.stroke();
  rr(ctx, cx - 22, cy - 28, 24, 6, 3);
  ctx.fillStyle = '#7A2A50';
  ctx.fill();
  // Snout
  ellipse(ctx, cx + 36, cy + 4, 11, 13);
  ctx.fillStyle = '#FF7FAF';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#C24D80';
  ctx.stroke();
  ctx.fillStyle = '#9C2D5F';
  ellipse(ctx, cx + 33, cy + 1, 2.4, 3.6);
  ctx.fill();
  ellipse(ctx, cx + 39, cy + 1, 2.4, 3.6);
  ctx.fill();
  // Cheek
  ellipse(ctx, cx + 16, cy + 10, 7, 4.5);
  ctx.fillStyle = 'rgba(255,90,140,0.45)';
  ctx.fill();
  // Eye
  if (o.hurt) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + 15, cy - 14);
    ctx.lineTo(cx + 25, cy - 4);
    ctx.moveTo(cx + 25, cy - 14);
    ctx.lineTo(cx + 15, cy - 4);
    ctx.stroke();
  } else if (o.blink || o.happy) {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (o.happy) ctx.arc(cx + 20, cy - 7, 6, Math.PI * 1.1, Math.PI * 1.9);
    else {
      ctx.moveTo(cx + 14, cy - 9);
      ctx.quadraticCurveTo(cx + 20, cy - 5, cx + 26, cy - 9);
    }
    ctx.stroke();
  } else {
    ellipse(ctx, cx + 20, cy - 9, 6, 8);
    ctx.fillStyle = PALETTE.ink;
    ctx.fill();
    ellipse(ctx, cx + 22, cy - 12, 2.2, 2.6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
  // Mouth
  ctx.beginPath();
  ctx.strokeStyle = '#9C2D5F';
  ctx.lineWidth = 2.5;
  if (o.hurt) {
    ctx.moveTo(cx + 18, cy + 20);
    ctx.quadraticCurveTo(cx + 24, cy + 15, cx + 30, cy + 20);
  } else {
    ctx.moveTo(cx + 19, cy + 15);
    ctx.quadraticCurveTo(cx + 25, cy + 21, cx + 31, cy + 15);
  }
  ctx.stroke();
  // Body highlight
  ellipse(ctx, cx - 14, cy - 12, 12, 6, -0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

// ---------------------------------------------------------------- debts

function drawPlane(ctx: CanvasRenderingContext2D, w: number, h: number, body: string, fold: string, edge: string) {
  const m = h / 2;
  // Upper wing
  ctx.beginPath();
  ctx.moveTo(w - 4, m);
  ctx.lineTo(6, 4);
  ctx.lineTo(26, m - 2);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = edge;
  ctx.stroke();
  // Lower wing (shaded fold)
  ctx.beginPath();
  ctx.moveTo(w - 4, m);
  ctx.lineTo(6, h - 4);
  ctx.lineTo(26, m + 2);
  ctx.closePath();
  ctx.fillStyle = fold;
  ctx.fill();
  ctx.stroke();
  // Keel
  ctx.beginPath();
  ctx.moveTo(w - 6, m);
  ctx.lineTo(22, m + 7);
  ctx.lineTo(30, m);
  ctx.closePath();
  ctx.fillStyle = edge;
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;
  // Printed "invoice" lines on the wing
  ctx.strokeStyle = edge;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(30 + i * 6, m - 6 - i * 3);
    ctx.lineTo(w - 26 - i * 8, m - 3 - i * 1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawBalloon(ctx: CanvasRenderingContext2D, w: number, h: number, light: string, mid: string, dark: string) {
  const cx = w / 2;
  const r = w / 2 - 4;
  ctx.beginPath();
  ctx.moveTo(cx, h - 14);
  ctx.bezierCurveTo(cx - r * 1.05, h - 34, cx - r, 4, cx, 4);
  ctx.bezierCurveTo(cx + r, 4, cx + r * 1.05, h - 34, cx, h - 14);
  ctx.fillStyle = radial(ctx, cx - r * 0.35, h * 0.3, 3, r * 1.6, [
    [0, light],
    [0.5, mid],
    [1, dark],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = dark;
  ctx.stroke();
  // Knot
  ctx.beginPath();
  ctx.moveTo(cx, h - 14);
  ctx.lineTo(cx - 6, h - 4);
  ctx.lineTo(cx + 6, h - 4);
  ctx.closePath();
  ctx.fillStyle = dark;
  ctx.fill();
  // Shine
  ellipse(ctx, cx - r * 0.4, h * 0.26, r * 0.18, r * 0.32, 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
}

// ---------------------------------------------------------------- buildings & props

function drawSafe(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Body
  rr(ctx, 8, 8, w - 16, h - 30, 22);
  ctx.fillStyle = linear(ctx, 0, 0, w, h, [
    [0, '#C9D3DE'],
    [0.5, PALETTE.steel],
    [1, PALETTE.steelDark],
  ]);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#3D4754';
  ctx.stroke();
  // Feet
  ctx.fillStyle = '#3D4754';
  rr(ctx, 26, h - 26, 38, 22, 6);
  ctx.fill();
  rr(ctx, w - 64, h - 26, 38, 22, 6);
  ctx.fill();
  // Rivets
  ctx.fillStyle = '#E6ECF2';
  for (const [x, y] of [
    [26, 26],
    [w - 26, 26],
    [26, h - 44],
    [w - 26, h - 44],
  ]) {
    ellipse(ctx, x, y, 5, 5);
    ctx.fill();
  }
  // Door
  const cx = w / 2;
  const cy = (h - 22) / 2 + 4;
  const r = Math.min(w, h) * 0.36;
  ellipse(ctx, cx, cy, r + 10, r + 10);
  ctx.fillStyle = '#4A5563';
  ctx.fill();
  ellipse(ctx, cx, cy, r, r);
  ctx.fillStyle = radial(ctx, cx - r * 0.3, cy - r * 0.3, 4, r * 1.3, [
    [0, '#E9EEF3'],
    [0.6, '#AAB6C3'],
    [1, '#6B7887'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#3D4754';
  ctx.stroke();
  // Bolt ring
  ctx.fillStyle = '#5B6878';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ellipse(ctx, cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12), 4, 4);
    ctx.fill();
  }
  // Hinges
  ctx.fillStyle = '#3D4754';
  rr(ctx, cx - r - 18, cy - 40, 14, 26, 4);
  ctx.fill();
  rr(ctx, cx - r - 18, cy + 14, 14, 26, 4);
  ctx.fill();
}

function drawWheel(ctx: CanvasRenderingContext2D, w: number) {
  const c = w / 2;
  ctx.strokeStyle = '#2E3640';
  ctx.lineWidth = 9;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8));
    ctx.lineTo(c - Math.cos(a) * (c - 8), c - Math.sin(a) * (c - 8));
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.gold;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ellipse(ctx, c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8), 7, 7);
    ctx.fill();
  }
  ellipse(ctx, c, c, 16, 16);
  ctx.fillStyle = radial(ctx, c - 4, c - 4, 1, 16, [
    [0, PALETTE.goldLight],
    [1, PALETTE.goldMid],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.stroke();
}

function drawBank(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const base = h - 40;
  // Steps
  for (let i = 0; i < 3; i++) {
    rr(ctx, 10 + i * 14, base + 12 - i * 14 + 14, w - 20 - i * 28, 14, 3);
    ctx.fillStyle = i % 2 ? '#E7DCCB' : '#D8CBB5';
    ctx.fill();
  }
  // Main block
  const top = 120;
  rr(ctx, 40, top, w - 80, base - top - 14, 6);
  ctx.fillStyle = linear(ctx, 0, top, 0, base, [
    [0, '#FFF6E6'],
    [1, '#EADBC2'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#B49C78';
  ctx.stroke();
  // Pediment
  ctx.beginPath();
  ctx.moveTo(20, top + 4);
  ctx.lineTo(w / 2, 16);
  ctx.lineTo(w - 20, top + 4);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 16, 0, top, [
    [0, '#FFF8EC'],
    [1, '#E9D9BD'],
  ]);
  ctx.fill();
  ctx.stroke();
  // Frieze
  rr(ctx, 26, top - 6, w - 52, 26, 4);
  ctx.fillStyle = '#E2CFAE';
  ctx.fill();
  ctx.stroke();
  // Emblem coin
  ellipse(ctx, w / 2, 78, 30, 30);
  ctx.fillStyle = radial(ctx, w / 2 - 8, 70, 2, 34, [
    [0, PALETTE.goldLight],
    [1, PALETTE.goldMid],
  ]);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = PALETTE.goldDark;
  ctx.stroke();
  euro(ctx, w / 2, 80, 34, PALETTE.goldDark);
  // Columns
  const cols = 6;
  const colW = 26;
  const span = w - 120;
  for (let i = 0; i < cols; i++) {
    const x = 60 + (span / (cols - 1)) * i - colW / 2;
    rr(ctx, x, top + 26, colW, base - top - 44, 6);
    ctx.fillStyle = linear(ctx, x, 0, x + colW, 0, [
      [0, '#F3E7D3'],
      [0.4, '#FFFFFF'],
      [1, '#D9C7A7'],
    ]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#B49C78';
    ctx.stroke();
    rr(ctx, x - 5, top + 20, colW + 10, 10, 3);
    ctx.fill();
    ctx.stroke();
  }
  // Door arch
  const dw = 96;
  const dx = w / 2 - dw / 2;
  ctx.beginPath();
  ctx.moveTo(dx, base - 14);
  ctx.lineTo(dx, top + 110);
  ctx.arc(w / 2, top + 110, dw / 2, Math.PI, 0);
  ctx.lineTo(dx + dw, base - 14);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, top + 60, 0, base, [
    [0, '#5B3A1E'],
    [1, '#3A2412'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#B49C78';
  ctx.stroke();
}

function drawCloud(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string) {
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
    [0, top],
    [1, bottom],
  ]);
  const puffs: [number, number, number][] = [
    [0.22, 0.62, 0.2],
    [0.4, 0.42, 0.28],
    [0.62, 0.38, 0.24],
    [0.8, 0.6, 0.18],
    [0.5, 0.68, 0.26],
  ];
  ctx.beginPath();
  for (const [x, y, r] of puffs) {
    ctx.moveTo(x * w + r * w, y * h);
    ctx.arc(x * w, y * h, r * w, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawTree(ctx: CanvasRenderingContext2D, w: number, h: number) {
  rr(ctx, w / 2 - 10, h * 0.55, 20, h * 0.45, 6);
  ctx.fillStyle = '#8B5E3C';
  ctx.fill();
  const blobs: [number, number, number, string][] = [
    [0.5, 0.42, 0.36, '#3FA34D'],
    [0.32, 0.5, 0.26, '#3FA34D'],
    [0.68, 0.5, 0.26, '#3FA34D'],
    [0.5, 0.3, 0.3, '#5BC45F'],
    [0.4, 0.38, 0.2, '#6CD06A'],
  ];
  for (const [x, y, r, c] of blobs) {
    ellipse(ctx, x * w, y * h, r * w, r * w * 0.95);
    ctx.fillStyle = c;
    ctx.fill();
  }
  ellipse(ctx, w * 0.42, h * 0.22, w * 0.1, w * 0.06, -0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
}

function drawPine(ctx: CanvasRenderingContext2D, w: number, h: number, c1: string, c2: string) {
  rr(ctx, w / 2 - 7, h * 0.78, 14, h * 0.22, 4);
  ctx.fillStyle = '#6B4A2E';
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const y = h * (0.1 + i * 0.22);
    const half = w * (0.26 + i * 0.12);
    ctx.beginPath();
    ctx.moveTo(w / 2, y);
    ctx.lineTo(w / 2 + half, y + h * 0.36);
    ctx.lineTo(w / 2 - half, y + h * 0.36);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? c2 : c1;
    ctx.fill();
  }
}

function drawRegister(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Display
  rr(ctx, w * 0.52, 4, w * 0.4, 34, 6);
  ctx.fillStyle = '#20403C';
  ctx.fill();
  rr(ctx, w * 0.55, 9, w * 0.34, 22, 4);
  ctx.fillStyle = '#7CF5C8';
  ctx.fill();
  // Body
  ctx.beginPath();
  ctx.moveTo(10, h - 34);
  ctx.lineTo(28, 40);
  ctx.lineTo(w - 12, 40);
  ctx.lineTo(w - 6, h - 34);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 40, 0, h, [
    [0, '#4FE0D2'],
    [1, '#1E9E92'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#126B63';
  ctx.stroke();
  // Keys
  ctx.fillStyle = '#E8FFFB';
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      rr(ctx, 40 + c * 22 + r * 6, 52 + r * 20, 16, 12, 3);
      ctx.fill();
    }
  // Drawer
  rr(ctx, 4, h - 36, w - 8, 32, 6);
  ctx.fillStyle = '#167A71';
  ctx.fill();
  ctx.stroke();
  rr(ctx, w / 2 - 18, h - 24, 36, 8, 4);
  ctx.fillStyle = PALETTE.gold;
  ctx.fill();
}

function drawWheelbarrow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Handle
  ctx.strokeStyle = '#8B5E3C';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(8, 22);
  ctx.lineTo(w * 0.3, h * 0.42);
  ctx.stroke();
  // Leg
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.32, h * 0.62);
  ctx.lineTo(w * 0.28, h - 4);
  ctx.stroke();
  // Tray
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.22);
  ctx.lineTo(w - 6, h * 0.22);
  ctx.lineTo(w * 0.8, h * 0.72);
  ctx.lineTo(w * 0.32, h * 0.72);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, h * 0.22, 0, h * 0.72, [
    [0, '#FF6B7D'],
    [1, '#C9283F'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#7E1426';
  ctx.stroke();
  rr(ctx, w * 0.16, h * 0.17, w * 0.84 - 4, 9, 4);
  ctx.fillStyle = '#E04257';
  ctx.fill();
  ctx.stroke();
}

function drawCrate(ctx: CanvasRenderingContext2D, w: number, h: number, label: string) {
  rr(ctx, 4, 4, w - 8, h - 8, 6);
  ctx.fillStyle = linear(ctx, 0, 0, 0, h, [
    [0, '#E0A96D'],
    [1, '#B27740'],
  ]);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#6E4320';
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(w - 8, h - 8);
  ctx.moveTo(w - 8, 8);
  ctx.lineTo(8, h - 8);
  ctx.stroke();
  rr(ctx, 8, h / 2 - 15, w - 16, 30, 5);
  ctx.fillStyle = '#FF4D5E';
  ctx.fill();
  ctx.font = '700 22px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, w / 2, h / 2 + 1);
}

function drawHeart(ctx: CanvasRenderingContext2D, w: number, h: number, fill: string, stroke: string, shine: boolean) {
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 4);
  ctx.bezierCurveTo(-4, h * 0.5, w * 0.12, -2, w / 2, h * 0.26);
  ctx.bezierCurveTo(w * 0.88, -2, w + 4, h * 0.5, w / 2, h - 4);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  if (shine) {
    ellipse(ctx, w * 0.3, h * 0.3, w * 0.1, h * 0.07, -0.6);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
  }
}

function drawStar(ctx: CanvasRenderingContext2D, w: number, h: number, points: number, inner: number, fill: string | CanvasGradient, stroke?: string) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 3;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? R * inner : R;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- registry

export function createTextures(scene: Phaser.Scene) {
  tex(scene, 'coin', 56, 56, (c, w) => drawCoin(c, w));
  tex(scene, 'coin-sm', 30, 30, (c, w) => drawCoin(c, w));
  tex(scene, 'bill', 92, 52, (c) => drawBill(c, 4, 4, 84, 44));
  tex(scene, 'bills', 100, 70, (c) => {
    drawBill(c, 10, 18, 84, 44);
    drawBill(c, 4, 10, 84, 44);
    drawBill(c, 8, 2, 84, 44);
    rr(c, 40, 0, 16, 56, 3);
    c.fillStyle = '#F2E2BF';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#B49C78';
    c.stroke();
  });
  tex(scene, 'bag', 88, 96, drawBag);

  const pigW = 120;
  const pigH = 104;
  tex(scene, 'pig', pigW, pigH, (c, w, h) => drawPig(c, w, h, {}));
  tex(scene, 'pig-blink', pigW, pigH, (c, w, h) => drawPig(c, w, h, { blink: true }));
  tex(scene, 'pig-walk1', pigW, pigH, (c, w, h) => drawPig(c, w, h, { legs: 1 }));
  tex(scene, 'pig-walk2', pigW, pigH, (c, w, h) => drawPig(c, w, h, { legs: 2 }));
  tex(scene, 'pig-happy', pigW, pigH, (c, w, h) => drawPig(c, w, h, { happy: true }));
  tex(scene, 'pig-hurt', pigW, pigH, (c, w, h) => drawPig(c, w, h, { hurt: true }));
  tex(scene, 'pig-fly1', pigW, pigH, (c, w, h) => drawPig(c, w, h, { wings: 1, legs: 1 }));
  tex(scene, 'pig-fly2', pigW, pigH, (c, w, h) => drawPig(c, w, h, { wings: 2, legs: 2 }));
  tex(scene, 'pig-fly-hurt', pigW, pigH, (c, w, h) => drawPig(c, w, h, { wings: 2, hurt: true }));

  tex(scene, 'plane-white', 100, 60, (c, w, h) => drawPlane(c, w, h, '#FFFFFF', '#DCE3EE', '#7D8AA3'));
  tex(scene, 'plane-orange', 100, 60, (c, w, h) => drawPlane(c, w, h, '#FFE0B8', '#FFB866', '#C26A12'));
  tex(scene, 'plane-red', 100, 60, (c, w, h) => drawPlane(c, w, h, '#FFC2C8', '#FF6B7A', '#A3122A'));

  const balloons: [string, string, string, string][] = [
    ['blue', '#B8E1FF', '#4DA8FF', '#1F5FA8'],
    ['green', '#C9F7C3', '#5BD16A', '#25803A'],
    ['purple', '#E2CCFF', '#9B6BFF', '#5427A8'],
    ['orange', '#FFE0B8', '#FF9F43', '#B65A0C'],
    ['red', '#FFC2C8', '#FF4D5E', '#9C1028'],
    ['gold', '#FFF3B0', '#FFD54A', '#B87A00'],
  ];
  for (const [name, l, m, d] of balloons) tex(scene, `balloon-${name}`, 76, 100, (c, w, h) => drawBalloon(c, w, h, l, m, d));

  tex(scene, 'safe', 280, 300, drawSafe);
  tex(scene, 'safe-wheel', 120, 120, (c, w) => drawWheel(c, w));
  tex(scene, 'bank', 560, 440, drawBank);
  tex(scene, 'register', 170, 140, drawRegister);
  tex(scene, 'barrow', 170, 90, drawWheelbarrow);
  tex(scene, 'wheel', 46, 46, (c, w) => {
    ellipse(c, w / 2, w / 2, w / 2 - 3, w / 2 - 3);
    c.fillStyle = '#2E3640';
    c.fill();
    ellipse(c, w / 2, w / 2, w / 2 - 10, w / 2 - 10);
    c.fillStyle = '#9AA6B4';
    c.fill();
    c.strokeStyle = '#2E3640';
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * 12, w / 2 + Math.sin(a) * 12);
      c.lineTo(w / 2 - Math.cos(a) * 12, w / 2 - Math.sin(a) * 12);
      c.stroke();
    }
  });
  tex(scene, 'crate-es', 76, 76, (c, w, h) => drawCrate(c, w, h, 'IVA'));
  tex(scene, 'crate-en', 76, 76, (c, w, h) => drawCrate(c, w, h, 'VAT'));

  tex(scene, 'cloud', 280, 130, (c, w, h) => drawCloud(c, w, h, '#FFFFFF', '#E3EEFA'));
  tex(scene, 'cloud-dusk', 280, 130, (c, w, h) => drawCloud(c, w, h, '#FFE3D1', '#F7A98B'));
  tex(scene, 'storm', 320, 150, (c, w, h) => drawCloud(c, w, h, '#6B6688', '#3A3552'));
  tex(scene, 'bolt', 44, 96, (c) => {
    c.beginPath();
    c.moveTo(26, 2);
    c.lineTo(6, 52);
    c.lineTo(22, 52);
    c.lineTo(14, 94);
    c.lineTo(40, 36);
    c.lineTo(24, 36);
    c.lineTo(34, 2);
    c.closePath();
    c.fillStyle = '#FFE45C';
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#F59E0B';
    c.stroke();
  });
  tex(scene, 'tree', 150, 210, drawTree);
  tex(scene, 'pine', 110, 210, (c, w, h) => drawPine(c, w, h, '#2F8F4E', '#3FA35E'));
  tex(scene, 'pine-dark', 110, 210, (c, w, h) => drawPine(c, w, h, '#3C3457', '#4A4068'));
  tex(scene, 'bush', 130, 64, (c, w, h) => {
    for (const [x, y, r, col] of [
      [0.25, 0.65, 0.22, '#3FA34D'],
      [0.5, 0.5, 0.3, '#4DB85A'],
      [0.75, 0.65, 0.22, '#3FA34D'],
    ] as const) {
      ellipse(c, x * w, y * h, r * w, r * w * 0.8);
      c.fillStyle = col;
      c.fill();
    }
  });

  tex(scene, 'dot', 32, 32, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, 0, w / 2, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    c.fillRect(0, 0, w, w);
  });
  tex(scene, 'glow', 256, 256, (c, w) => {
    c.fillStyle = radial(c, w / 2, w / 2, 0, w / 2, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.3, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    c.fillRect(0, 0, w, w);
  });
  tex(scene, 'spark', 40, 40, (c, w, h) => drawStar(c, w, h, 4, 0.28, '#FFFFFF'));
  tex(scene, 'star', 56, 56, (c, w, h) =>
    drawStar(c, w, h, 5, 0.48, radial(c, w / 2 - 6, h / 2 - 6, 2, 30, [[0, PALETTE.goldLight], [1, PALETTE.goldMid]]), PALETTE.goldDark),
  );
  tex(scene, 'star-off', 56, 56, (c, w, h) => drawStar(c, w, h, 5, 0.48, 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.35)'));
  tex(scene, 'confetti', 12, 18, (c, w, h) => {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, w, h);
  });
  tex(scene, 'shred', 18, 14, (c, w, h) => {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(w, h / 2);
    c.lineTo(2, h);
    c.closePath();
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.strokeStyle = '#AAB3C5';
    c.lineWidth = 1.5;
    c.stroke();
  });
  tex(scene, 'ring', 128, 128, (c, w) => {
    ellipse(c, w / 2, w / 2, w / 2 - 6, w / 2 - 6);
    c.lineWidth = 8;
    c.strokeStyle = '#FFFFFF';
    c.stroke();
  });
  tex(scene, 'heart', 48, 44, (c, w, h) => drawHeart(c, w, h, '#FF4D6D', '#A3122A', true));
  tex(scene, 'heart-empty', 48, 44, (c, w, h) => drawHeart(c, w, h, 'rgba(0,0,0,0.25)', 'rgba(255,255,255,0.5)', false));
  tex(scene, 'clock', 60, 66, (c, w) => {
    rr(c, w / 2 - 7, 2, 14, 10, 3);
    c.fillStyle = '#5B6878';
    c.fill();
    ellipse(c, w / 2, 38, 26, 26);
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.lineWidth = 5;
    c.strokeStyle = PALETTE.teal;
    c.stroke();
    c.strokeStyle = PALETTE.ink;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(w / 2, 38);
    c.lineTo(w / 2, 22);
    c.moveTo(w / 2, 38);
    c.lineTo(w / 2 + 11, 42);
    c.stroke();
  });
  tex(scene, 'magnet', 64, 64, (c) => {
    c.lineWidth = 16;
    c.strokeStyle = '#FF4D5E';
    c.beginPath();
    c.arc(32, 30, 18, Math.PI, 0, true);
    c.stroke();
    c.fillStyle = '#E6ECF2';
    c.fillRect(6, 24, 16, 14);
    c.fillRect(42, 24, 16, 14);
  });
  tex(scene, 'lock', 64, 78, (c, w, h) => {
    c.lineWidth = 9;
    c.strokeStyle = '#8D99A8';
    c.beginPath();
    c.arc(w / 2, 30, 17, Math.PI, 0);
    c.lineTo(w / 2 + 17, 38);
    c.moveTo(w / 2 - 17, 38);
    c.lineTo(w / 2 - 17, 30);
    c.stroke();
    rr(c, 6, 34, w - 12, h - 38, 8);
    c.fillStyle = radial(c, w / 2 - 8, 44, 2, 40, [[0, PALETTE.goldLight], [1, PALETTE.goldMid]]);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = PALETTE.goldDark;
    c.stroke();
    ellipse(c, w / 2, 52, 6, 6);
    c.fillStyle = PALETTE.ink;
    c.fill();
    c.fillRect(w / 2 - 2.5, 54, 5, 12);
  });
  tex(scene, 'flag-gold', 70, 110, (c) => {
    c.fillStyle = '#6B4A2E';
    c.fillRect(6, 4, 6, 104);
    c.beginPath();
    c.moveTo(12, 8);
    c.quadraticCurveTo(40, 0, 66, 14);
    c.quadraticCurveTo(40, 26, 12, 46);
    c.closePath();
    c.fillStyle = PALETTE.gold;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = PALETTE.goldDark;
    c.stroke();
    euro(c, 34, 22, 22, PALETTE.goldDark);
  });
  tex(scene, 'flag-red', 70, 110, (c) => {
    c.fillStyle = '#3A2E4F';
    c.fillRect(6, 4, 6, 104);
    c.beginPath();
    c.moveTo(12, 8);
    c.quadraticCurveTo(40, 0, 66, 14);
    c.quadraticCurveTo(40, 26, 12, 46);
    c.closePath();
    c.fillStyle = PALETTE.red;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = '#8C1027';
    c.stroke();
    c.font = '700 24px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#FFFFFF';
    c.fillText('!', 34, 24);
  });
  tex(scene, 'hook', 40, 40, (c) => {
    c.strokeStyle = '#5B6878';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(20, 4);
    c.lineTo(20, 26);
    c.moveTo(20, 26);
    c.quadraticCurveTo(6, 30, 6, 16);
    c.moveTo(20, 26);
    c.quadraticCurveTo(34, 30, 34, 16);
    c.stroke();
    ellipse(c, 20, 6, 5, 5);
    c.fillStyle = PALETTE.gold;
    c.fill();
  });
  tex(scene, 'crosshair', 80, 80, (c, w) => {
    c.strokeStyle = '#FFFFFF';
    c.lineWidth = 5;
    ellipse(c, w / 2, w / 2, 26, 26);
    c.stroke();
    c.beginPath();
    for (const [x0, y0, x1, y1] of [
      [w / 2, 4, w / 2, 22],
      [w / 2, w - 4, w / 2, w - 22],
      [4, w / 2, 22, w / 2],
      [w - 4, w / 2, w - 22, w / 2],
    ]) {
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
    }
    c.stroke();
    c.strokeStyle = PALETTE.red;
    c.lineWidth = 2.5;
    ellipse(c, w / 2, w / 2, 26, 26);
    c.stroke();
  });
  tex(scene, 'sign', 240, 96, (c, w, h) => {
    c.fillStyle = '#7A5230';
    c.fillRect(w / 2 - 8, h - 30, 16, 30);
    rr(c, 4, 4, w - 8, h - 30, 10);
    c.fillStyle = linear(c, 0, 0, 0, h, [[0, '#D9A066'], [1, '#B07A40']]);
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = '#6E4320';
    c.stroke();
  });
  tex(scene, 'bird1', 44, 24, (c) => {
    c.strokeStyle = '#2B2440';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(2, 8);
    c.quadraticCurveTo(12, 2, 22, 14);
    c.quadraticCurveTo(32, 2, 42, 8);
    c.stroke();
  });
  tex(scene, 'bird2', 44, 24, (c) => {
    c.strokeStyle = '#2B2440';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(2, 18);
    c.quadraticCurveTo(12, 10, 22, 12);
    c.quadraticCurveTo(32, 10, 42, 18);
    c.stroke();
  });
  tex(scene, 'post', 26, 140, (c, w, h) => {
    rr(c, 2, 0, w - 4, h, 6);
    c.fillStyle = linear(c, 0, 0, w, 0, [[0, '#9A6A40'], [1, '#6E4320']]);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 20; y < h; y += 30) c.fillRect(2, y, w - 4, 3);
  });
}

/** Paper airplane texture key by urgency. */
export function planeKey(daysToDue: number | null): string {
  if (daysToDue !== null && daysToDue < 0) return 'plane-red';
  if (daysToDue !== null && daysToDue <= 7) return 'plane-orange';
  return 'plane-white';
}
