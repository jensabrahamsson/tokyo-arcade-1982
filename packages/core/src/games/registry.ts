import type { AnyGameSpec } from '../engine/types';
import type { GameId } from '../protocol/protocol';
import { snakeSpec } from './snake/snake';
import { puckSpec } from './puck/puck';
import { blockSpec } from './block/block';
import { galaxySpec } from './galaxy/galaxy';
import { riverSpec } from './river/river';
import { myriadSpec } from './myriad/myriad';
import { coastSpec } from './coast/coast';

export const REGISTRY: Partial<Record<GameId, AnyGameSpec>> = {
  snake: snakeSpec as AnyGameSpec,
  puck: puckSpec as AnyGameSpec,
  block: blockSpec as AnyGameSpec,
  galaxy: galaxySpec as AnyGameSpec,
  river: riverSpec as AnyGameSpec,
  myriad: myriadSpec as AnyGameSpec,
  coast: coastSpec as AnyGameSpec,
};
