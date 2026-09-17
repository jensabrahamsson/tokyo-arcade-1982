import { DIRS, type Dir } from '@arkad/core';

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: DIRS.up, KeyW: DIRS.up,
  ArrowDown: DIRS.down, KeyS: DIRS.down,
  ArrowLeft: DIRS.left, KeyA: DIRS.left,
  ArrowRight: DIRS.right, KeyD: DIRS.right,
};

/** Keyboard state with edge-triggered reads, arcade style. */
export class Keys {
  private dirQueue: Dir[] = [];
  private pressed = new Set<string>();
  private held = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const dir = DIR_KEYS[e.code];
      if (dir) {
        this.dirQueue.push(dir);
        e.preventDefault();
      }
      this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      // a key released before any frame consumed it must not fire later
      this.pressed.delete(e.code);
    });
  }

  /** latest queued direction change, if any */
  takeDir(): Dir | null {
    return this.dirQueue.pop() ?? null;
  }

  take(...codes: string[]): boolean {
    for (const c of codes) {
      if (this.pressed.delete(c)) return true;
    }
    return false;
  }

  isHeld(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }
}
