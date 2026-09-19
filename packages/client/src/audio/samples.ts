/**
 * MP3 sample player (attract/splash music + voice stingers) on the Web Audio
 * API. Chiptune stays the game's own voice; this is the hall's soundtrack.
 * Fail-closed by design: a missing or undecodable file simply stays silent,
 * and a suspended AudioContext (autoplay policy) never throws.
 */

const MUSIC_GAIN = 0.5; // soundtrack sits under the chiptune sfx bus

export class Samples {
  private ctx: AudioContext | null = null;
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private master = 1;
  private loopGain: GainNode | null = null;
  private loopSrc: AudioBufferSourceNode | null = null;
  private loopUrl = '';
  private loopWant = false;
  private loopPending = false;

  /** operator volume detent / mute (R23) — output gain only, never playback state */
  setMaster(v: number): void {
    this.master = Math.min(1, Math.max(0, v));
    if (this.loopGain && this.ctx) this.loopGain.gain.setValueAtTime(this.master * MUSIC_GAIN, this.ctx.currentTime);
  }

  private ensure(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /** call from a user gesture; also retries a pending loop after autoplay block */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && this.loopWant && !this.loopSrc) void this.startLoop(this.loopUrl);
  }

  private load(url: string): Promise<AudioBuffer | null> {
    const hit = this.cache.get(url);
    if (hit) return hit;
    const p = (async () => {
      const ctx = this.ensure();
      if (!ctx) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    })();
    this.cache.set(url, p);
    return p;
  }

  /** idempotent: starting the track that is already looping (or loading) does nothing */
  async startLoop(url: string): Promise<void> {
    if (!url || this.loopPending) return;
    if (this.loopSrc && this.loopUrl === url) return;
    this.stopLoop();
    this.loopWant = true;
    this.loopUrl = url;
    this.loopPending = true;
    try {
      const ctx = this.ensure();
      if (!ctx) return;
      const buf = await this.load(url);
      if (!buf || this.loopUrl !== url || !this.loopWant) return; // switched or cancelled while loading
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = this.master * MUSIC_GAIN;
      src.connect(gain).connect(ctx.destination);
      src.start();
      this.loopSrc = src;
      this.loopGain = gain;
    } finally {
      this.loopPending = false;
    }
  }

  stopLoop(): void {
    this.loopWant = false;
    this.loopPending = false;
    const src = this.loopSrc;
    this.loopSrc = null;
    this.loopGain = null;
    this.loopUrl = '';
    if (src) {
      try {
        src.stop();
      } catch {
        /* already ended */
      }
    }
  }

  /** one-shot stinger (e.g. 「予選スタート！」); silent if the asset is missing */
  async play(url: string, volume = 1): Promise<void> {
    const ctx = this.ensure();
    if (!ctx || !url) return;
    const buf = await this.load(url);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = this.master * volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }
}
