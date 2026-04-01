import { MIN_SPEED, MAX_SPEED } from './constants.js';
import { Trail } from './Trail.js';
import { checkCollision, isDirectionClear, measureClearDistance } from './collision.js';

export class CycleState {
  constructor(id, x, z, angle, isAI = false) {
    this.id = id;
    this.x = x;
    this.z = z;
    this.angle = angle;
    this.speed = 30;
    this.isAI = isAI;
    this.alive = true;
    this.trail = new Trail();
    this.trail.startNew(x, z);
    this.turnCooldown = 0;
    this.aiTimer = 0;
    this.aiNextTurn = 0;
  }

  turn(dir) {
    if (this.turnCooldown > 0) return false;
    this.trail.finalize(this.x, this.z);
    this.angle += dir * Math.PI / 2;
    this.angle = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    this.trail.startNew(this.x, this.z);
    this.turnCooldown = 0.15;
    return true;
  }

  setSpeed(speed) {
    this.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
  }

  update(dt, allCycles) {
    if (!this.alive) return null;

    this.turnCooldown = Math.max(0, this.turnCooldown - dt);

    // Move
    const dx = Math.sin(this.angle) * this.speed * dt;
    const dz = Math.cos(this.angle) * this.speed * dt;
    this.x += dx;
    this.z += dz;

    // Check collisions
    const allTrails = allCycles.map(c => c.trail);
    const hit = checkCollision(this.x, this.z, this.trail, allTrails, allCycles);
    if (hit) {
      this.alive = false;
      return hit;
    }
    return null;
  }

  updateAI(dt, allCycles, gameTime) {
    if (!this.isAI || !this.alive) return null;

    this.aiTimer += dt;

    const urgentDist = this.speed * 0.6;
    const aheadUrgent = isDirectionClear(this, this.angle, urgentDist, allCycles);

    if (!aheadUrgent) {
      this.aiTimer = 0;
      const leftAngle = this.angle - Math.PI / 2;
      const rightAngle = this.angle + Math.PI / 2;
      const leftDist = measureClearDistance(this, leftAngle, allCycles);
      const rightDist = measureClearDistance(this, rightAngle, allCycles);
      if (leftDist > rightDist) {
        return -1;
      } else if (rightDist > leftDist) {
        return 1;
      } else {
        return Math.random() < 0.5 ? -1 : 1;
      }
    }

    if (this.aiTimer < this.aiNextTurn) return null;
    this.aiTimer = 0;
    this.aiNextTurn = 0.2 + Math.random() * 0.5;

    const lookAhead = this.speed * 2.0;
    const aheadClear = isDirectionClear(this, this.angle, lookAhead, allCycles);
    const leftAngle = this.angle - Math.PI / 2;
    const rightAngle = this.angle + Math.PI / 2;

    if (!aheadClear) {
      const leftDist = measureClearDistance(this, leftAngle, allCycles);
      const rightDist = measureClearDistance(this, rightAngle, allCycles);
      if (leftDist > rightDist) return -1;
      if (rightDist > leftDist) return 1;
      return Math.random() < 0.5 ? -1 : 1;
    }

    if (Math.random() < 0.12) {
      const leftDist = measureClearDistance(this, leftAngle, allCycles);
      const rightDist = measureClearDistance(this, rightAngle, allCycles);
      if (Math.max(leftDist, rightDist) > 20) {
        return leftDist > rightDist ? -1 : 1;
      }
    }

    // AI speed variation
    this.speed = 30 + Math.sin(gameTime * 0.5) * 8;
    return null;
  }

  reset(x, z, angle) {
    this.x = x;
    this.z = z;
    this.angle = angle;
    this.speed = 30;
    this.alive = true;
    this.trail.clear();
    this.trail.startNew(x, z);
    this.turnCooldown = 0;
    this.aiTimer = 0;
  }

  toSnapshot() {
    return {
      id: this.id,
      x: this.x,
      z: this.z,
      angle: this.angle,
      speed: this.speed,
      alive: this.alive,
    };
  }
}
