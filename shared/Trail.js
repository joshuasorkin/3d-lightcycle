import { TRAIL_SEGMENT_MIN } from './constants.js';

export class Trail {
  constructor() {
    this.segments = []; // { start: {x, z}, end: {x, z} }
    this.currentStart = null;
  }

  startNew(x, z) {
    this.currentStart = { x, z };
  }

  finalize(x, z) {
    if (!this.currentStart) return;
    const dx = x - this.currentStart.x;
    const dz = z - this.currentStart.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < TRAIL_SEGMENT_MIN) return;

    this.segments.push({
      start: { ...this.currentStart },
      end: { x, z },
    });
  }

  clear() {
    this.segments = [];
    this.currentStart = null;
  }

  getCollisionSegments(includeCurrent, ownerX, ownerZ) {
    if (includeCurrent && this.currentStart) {
      return [...this.segments, { start: { ...this.currentStart }, end: { x: ownerX, z: ownerZ } }];
    }
    return this.segments;
  }

  toJSON() {
    return {
      segments: this.segments,
      currentStart: this.currentStart,
    };
  }

  loadFromJSON(data) {
    this.segments = data.segments || [];
    this.currentStart = data.currentStart || null;
  }
}
