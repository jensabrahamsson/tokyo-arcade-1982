export { VERSION } from './version';
export * from './engine/rng';
export * from './engine/loop';
export * from './engine/vec';
export * from './engine/phase';
export * from './engine/types';
export * from './i18n/i18n';
export * from './difficulty/difficulty';
export * from './protocol/protocol';
export * from './audio/notes';

export { snakeSpec, GRID as SNAKE_GRID, type SnakeState } from './games/snake/snake';
export {
  puckSpec,
  MAZE,
  MAZE_W,
  MAZE_H,
  PLAYER_SPAWN,
  type PuckState,
  type PuckPlayer,
  type Ghost,
} from './games/puck/puck';
export { blockSpec, BLOCK_W, BLOCK_H, type BlockState } from './games/block/block';
export { galaxySpec, type GalaxyState, type Alien } from './games/galaxy/galaxy';
export { riverSpec, HOME_ROWS, type RiverState, type Lane } from './games/river/river';
export { myriadSpec, MYRIAD_W, MYRIAD_H, type MyriadState } from './games/myriad/myriad';
export { attractDemoTier, demoRuns, type DemoTier } from './engine/attract';
export { RIVER_W } from './games/river/river';
export { coastSpec, curveAt, dogSlide, TRACK_LEN, BONUS_LEN, CHECKPOINTS, MAX_SPEED, OFF_ROAD_X, COAST_BILLBOARDS, OBSTACLE_KINDS, TRAFFIC_KINDS, type CoastBillboard, type CoastState, type Obstacle, type ObstacleKind, type TrafficCar, type TrafficKind, type CoastStage } from './games/coast/coast';
export {
  circuitSpec,
  createCircuit,
  poseAt,
  projectCar,
  circuitSteer,
  CIRCUIT_CAMERA,
  CIRCUIT_LAPS,
  CIRCUIT_LIVES,
  CIRCUIT_MARKS,
  TRACK_SAMPLES,
  TRACK_LENGTH,
  HALF_WIDTH,
  WALL,
  CIRCUIT_MAX_SPEED,
  type CircuitState,
  type CircuitMark,
  type TrackSample,
} from './games/circuit/circuit';
export { REGISTRY } from './games/registry';
