import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { GAME_IDS, type GameId } from '@arkad/core';
import { rollDay, stockholmDate } from './dayclock';

export interface ServiceState {
  plays: number;
  coins: number;
  freePlay: boolean;
  /** cabinets the operator took out of service (R24) */
  outOfOrder: GameId[];
  /** current Europe/Stockholm bucket for the day counters (R31) */
  day: string;
  playsToday: number;
  coinsToday: number;
  /** operator hall sticker, max 24 chars, '' = none (R42) */
  note: string;
}

/** Operator bookkeeping (R16/R17): counters + free-play mode, persisted under data/. */
export class ServiceStore {
  private data: ServiceState;

  constructor(private readonly path: string) {
    this.data = this.load();
  }

  private load(): ServiceState {
    const clean: ServiceState = { plays: 0, coins: 0, freePlay: false, outOfOrder: [], day: '', playsToday: 0, coinsToday: 0, note: '' };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) return clean;
      const o = parsed as Record<string, unknown>;
      const count = (v: unknown): number =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
      const ooo = Array.isArray(o.outOfOrder)
        ? (o.outOfOrder.filter((g: unknown) => GAME_IDS.includes(g as GameId)) as GameId[])
        : [];
      return {
        plays: count(o.plays),
        coins: count(o.coins),
        freePlay: typeof o.freePlay === 'boolean' ? o.freePlay : false,
        outOfOrder: ooo,
        day: typeof o.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? o.day : '',
        playsToday: count(o.playsToday),
        coinsToday: count(o.coinsToday),
        note: typeof o.note === 'string' && o.note.length <= 24 ? o.note : '',
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

  private roll(): void {
    const bucket = rollDay(this.data.day, this.data.playsToday, this.data.coinsToday, stockholmDate(Date.now()));
    this.data = { ...this.data, ...bucket };
  }

  addCoin(): void {
    this.roll();
    this.data.coins += 1;
    this.data.coinsToday += 1;
    this.save();
  }

  addPlay(): void {
    this.roll();
    this.data.plays += 1;
    this.data.playsToday += 1;
    this.save();
  }

  setFreePlay(on: boolean): void {
    this.data.freePlay = on;
    this.save();
  }

  setNote(text: string): void {
    this.data.note = text.length <= 24 ? text : text.slice(0, 24);
    this.save();
  }

  setOutOfOrder(game: GameId, out: boolean): void {
    const set = new Set(this.data.outOfOrder);
    if (out) set.add(game);
    else set.delete(game);
    this.data.outOfOrder = [...set].sort();
    this.save();
  }
}
