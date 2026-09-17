import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameId } from '@arkad/core';
import type { GameMode } from '@arkad/core';
import type { ScoreEntry } from '@arkad/core';

export const MAX_ENTRIES = 10;

type Key = string;
const key = (game: GameId, mode: GameMode): Key => `${game}:${mode}`;

type Data = Record<Key, ScoreEntry[]>;

export class HighScoreStore {
  private data: Data;

  constructor(private readonly path: string) {
    this.data = this.load();
  }

  private load(): Data {
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as Data;
    } catch {
      return {};
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 1));
  }

  add(game: GameId, mode: GameMode, name: string, score: number): void {
    if (!(score > 0)) return;
    const k = key(game, mode);
    const list = this.data[k] ?? [];
    list.push({ name: name.trim().slice(0, 12) || '???', score, date: new Date().toISOString().slice(0, 10) });
    list.sort((a, b) => b.score - a.score);
    this.data[k] = list.slice(0, MAX_ENTRIES);
    this.save();
  }

  top(game: GameId, mode: GameMode, limit = MAX_ENTRIES): ScoreEntry[] {
    return (this.data[key(game, mode)] ?? []).slice(0, limit);
  }
}
