import { PLAYER_COLORS, SPAWN_POSITIONS } from '../shared/constants.js';
import { GameSimulation } from './GameSimulation.js';

let nextPlayerId = 0;

export class GameRoom {
  constructor(code, onDestroy) {
    this.code = code;
    this.onDestroy = onDestroy;
    this.players = []; // { id, ws, name, slot, isAI }
    this.maxPlayers = 4;
    this.state = 'waiting'; // waiting, countdown, playing
    this.simulation = null;
    this.hostId = null;
    this.countdownTimer = null;
  }

  addPlayer(ws, name) {
    if (this.state !== 'waiting') {
      ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress' }));
      return;
    }
    if (this.players.filter(p => !p.isAI).length >= this.maxPlayers) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
      return;
    }

    // Find first available slot
    const usedSlots = new Set(this.players.map(p => p.slot));
    let slot = 0;
    while (usedSlots.has(slot)) slot++;

    const id = nextPlayerId++;
    const player = { id, ws, name, slot, isAI: false };
    this.players.push(player);

    ws._room = this;
    ws._playerId = id;

    if (this.hostId === null) this.hostId = id;

    // Notify the new player
    ws.send(JSON.stringify({
      type: 'room_joined',
      roomCode: this.code,
      playerId: id,
      isHost: id === this.hostId,
      players: this.getPlayerList(),
    }));

    // Notify existing players
    this.broadcastExcept(ws, {
      type: 'player_joined',
      players: this.getPlayerList(),
    });
  }

  removePlayer(ws) {
    const idx = this.players.findIndex(p => p.ws === ws);
    if (idx === -1) return;

    const player = this.players[idx];
    this.players.splice(idx, 1);
    ws._room = null;

    // If game is playing, let the cycle continue straight (server handles)
    // If in lobby, update player list
    if (this.state === 'waiting') {
      // Reassign host
      if (player.id === this.hostId) {
        const humans = this.players.filter(p => !p.isAI);
        this.hostId = humans.length > 0 ? humans[0].id : null;
        if (this.hostId !== null) {
          const newHost = this.players.find(p => p.id === this.hostId);
          if (newHost && newHost.ws) {
            newHost.ws.send(JSON.stringify({
              type: 'room_joined',
              roomCode: this.code,
              playerId: newHost.id,
              isHost: true,
              players: this.getPlayerList(),
            }));
          }
        }
      }
      this.broadcast({
        type: 'player_left',
        players: this.getPlayerList(),
      });
    }

    // Destroy room if empty
    const humans = this.players.filter(p => !p.isAI);
    if (humans.length === 0) {
      if (this.simulation) this.simulation.stop();
      if (this.countdownTimer) clearInterval(this.countdownTimer);
      this.onDestroy();
    }
  }

  onReady(ws) {
    if (ws._playerId !== this.hostId) return;
    if (this.state !== 'waiting') return;
    this.startCountdown();
  }

  addAI() {
    if (this.state !== 'waiting') return;
    const usedSlots = new Set(this.players.map(p => p.slot));
    let slot = 0;
    while (usedSlots.has(slot)) slot++;
    if (slot >= this.maxPlayers) return;

    const id = nextPlayerId++;
    this.players.push({ id, ws: null, name: 'AI', slot, isAI: true });
    this.broadcast({ type: 'player_joined', players: this.getPlayerList() });
  }

  removeAI() {
    if (this.state !== 'waiting') return;
    const aiIdx = this.players.findLastIndex(p => p.isAI);
    if (aiIdx === -1) return;
    this.players.splice(aiIdx, 1);
    this.broadcast({ type: 'player_left', players: this.getPlayerList() });
  }

  startCountdown() {
    if (this.players.length < 2) return; // need at least 2 players/AI

    this.state = 'countdown';
    let seconds = 3;

    this.broadcast({ type: 'countdown', seconds });

    this.countdownTimer = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        this.broadcast({ type: 'countdown', seconds });
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startGame();
      }
    }, 1000);
  }

  startGame() {
    this.state = 'playing';

    const cycleData = this.players.map(p => {
      const spawn = SPAWN_POSITIONS[p.slot];
      return {
        id: p.id,
        slot: p.slot,
        x: spawn.x,
        z: spawn.z,
        angle: spawn.angle,
        speed: 30,
        isAI: p.isAI,
        name: p.name,
      };
    });

    this.broadcast({
      type: 'game_start',
      tick: 0,
      cycles: cycleData,
    });

    this.simulation = new GameSimulation(
      this.players.map(p => ({ id: p.id, slot: p.slot, isAI: p.isAI })),
      // onTurn (AI turns)
      (playerId, dir, tick, x, z, angle) => {
        this.broadcast({
          type: 'turn',
          playerId, dir, tick, x, z, angle,
        });
      },
      // onDeath
      (playerId, x, z, killer) => {
        this.broadcast({
          type: 'cycle_died',
          playerId, x, z, killer,
        });
      },
      // onSnapshot
      (tick, cycles) => {
        this.broadcast({
          type: 'state_snapshot',
          tick, cycles,
        });
      },
      // onGameOver
      (winner) => {
        this.broadcast({
          type: 'game_over',
          winner,
          score: Math.floor(this.simulation.gameTime * 10),
        });
        // Reset room to waiting state
        this.state = 'waiting';
        this.simulation = null;
        // Remove AI players
        this.players = this.players.filter(p => !p.isAI);
        // Send updated player list so clients can render the room lobby
        this.broadcast({
          type: 'player_left',
          players: this.getPlayerList(),
        });
      }
    );

    this.simulation.start();
  }

  onTurn(ws, dir, clientTick) {
    if (!this.simulation || this.state !== 'playing') return;
    const playerId = ws._playerId;
    const result = this.simulation.applyTurn(playerId, dir);
    if (result) {
      this.broadcast({
        type: 'turn',
        playerId,
        dir,
        tick: this.simulation.tick,
        x: result.x,
        z: result.z,
        angle: result.angle,
      });
    }
  }

  onSpeed(ws, speed, clientTick) {
    if (!this.simulation || this.state !== 'playing') return;
    const playerId = ws._playerId;
    this.simulation.applySpeed(playerId, speed);
    this.broadcastExcept(ws, {
      type: 'speed_change',
      playerId,
      speed,
      tick: this.simulation.tick,
    });
  }

  getPlayerList() {
    return this.players.map(p => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      isAI: p.isAI,
    }));
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players) {
      if (p.ws && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    }
  }

  broadcastExcept(ws, msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players) {
      if (p.ws && p.ws !== ws && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    }
  }
}
