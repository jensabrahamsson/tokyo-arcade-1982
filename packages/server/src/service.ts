import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ServiceState {
  plays: number;
  coins: number;
  freePlay: boolean;
}

/** Operator bookkeeping (R16/R17): counters + free-play mode, persisted under data/. */
export class ServiceStore {
  private data: ServiceState;

  constructor(private readonly path: string) {
    this.data = this.load();
  }

  private load(): ServiceState {
    const clean: ServiceState = { plays: 0, coins: 0, freePlay: false };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) return clean;
      const o = parsed as Record<string, unknown>;
      const count = (v: unknown): number =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
      return {
        plays: count(o.plays),
        coins: count(o.coins),
        freePlay: typeof o.freePlay === 'boolean' ? o.freePlay : false,
      };
    } catch {
      return clean;
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(this.data, null, 1));
    } catch (err) {
      console.error('[arkad] could not persist service data:', err);
    }
  }

  snapshot(): ServiceState {
    return { ...this.data };
  }

  addCoin(): void {
    this.data.coins += 1;
    this.save();
  }

  addPlay(): void {
    this.data.plays += 1;
    this.save();
  }

  setFreePlay(on: boolean): void {
    this.data.freePlay = on;
    this.save();
  }
}
