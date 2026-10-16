import { audioContext } from './sfx';
import { loadSettings } from '../data/store';

/**
 * A tiny chiptune step sequencer on WebAudio: bass, arpeggio, lead, pad and drums,
 * scheduled ahead of time so it stays tight even when the game hitches.
 */

type Chord = [root: number, quality: 'maj' | 'min'];
type Note = [step: number, offset: number, len: number];

interface SongDef {
  bpm: number;
  key: number; // MIDI note of the key's root in the bass octave
  chords: Chord[]; // one per bar
  kick: string; // 16 chars per bar, x = hit
  snare: string;
  hat: string;
  bass: string; // r = root, o = octave, f = fifth, . = rest
  arp: string; // 0-3 = chord tone index (3 = root an octave up), . = rest
  arpOctave: number;
  lead?: Note[][]; // per bar, offsets from key + 24
  bassWave: OscillatorType;
  arpWave: OscillatorType;
  leadWave?: OscillatorType;
  pad?: boolean;
  arpGain?: number;
}

export type SongId = 'title' | 'world' | 'rush' | 'dodge' | 'balloon';

const SONGS: Record<SongId, SongDef> = {
  title: {
    bpm: 96,
    key: 38, // D
    chords: [[0, 'maj'], [4, 'min'], [5, 'maj'], [7, 'maj']],
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    bass: 'r.....r.f...r...',
    arp: '0.1.2.3.2.1.2.1.',
    arpOctave: 24,
    bassWave: 'triangle',
    arpWave: 'square',
    pad: true,
    arpGain: 0.05,
  },
  world: {
    bpm: 108,
    key: 36, // C
    chords: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']],
    kick: 'x.....x.x.......',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    bass: 'r.....r.o...f...',
    arp: '0...1...2...1...',
    arpOctave: 24,
    lead: [
      [[0, 4, 2], [2, 7, 2], [4, 9, 2], [6, 7, 4], [12, 4, 2], [14, 2, 2]],
      [[0, 2, 4], [4, 7, 2], [6, 11, 2], [8, 7, 4], [12, 2, 4]],
      [[0, 0, 2], [2, 4, 2], [4, 9, 4], [8, 12, 4], [12, 9, 2], [14, 7, 2]],
      [[0, 5, 4], [4, 9, 2], [6, 12, 2], [8, 9, 4], [12, 7, 4]],
    ],
    bassWave: 'triangle',
    arpWave: 'square',
    leadWave: 'square',
    arpGain: 0.035,
  },
  rush: {
    bpm: 142,
    key: 41, // F
    chords: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']],
    kick: 'x...x...x...x...',
    snare: '....x.......x..x',
    hat: 'xxx.xxx.xxx.xxx.',
    bass: 'r.o.r.o.r.o.f.o.',
    arp: '0123210301232103',
    arpOctave: 24,
    lead: [
      [[0, 12, 3], [3, 16, 3], [6, 19, 2], [8, 16, 4], [12, 14, 4]],
      [[0, 17, 3], [3, 16, 3], [6, 14, 2], [8, 12, 8]],
      [[0, 14, 3], [3, 19, 3], [6, 23, 2], [8, 19, 4], [12, 17, 4]],
      [[0, 17, 3], [3, 16, 3], [6, 14, 2], [8, 12, 4], [12, 9, 4]],
    ],
    bassWave: 'square',
    arpWave: 'square',
    leadWave: 'sawtooth',
    arpGain: 0.03,
  },
  dodge: {
    bpm: 128,
    key: 45, // A minor
    chords: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']],
    kick: 'x..x..x.x..x..x.',
    snare: '....x.......x...',
    hat: 'x.xxx.xxx.xxx.xx',
    bass: 'r.rr.rr.r.rr.ro.',
    arp: '0120120120120123',
    arpOctave: 12,
    lead: [
      [[0, 12, 6], [6, 15, 2], [8, 14, 6], [14, 12, 2]],
      [[0, 11, 8], [8, 8, 8]],
      [[0, 10, 6], [6, 12, 2], [8, 15, 6], [14, 14, 2]],
      [[0, 14, 8], [8, 7, 8]],
    ],
    bassWave: 'sawtooth',
    arpWave: 'square',
    leadWave: 'triangle',
    arpGain: 0.03,
  },
  balloon: {
    bpm: 118,
    key: 43, // G
    chords: [[0, 'maj'], [9, 'min'], [2, 'min'], [7, 'maj']],
    kick: 'x.......x.x.....',
    snare: '....x.......x...',
    hat: 'x..x..x.x..x..x.',
    bass: 'r...f...o...f.r.',
    arp: '0.2.1.3.0.2.1.3.',
    arpOctave: 24,
    lead: [
      [[0, 7, 2], [3, 9, 1], [4, 11, 2], [8, 14, 2], [11, 12, 1], [12, 11, 4]],
      [[0, 9, 2], [3, 12, 1], [4, 16, 2], [8, 12, 2], [11, 11, 1], [12, 9, 4]],
      [[0, 9, 2], [3, 12, 1], [4, 14, 2], [8, 17, 2], [11, 16, 1], [12, 14, 4]],
      [[0, 14, 2], [3, 12, 1], [4, 11, 2], [8, 9, 2], [10, 7, 2], [12, 6, 4]],
    ],
    bassWave: 'triangle',
    arpWave: 'square',
    leadWave: 'square',
    arpGain: 0.03,
  },
};

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

