import type { Sfx } from './game.ts';

/** Tiny synthesized sound set: no audio files to load. */
export class Synth implements Sfx {
  muted = false;
  private ctx: AudioContext | null = null;

  /** Browsers only allow audio after a user gesture, so call this from input handlers. */
  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    else if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  latch(): void {
    this.tone(320, 520, 0.09, 'triangle', 0.12);
  }
  release(): void {
    this.tone(620, 240, 0.16, 'sawtooth', 0.07);
  }
  pickup(): void {
    this.tone(660, 660, 0.08, 'square', 0.09);
    this.tone(990, 990, 0.14, 'square', 0.09, 0.08);
  }
  alarm(): void {
    for (let i = 0; i < 3; i++) this.tone(880, 620, 0.18, 'square', 0.07, 0.15 + i * 0.22);
  }
  gateOpen(): void {
    this.tone(392, 392, 0.12, 'triangle', 0.1, 0.2);
    this.tone(523, 523, 0.12, 'triangle', 0.1, 0.32);
    this.tone(784, 784, 0.25, 'triangle', 0.1, 0.44);
  }
  boom(): void {
    this.noise(0.35, 0.2);
  }
  dead(): void {
    this.noise(0.6, 0.28);
    this.tone(300, 50, 0.6, 'sawtooth', 0.12);
  }
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.11, i * 0.1));
  }

  private tone(
    from: number,
    to: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = vol;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
}
