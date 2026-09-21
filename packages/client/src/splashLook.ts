import { PAL } from './ui';

/**
 * R54.1 splash wordmark — the look is already on main (P2): two lines,
 * white body, one deep-magenta shadow, amber year. This helper is the
 * unit-testable contract. main.ts still draws it inline (Wave 0 / Wave 1
 * own that file); wire `splashWordmark()` there after those merge.
 */
export const SPLASH_LOOK = {
  lanterns: 7,
  colorBar: false,
  rainbow: false,
  glitchOffset: false,
} as const;

export function splashWordmark(title: string, year: string): {
  line1: string;
  line2: string;
  bodyColor: string;
  shadowColor: string;
  yearColor: string;
} {
  return {
    line1: title,
    line2: `— ${year} —`,
    bodyColor: PAL.white,
    shadowColor: '#5e1740',
    yearColor: PAL.orange,
  };
}
