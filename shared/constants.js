export const ARENA_SIZE = 300;
export const HALF_ARENA = ARENA_SIZE / 2;
export const WALL_HEIGHT = 4;
export const TRAIL_WIDTH = 0.6;
export const MIN_SPEED = 20;
export const MAX_SPEED = 60;
export const TURN_SPEED = Math.PI;
export const TRAIL_SEGMENT_MIN = 0.5;
export const COLLISION_RADIUS = 0.8;

export const PLAYER_COLORS = [
  { hex: '#00ffff', int: 0x00ffff, name: 'Cyan' },
  { hex: '#ff6600', int: 0xff6600, name: 'Orange' },
  { hex: '#ff00ff', int: 0xff00ff, name: 'Magenta' },
  { hex: '#00ff66', int: 0x00ff66, name: 'Green' },
];

export const GRID_COLOR = 0x003333;

export const SPAWN_POSITIONS = [
  { x: -60, z: 60, angle: 0 },
  { x: 60, z: -60, angle: Math.PI },
  { x: -60, z: -60, angle: Math.PI / 2 },
  { x: 60, z: 60, angle: -Math.PI / 2 },
];

export const SERVER_TICK_RATE = 20;
export const SNAPSHOT_INTERVAL = 10; // every 10 ticks = 500ms
