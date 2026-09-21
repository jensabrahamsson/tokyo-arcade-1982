import { DIRS, type Dir } from '@arkad/core';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: DIRS.up, KeyW: DIRS.up,
  ArrowDown: DIRS.down, KeyS: DIRS.down,
  ArrowLeft: DIRS.left, KeyA: DIRS.left,
  ArrowRight: DIRS.right, KeyD: DIRS.right,
};

/** Keyboard state with edge-triggered reads, arcade style. */
export class Keys {
  /** dir key codes in press order; last = current stick position */
  private dirStack: string[] = [];
  private pressed = new Set<string>();
 /** every keydown records a tap; a tap released before any frame ran is
   * still consumed exactly once — fast taps must never be eaten by a slow
   * or throttled frame loop (hardtest: arrow taps eaten in background tab).
   * One keydown = one count, so rapid repeats step per press, never coalesce. */
  private taps = new Map<string, number>();
  private held = new Set<string>();
  /** taps whose keydown had Shift (held code or event.shiftKey — CDP modifiers). */
  private shiftedTaps = new Map<string, number>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat || e.isComposing) return;
      if (DIR_KEYS[e.code] || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
      if (DIR_KEYS[e.code] && !this.dirStack.includes(e.code)) this.dirStack.push(e.code);
      const shift = Boolean(e.shiftKey)
        || this.held.has('ShiftLeft')
        || this.held.has('ShiftRight');
      this.pressed.add(e.code);
      this.taps.set(e.code, (this.taps.get(e.code) ?? 0) + 1);
      this.held.add(e.code);
      if (shift && e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') {
        this.shiftedTaps.set(e.code, (this.shiftedTaps.get(e.code) ?? 0) + 1);
      }
    });
    target.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.dirStack = this.dirStack.filter((c) => c !== e.code);
      this.pressed.delete(e.code);
    });
    // alt-tabbing with a key held down must not leave the stick stuck
    target.addEventListener('blur', () => this.clear());
  }

  /** the direction key pressed most recently that is still down */
  heldDir(): Dir | null {
    for (let i = this.dirStack.length - 1; i >= 0; i--) {
      const d = DIR_KEYS[this.dirStack[i]!];
      if (d) return d;
    }
    return null;
  }

  take(...codes: string[]): boolean {
    for (const c of codes) {
      const seen = this.pressed.delete(c);
      const n = this.taps.get(c) ?? 0;
      if (n > 0) this.taps.set(c, n - 1);
      if (seen || n > 0) return true;
    }
    return false;
  }

  isHeld(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  /**
   * R16.1: hold Shift+S. Consumes KeyS so hall WASD cannot walk the grid.
   * Also matches CDP `KeyS` with `shiftKey` and no separate ShiftLeft down.
   */
  takeServiceChord(): boolean {
    const tagged = this.shiftedTaps.get('KeyS') ?? 0;
    if (tagged > 0) {
      this.shiftedTaps.set('KeyS', tagged - 1);
      const n = this.taps.get('KeyS') ?? 0;
      if (n > 0) this.taps.set('KeyS', n - 1);
      this.pressed.delete('KeyS');
      return true;
    }
    return this.isHeld('ShiftLeft', 'ShiftRight') && this.take('KeyS');
  }

  clear(): void {
    this.dirStack = [];
    this.pressed.clear();
    this.taps.clear();
    this.held.clear();
    this.shiftedTaps.clear();
  }
}
