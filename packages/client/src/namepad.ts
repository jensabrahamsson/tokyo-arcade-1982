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

/** Z / Enter / Space on the on-screen pad — activates the cell under the cursor. */
export function pressNamePadSelect(pad: NamePad): NamePad {
  return pressKey(pad, keyAt(pad, pad.cursor));
}

/**
 * Physical Space chooses the highlighted cell. The title scene consumes the
 * Space that opens the pad, so that press cannot also land here.
 */
export function pressNamePadSpace(pad: NamePad): NamePad {
  return pressNamePadSelect(pad);
}

export type NamePadAction =
  | { kind: 'move'; dr: number; dc: number }
  | { kind: 'select' }
  | { kind: 'type'; key: string }
  | { kind: 'backspace' }
  | { kind: 'cancel' };

const NAME_ARROWS: Record<string, { dr: number; dc: number }> = {
  ArrowLeft: { dr: 0, dc: -1 },
  ArrowRight: { dr: 0, dc: 1 },
  ArrowUp: { dr: -1, dc: 0 },
  ArrowDown: { dr: 1, dc: 0 },
};

/** One physical key on the name pad. Letter keys spell; arrows move. */
export function namePadAction(code: string): NamePadAction | null {
  const arrow = NAME_ARROWS[code];
  if (arrow) return { kind: 'move', dr: arrow.dr, dc: arrow.dc };
  if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') return { kind: 'select' };
  if (code === 'Backspace') return { kind: 'backspace' };
  if (code === 'Escape') return { kind: 'cancel' };
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return { kind: 'type', key: letter[1]! };
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return { kind: 'type', key: digit[1]! };
  if (code === 'Period' || code === 'NumpadDecimal') return { kind: 'type', key: '.' };
  if (code === 'Minus' || code === 'NumpadSubtract') return { kind: 'type', key: '-' };
  if (code === 'Quote') return { kind: 'type', key: "'" };
  return null;
}

export function applyNamePadAction(pad: NamePad, action: NamePadAction): NamePad {
  if (action.kind === 'move') return moveCursor(pad, action);
  if (action.kind === 'select') return pressNamePadSelect(pad);
  if (action.kind === 'type') return pressKey(pad, action.key);
  if (action.kind === 'backspace') return pressKey(pad, '<');
  return pad;
}

/** Polled each frame. Arrows and Space come before letters. */
export const NAME_PAD_CODES = [
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'Enter', 'NumpadEnter', 'Backspace', 'Escape',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
  ...'0123456789'.split('').map((digit) => `Digit${digit}`),
  'Period', 'NumpadDecimal', 'Minus', 'NumpadSubtract', 'Quote',
] as const;

export interface NameSlotLayout {
  readonly bezel: { x: number; y: number; w: number; h: number };
  readonly slots: ReadonlyArray<{ x: number; y: number; w: number; h: number; index: number }>;
}

export function nameSlotLayout(cx: number, y: number, max = NAME_MAX): NameSlotLayout {
  const slotW = 16;
  const slotH = 18;
  const gap = 3;
  const totalW = max * slotW + (max - 1) * gap;
  const bezelW = totalW + 16;
  const bezelH = 26;
  const bezelX = cx - Math.round(bezelW / 2);
  const startX = bezelX + 8;
  const startY = y + 4;
  const slots = Array.from({ length: max }, (_, index) => ({
    x: startX + index * (slotW + gap),
    y: startY,
    w: slotW,
    h: slotH,
    index,
  }));
  return {
    bezel: { x: bezelX, y, w: bezelW, h: bezelH },
    slots,
  };
}

export interface NameKeyTheme {
  readonly fill: string;
  readonly border: string;
  readonly text: string;
  readonly glow: boolean;
}

export function nameKeyTheme(
  key: string,
  isHot: boolean,
  textLen: number,
  blinkState = false,
): NameKeyTheme {
  if (isHot) {
    return {
      fill: blinkState ? '#f7e766' : '#ffa300',
      border: '#f7e766',
      text: '#05060c',
      glow: true,
    };
  }
  if (key === 'OK') {
    const ready = textLen > 0;
    return {
      fill: ready ? '#143820' : '#0e121e',
      border: ready ? '#05c46b' : '#242c48',
      text: ready ? '#f7e766' : '#888994',
      glow: ready,
    };
  }
  if (key === '<') {
    return {
      fill: '#2a0e14',
      border: '#9d0000',
      text: '#eb3b5a',
      glow: false,
    };
  }
  if (key === ' ') {
    return {
      fill: '#122030',
      border: '#243448',
      text: '#2de2e6',
      glow: false,
    };
  }
  return {
    fill: '#12162a',
    border: '#242c48',
    text: '#fbfbfb',
    glow: false,
  };
}

export interface NamePadProgress {
  readonly count: number;
  readonly max: number;
  readonly isFull: boolean;
  readonly label: string;
}

export function namePadProgress(textLen: number, max = NAME_MAX): NamePadProgress {
  const isFull = textLen >= max;
  const countStr = String(textLen).padStart(2, '0');
  const maxStr = String(max).padStart(2, '0');
  const label = isFull ? `[ ${countStr} / ${maxStr} MAX ]` : `[ ${countStr} / ${maxStr} ]`;
  return {
    count: textLen,
    max,
    isFull,
    label,
  };
}