class Sequencer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private songGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private song: SongDef | null = null;
  private songId: SongId | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private intensity = 0; // extra layers in tense moments (0..1)

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = audioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolume();
    window.addEventListener('hq:settings', () => this.applyVolume());
    return ctx;
  }

  applyVolume() {
    if (!this.master || !this.ctx) return;
    const s = loadSettings();
    const v = s.muted || !s.musicOn ? 0 : 0.55 * s.volume;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08);
  }

  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  play(id: SongId) {
    const ctx = this.ensure();
    if (this.songId === id) return;
    const old = this.songGain;
    if (old) {
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setTimeout(() => old.disconnect(), 1500);
    }
    this.songId = id;
    this.song = SONGS[id];
    this.songGain = ctx.createGain();
    this.songGain.gain.value = 0;
    this.songGain.gain.setTargetAtTime(1, ctx.currentTime + 0.05, 0.25);
    this.songGain.connect(this.master!);
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.intensity = 0;
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.songGain && this.ctx) this.songGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    this.songId = null;
    this.song = null;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    const ctx = this.ctx;
    const song = this.song;
    if (!ctx || !song || ctx.state !== 'running') {
      if (ctx) this.nextTime = ctx.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / song.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(song, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (16 * song.chords.length);
    }
  }

  private scheduleStep(song: SongDef, step: number, t: number, dur: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const [root, quality] = song.chords[bar];
    const tones = quality === 'maj' ? [0, 4, 7, 12] : [0, 3, 7, 12];
    const out = this.songGain!;

    if (song.kick[s] === 'x') this.kick(t, out);
    if (song.snare[s] === 'x') this.snare(t, out);
    if (song.hat[s] === 'x' || (this.intensity > 0.5 && s % 2 === 1)) this.hat(t, out, s % 4 === 0 ? 0.05 : 0.03);

    const b = song.bass[s];
    if (b && b !== '.') {
      const off = b === 'o' ? 12 : b === 'f' ? 7 : 0;
      this.tone(song.bassWave, midiToHz(song.key + root + off), t, dur * 1.8, 0.16, out, 900);
    }
    const a = song.arp[s];
    if (a && a !== '.') {
      const note = song.key + song.arpOctave + root + tones[Number(a)];
      this.tone(song.arpWave, midiToHz(note), t, dur * 0.9, song.arpGain ?? 0.04, out, 2600);
    }
    if (song.lead && song.leadWave) {
      for (const [ns, off, len] of song.lead[bar]) {
        if (ns === s) this.tone(song.leadWave, midiToHz(song.key + 24 + off), t, dur * len * 0.92, 0.06, out, 3200, true);
      }
    }
    if (song.pad && s === 0) {
      for (const tone of tones.slice(0, 3)) {
        this.tone('sawtooth', midiToHz(song.key + 12 + root + tone), t, dur * 15, 0.022, out, 700, false, 0.4);
      }
    }
  }

  private tone(
    type: OscillatorType,
    freq: number,
    t: number,
    len: number,
    gain: number,
    out: AudioNode,
    cutoff: number,
    vibrato = false,
    attack = 0.005,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (vibrato && len > 0.2) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 5.5;
      lfoGain.gain.value = freq * 0.008;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t + 0.12);
      lfo.stop(t + len + 0.1);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(gain * 0.6, t + attack, 0.08);
    g.gain.setTargetAtTime(0, t + len, 0.03);
    osc.connect(filter).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + len + 0.25);
  }

  private kick(t: number, out: AudioNode) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private noiseHit(t: number, out: AudioNode, type: BiquadFilterType, freq: number, gain: number, len: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + len + 0.02);
  }

  private snare(t: number, out: AudioNode) {
    this.noiseHit(t, out, 'highpass', 1200, 0.18, 0.14);
    this.tone('triangle', 190, t, 0.06, 0.08, out, 2000);
  }

  private hat(t: number, out: AudioNode, gain: number) {
    this.noiseHit(t, out, 'highpass', 7500, gain, 0.035);
  }
}

export const music = new Sequencer();
