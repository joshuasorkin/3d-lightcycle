// Client -> Server
export const C2S = {
  CREATE: 'create',
  JOIN: 'join',
  READY: 'ready',
  TURN: 'turn',
  SPEED: 'speed',
  LEAVE: 'leave',
};

// Server -> Client
export const S2C = {
  ROOM_JOINED: 'room_joined',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  COUNTDOWN: 'countdown',
  GAME_START: 'game_start',
  TURN: 'turn',
  SPEED_CHANGE: 'speed_change',
  STATE_SNAPSHOT: 'state_snapshot',
  CYCLE_DIED: 'cycle_died',
  GAME_OVER: 'game_over',
  ERROR: 'error',
};
