import { HALL_NAV_KEYS } from './hall';
import type { Keys } from './input';

export type OperatorSurface = 'title' | 'hall' | 'service';

export type OperatorIntent =
  | 'open-service'
  | 'toggle-freeplay'
  | 'hall-nav'
  | 'fullscreen'
  | null;

/**
 * R16.1 / R17.1 policy: Shift+S opens サービス モード from title or hall.
 * F is FREE PLAY only inside that menu — on the hall it is fullscreen (R53).
 */
export function operatorIntent(
  surface: OperatorSurface,
  input: { code: string; shiftHeld: boolean },
): OperatorIntent {
  if (input.code === 'KeyS' && input.shiftHeld && (surface === 'title' || surface === 'hall')) {
    return 'open-service';
  }
  if (input.code === 'KeyF') {
    return surface === 'service' ? 'toggle-freeplay' : 'fullscreen';
  }
  if (surface === 'hall' && HALL_NAV_KEYS.includes(input.code)) return 'hall-nav';
  return null;
}

/**
 * Hall stick for one frame. Service chord wins over WASD KeyS so Shift+S
 * cannot walk ヘビ → カエルのリバー.
 */
export function consumeHallStick(keys: Keys): 'service' | string | null {
  if (keys.takeServiceChord()) return 'service';
  for (const k of HALL_NAV_KEYS) {
    if (keys.take(k)) return k;
  }
  return null;
}
