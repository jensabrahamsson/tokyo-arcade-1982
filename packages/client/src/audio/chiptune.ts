import { chiptune, noteFreq, type SfxDef } from '@arkad/core';
import type { SfxName, SfxEvent } from '@arkad/core';

const MASTER = 0.16;

/** 1982-ish two-voice synth on the Web Audio API. */
export class Chiptune {
  private ctx: AudioContext | null = null;
  private master = 1;

  /** operator volume detent / mute (R23): output gain only */
  setMaster(v: number): void {
    this.master = Math.min(1, Math.max(0, v));
  }

  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  unlock(): void {
    this.ensure();
  }

  play(name: SfxName): void {
    if (!Object.hasOwn(chiptune, name)) return;
    const def = chiptune[name];
    if (def) this.playDef(def);
  }

  playEvents(events: SfxEvent[]): void {
    for (const e of events) this.play(e.name);
  }

  private playDef(def: SfxDef): void {
    const ctx = this.ensure();
    if (!ctx) return;
    let t = ctx.currentTime + 0.01;
    const vol = (def.volume ?? 1) * MASTER * this.master;
    for (const note of def.notes) {
      const freq = noteFreq(note);
      if (def.wave === 'noise') this.noise(ctx, t, def.stepMs / 1000, vol);
      else if (freq > 0) this.tone(ctx, t, def, freq);
      t += def.stepMs / 1000;
    }
  }

  private tone(ctx: AudioContext, t: number, def: SfxDef, freq: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = def.wave === 'triangle' ? 'triangle' : 'square';
    osc.frequency.value = freq;
    const dur = (def.stepMs / 1000) * 0.9;
    gain.gain.setValueAtTime((def.volume ?? 1) * MASTER * this.master, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  private noise(ctx: AudioContext, t: number, dur: number, vol: number): void {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t);
  }
}
