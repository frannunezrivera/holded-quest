import { ZZFX } from 'zzfx';
import { loadSettings } from '../data/store';

// ZzFX parameter lists: [volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
//  slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay,
//  sustainVolume, decay, tremolo, filter]
const SOUNDS = {
  coin: [0.6, 0.05, 1675, 0, 0.03, 0.2, 1, 1.8, 0, 0, 837, 0.05],
  coinBig: [0.8, 0.05, 1200, 0, 0.05, 0.35, 1, 1.5, 0, 0, 600, 0.06, 0, 0, 0, 0, 0.05, 0.8],
  jump: [0.45, 0.05, 260, 0.01, 0.04, 0.12, 0, 1.4, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0.6],
  land: [0.35, 0.1, 90, 0, 0.01, 0.06, 4, 1, 0, 0, 0, 0, 0, 0.6],
  step: [0.12, 0.2, 140, 0, 0, 0.03, 4, 1, 0, 0, 0, 0, 0, 0.8],
  select: [0.4, 0, 880, 0, 0.02, 0.06, 1, 2, 0, 0, 440, 0.03],
  hover: [0.15, 0, 1400, 0, 0.01, 0.03, 1, 2],
  open: [0.5, 0, 420, 0.01, 0.06, 0.18, 1, 1.5, 0, 0, 280, 0.06],
  close: [0.4, 0, 520, 0.01, 0.04, 0.14, 1, 1.5, 0, 0, -200, 0.05],
  deposit: [0.9, 0.02, 523, 0.01, 0.1, 0.45, 1, 1.4, 0, 0, 262, 0.07, 0.07, 0, 0, 0, 0, 0.8],
  hit: [0.9, 0.1, 160, 0, 0.06, 0.5, 4, 2.2, -2, 0, 0, 0, 0, 0.9, 0, 0.3],
  whoosh: [0.5, 0.1, 300, 0.03, 0.04, 0.2, 4, 0.5, 6, 0, 0, 0, 0, 1.2],
  nearMiss: [0.45, 0, 1320, 0, 0.02, 0.12, 1, 2, 0, 0, 660, 0.04],
  powerup: [0.6, 0.02, 520, 0.02, 0.12, 0.3, 1, 1.6, -4, 4.5, 0, 0, 0.08],
  iva: [0.7, 0.05, 220, 0.01, 0.12, 0.35, 2, 1.3, -6, 0, 0, 0, 0, 0.3, 0, 0.2],
  pop: [0.6, 0.1, 600, 0, 0, 0.08, 4, 1, 0, 0, 0, 0, 0, 2],
  sad: [0.6, 0, 330, 0.05, 0.3, 0.5, 2, 1, -1.2, 0, 0, 0, 0, 0, 3, 0, 0, 0.6],
  hook: [0.4, 0.05, 900, 0, 0.03, 0.1, 3, 1, -30, 0, 0, 0, 0, 0.2],
  reel: [0.3, 0, 300, 0, 0.15, 0.1, 1, 1, 12, 0, 0, 0, 0.04],
  levelUp: [0.8, 0, 392, 0.02, 0.2, 0.5, 1, 1.4, 0, 0, 196, 0.1, 0.1, 0, 0, 0, 0, 0.7],
  countdown: [0.5, 0, 660, 0, 0.06, 0.12, 1, 1],
  go: [0.6, 0, 990, 0, 0.12, 0.3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.05],
  fanfare: [0.8, 0, 523, 0.02, 0.25, 0.5, 1, 1.2, 0, 0, 262, 0.12, 0.12, 0, 0, 0, 0, 0.75],
  paid: [0.6, 0, 700, 0.01, 0.08, 0.3, 1, 1.6, 0, 0, 350, 0.05, 0, 0, 0, 0, 0.04],
  full: [0.4, 0, 200, 0, 0.05, 0.08, 2, 1, 0, 0, 0, 0, 0.06],
} as const satisfies Record<string, readonly number[]>;

export type SoundId = keyof typeof SOUNDS;

const cache = new Map<string, number[][]>();

export const audioContext = (): AudioContext => ZZFX.audioContext as AudioContext;

/** Browsers start audio suspended until a user gesture. */
export function unlockAudio() {
  const ctx = audioContext();
  if (ctx.state !== 'running') void ctx.resume();
}

export function sfx(id: SoundId, opts: { pitch?: number; volume?: number; pan?: number } = {}) {
  const s = loadSettings();
  // One switch for all audio: effects play only while sound is on (it starts off).
  if (!s.music || s.muted || s.volume <= 0) return;
  const ctx = audioContext();
  if (ctx.state !== 'running') return;
  const key = `${id}:${opts.pitch ?? 1}`;
  let samples = cache.get(key);
  if (!samples) {
    const params = [...SOUNDS[id]] as number[];
    params[1] = 0; // cache deterministic samples; variety comes from pitch
    if (opts.pitch) params[2] *= opts.pitch;
    samples = [ZZFX.buildSamples(...params)];
    if (cache.size > 200) cache.clear();
    cache.set(key, samples);
  }
  ZZFX.volume = 0.35 * s.volume;
  ZZFX.playSamples(samples, opts.volume ?? 1, 1, opts.pan ?? 0);
}
