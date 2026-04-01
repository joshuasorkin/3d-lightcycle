import { CycleState } from '../shared/CycleState.js';
import { SPAWN_POSITIONS, SERVER_TICK_RATE, SNAPSHOT_INTERVAL } from '../shared/constants.js';

export class GameSimulation {
  constructor(players, onTurn, onDeath, onSnapshot, onGameOver) {
    this.onTurn = onTurn;
    this.onDeath = onDeath;
    this.onSnapshot = onSnapshot;
    this.onGameOver = onGameOver;

    this.tick = 0;
    this.gameTime = 0;
    this.cycles = [];
    this.running = false;
    this.interval = null;

    // Create cycles for all players (human + AI)
    for (const p of players) {
      const spawn = SPAWN_POSITIONS[p.slot];
      const cycle = new CycleState(p.id, spawn.x, spawn.z, spawn.angle, p.isAI);
      cycle.slot = p.slot;
      this.cycles.push(cycle);
    }
  }

  start() {
    this.running = true;
    const dt = 1 / SERVER_TICK_RATE;

    this.interval = setInterval(() => {
      if (!this.running) return;

      this.tick++;
      this.gameTime += dt;

      // AI decisions
      for (const cycle of this.cycles) {
        if (cycle.isAI && cycle.alive) {
          const turnDir = cycle.updateAI(dt, this.cycles, this.gameTime);
          if (turnDir !== null) {
            cycle.turn(turnDir);
            this.onTurn(cycle.id, turnDir, this.tick, cycle.x, cycle.z, cycle.angle);
          }
        }
      }

      // Update all cycles
      const deaths = [];
      for (const cycle of this.cycles) {
        if (!cycle.alive) continue;
        const hit = cycle.update(dt, this.cycles);
        if (hit) {
          deaths.push({ playerId: cycle.id, x: cycle.x, z: cycle.z, killer: hit });
        }
      }

      // Broadcast deaths
      for (const d of deaths) {
        this.onDeath(d.playerId, d.x, d.z, d.killer);
      }

      // Check game over
      const alive = this.cycles.filter(c => c.alive);
      if (alive.length <= 1 && this.cycles.length > 1) {
        this.running = false;
        clearInterval(this.interval);
        const winner = alive.length === 1 ? alive[0].id : null;
        this.onGameOver(winner);
        return;
      }

      // Periodic snapshots
      if (this.tick % SNAPSHOT_INTERVAL === 0) {
        this.onSnapshot(this.tick, this.cycles.map(c => c.toSnapshot()));
      }
    }, 1000 / SERVER_TICK_RATE);
  }

  applyTurn(playerId, dir) {
    const cycle = this.cycles.find(c => c.id === playerId);
    if (!cycle || !cycle.alive) return null;
    if (cycle.turn(dir)) {
      return { x: cycle.x, z: cycle.z, angle: cycle.angle };
    }
    return null;
  }

  applySpeed(playerId, speed) {
    const cycle = this.cycles.find(c => c.id === playerId);
    if (!cycle || !cycle.alive) return;
    cycle.setSpeed(speed);
  }

  stop() {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
  }
}
