declare module 'zzfx' {
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    play(...params: (number | undefined)[]): AudioBufferSourceNode;
    playSamples(channels: number[][], volumeScale?: number, rate?: number, pan?: number, loop?: boolean): AudioBufferSourceNode;
    buildSamples(...params: (number | undefined)[]): number[];
  };
  export function zzfx(...params: (number | undefined)[]): AudioBufferSourceNode;
}
