import { HALF_ARENA, COLLISION_RADIUS } from './constants.js';

export function checkWallCollision(x, z) {
  return Math.abs(x) > HALF_ARENA - 1 || Math.abs(z) > HALF_ARENA - 1;
}

export function pointToSegmentDistance(px, pz, seg) {
  const ax = seg.start.x, az = seg.start.z;
  const bx = seg.end.x, bz = seg.end.z;

  const segLen = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
  if (segLen < 0.1) return Infinity;

  const dx = bx - ax, dz = bz - az;
  let t = ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz);
  t = Math.max(0, Math.min(1, t));
  const nearX = ax + t * dx;
  const nearZ = az + t * dz;
  return Math.sqrt((px - nearX) ** 2 + (pz - nearZ) ** 2);
}

export function checkTrailCollisions(x, z, ownTrail, allTrails, allCycles) {
  for (const trail of allTrails) {
    const isOwnTrail = trail === ownTrail;
    const owner = allCycles.find(c => c.trail === trail);
    const segs = trail.getCollisionSegments(!isOwnTrail, owner ? owner.x : 0, owner ? owner.z : 0);
    for (let i = 0; i < segs.length; i++) {
      if (isOwnTrail && i >= segs.length - 2) continue;
      if (pointToSegmentDistance(x, z, segs[i]) < COLLISION_RADIUS) return true;
    }
  }
  return false;
}

export function checkCollision(x, z, ownTrail, allTrails, allCycles) {
  if (checkWallCollision(x, z)) return 'wall';
  if (checkTrailCollisions(x, z, ownTrail, allTrails, allCycles)) return 'trail';
  return null;
}

// AI lookahead helpers
export function isPointClear(px, pz, selfCycle, allCycles) {
  if (Math.abs(px) > HALF_ARENA - 3 || Math.abs(pz) > HALF_ARENA - 3) return false;

  // Opponent body check
  for (const other of allCycles) {
    if (other === selfCycle || !other.alive) continue;
    const dist = Math.sqrt((px - other.x) ** 2 + (pz - other.z) ** 2);
    if (dist < 3.0) return false;
  }

  // Trail check
  for (const cycle of allCycles) {
    const trail = cycle.trail;
    const segs = trail.getCollisionSegments(true, cycle.x, cycle.z);
    const isOwnTrail = cycle === selfCycle;
    for (let j = 0; j < segs.length; j++) {
      if (isOwnTrail && j === segs.length - 2) continue;
      if (isOwnTrail && j === segs.length - 1) {
        const seg = segs[j];
        const ax = seg.start.x, az = seg.start.z;
        const bx = seg.end.x, bz = seg.end.z;
        const segDx = bx - ax, segDz = bz - az;
        const len2 = segDx * segDx + segDz * segDz;
        if (len2 < 1.0) continue;
        let t = ((px - ax) * segDx + (pz - az) * segDz) / len2;
        t = Math.max(0, Math.min(0.85, t));
        const nearX = ax + t * segDx;
        const nearZ = az + t * segDz;
        const dist = Math.sqrt((px - nearX) ** 2 + (pz - nearZ) ** 2);
        if (dist < 2.0) return false;
        continue;
      }
      const seg = segs[j];
      const ax = seg.start.x, az = seg.start.z;
      const bx = seg.end.x, bz = seg.end.z;
      const segDx = bx - ax, segDz = bz - az;
      const len2 = segDx * segDx + segDz * segDz;
      if (len2 < 0.01) continue;
      let t = ((px - ax) * segDx + (pz - az) * segDz) / len2;
      t = Math.max(0, Math.min(1, t));
      const nearX = ax + t * segDx;
      const nearZ = az + t * segDz;
      const dist = Math.sqrt((px - nearX) ** 2 + (pz - nearZ) ** 2);
      if (dist < 2.0) return false;
    }
  }
  return true;
}

export function measureClearDistance(cycle, angle, allCycles) {
  const maxDist = cycle.speed * 3.0;
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const d = (maxDist / steps) * i;
    if (!isPointClear(
      cycle.x + Math.sin(angle) * d,
      cycle.z + Math.cos(angle) * d,
      cycle, allCycles
    )) {
      return d;
    }
  }
  return maxDist;
}

export function isDirectionClear(cycle, angle, distance, allCycles) {
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const d = (distance / steps) * i;
    const px = cycle.x + Math.sin(angle) * d;
    const pz = cycle.z + Math.cos(angle) * d;
    if (!isPointClear(px, pz, cycle, allCycles)) return false;
  }
  return true;
}
