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
  private held = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat || e.isComposing) return;
      if (DIR_KEYS[e.code] || e.code === 'Space' || e.code === 'Enter') e.preventDefault();
      if (DIR_KEYS[e.code] && !this.dirStack.includes(e.code)) this.dirStack.push(e.code);
      this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.dirStack = this.dirStack.filter((c) => c !== e.code);
      // a key released before any frame consumed it must not fire later
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
      if (this.pressed.delete(c)) return true;
    }
    return false;
  }

  isHeld(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  clear(): void {
    this.dirStack = [];
    this.pressed.clear();
    this.held.clear();
  }
}
