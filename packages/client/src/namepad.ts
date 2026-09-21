export interface NamePad {
  readonly rows: readonly string[][];
  readonly cursor: { row: number; col: number };
  readonly text: string;
  readonly max: number;
  readonly done: boolean;
}

export const NAME_MAX = 12;

export function createNamePad(): NamePad {
  return {
    rows: [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.'],
      [' ', '<', 'OK'],
    ],
    cursor: { row: 0, col: 0 },
    text: '',
    max: NAME_MAX,
    done: false,
  };
}

const VALID = /^[A-Z0-9 .'!?-]$/;

export function keyAt(pad: NamePad, at: { row: number; col: number }): string {
  return pad.rows[at.row]?.[at.col] ?? '';
}

export function moveCursor(pad: NamePad, dir: { dr: number; dc: number }): NamePad {
  const row = Math.min(pad.rows.length - 1, Math.max(0, pad.cursor.row + dir.dr));
  const width = pad.rows[row]!.length;
  const col = Math.min(width - 1, Math.max(0, pad.cursor.col + dir.dc));
  return { ...pad, cursor: { row, col } };
}

export function pressKey(pad: NamePad, key: string): NamePad {
  if (pad.done) return pad;
  if (key === 'OK') return pad.text.length > 0 ? { ...pad, done: true } : pad;
  if (key === '<') return { ...pad, text: pad.text.slice(0, -1) };
  if (key === ' ' && pad.text.length === 0) return pad;
  if (key.length === 1 && VALID.test(key) && pad.text.length < pad.max) {
    return { ...pad, text: pad.text + key };
  }
  return pad;
}

/** Z / Enter on the on-screen pad — activates the cell under the cursor. */
export function pressNamePadSelect(pad: NamePad): NamePad {
  return pressKey(pad, keyAt(pad, pad.cursor));
}

/**
 * Physical Space on the name pad: only the on-screen space cell inserts a
 * space. Otherwise Space is ignored so title→namepad carry-over cannot
 * stamp Q (default cursor) before AKIRA-style entry (Wave 0 CDP).
 */
export function pressNamePadSpace(pad: NamePad): NamePad {
  const key = keyAt(pad, pad.cursor);
  if (key === ' ') return pressKey(pad, ' ');
  if (key === 'OK' || key === '<') return pressKey(pad, key);
  return pad;
}
