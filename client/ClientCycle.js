import { CycleState } from '../shared/CycleState.js';
import { createCycleModel, ClientTrail, scene } from './renderer.js';
import { TrailSynth } from './audio.js';

// Base note per slot index
const BASE_NOTES = [65, 55, 73, 49];

export class ClientCycle {
  constructor(id, x, z, angle, colorInt, colorHex, isAI, isLocal) {
    this.state = new CycleState(id, x, z, angle, isAI);
    this.colorInt = colorInt;
    this.colorHex = colorHex;
    this.isLocal = isLocal;

    // 3D model
    this.model = createCycleModel(colorInt);
    this.model.position.set(x, 0, z);
    this.model.rotation.y = angle;
    scene.add(this.model);

    // Trail rendering
    this.clientTrail = new ClientTrail(colorInt);

    // Audio
    this.synth = new TrailSynth(BASE_NOTES[id % BASE_NOTES.length], isLocal);
    this.synth.init();
    this.synth.rebuildFromTrail({ segments: [] });

    // Track finalized segment count for incremental mesh updates
    this._lastFinalizedCount = 0;
  }

  // Proxy getters to state
  get id() { return this.state.id; }
  get x() { return this.state.x; }
  set x(v) { this.state.x = v; }
  get z() { return this.state.z; }
  set z(v) { this.state.z = v; }
  get angle() { return this.state.angle; }
  set angle(v) { this.state.angle = v; }
  get speed() { return this.state.speed; }
  set speed(v) { this.state.speed = v; }
  get alive() { return this.state.alive; }
  set alive(v) { this.state.alive = v; }
  get trail() { return this.state.trail; }
  get isAI() { return this.state.isAI; }
  get turnCooldown() { return this.state.turnCooldown; }

  turn(dir) {
    const result = this.state.turn(dir);
    if (result) {
      this.synth.rebuildFromTrail(this.state.trail);
    }
    return result;
  }

  setSpeed(speed) {
    this.state.setSpeed(speed);
  }

  update(dt) {
    if (!this.state.alive) return;

    this.state.turnCooldown = Math.max(0, this.state.turnCooldown - dt);

    // Move (no collision — server is authoritative for deaths)
    this.state.x += Math.sin(this.state.angle) * this.state.speed * dt;
    this.state.z += Math.cos(this.state.angle) * this.state.speed * dt;

    // Sync model position
    this.model.position.set(this.state.x, 0, this.state.z);
    this.model.rotation.y = this.state.angle;

    // Update trail meshes — add any new finalized segments
    const segs = this.state.trail.segments;
    while (this._lastFinalizedCount < segs.length) {
      this.clientTrail.addFinalizedSegment(segs[this._lastFinalizedCount]);
      this._lastFinalizedCount++;
    }

    // Update current growing segment
    if (this.state.trail.currentStart) {
      this.clientTrail.updateCurrentSegment(
        this.state.trail.currentStart.x,
        this.state.trail.currentStart.z,
        this.state.x,
        this.state.z
      );
    }

    // Audio
    this.synth.update(this.state);
  }

  updateAI(dt, allCycles, gameTime) {
    const allStates = allCycles.map(c => c.state);
    return this.state.updateAI(dt, allStates, gameTime);
  }

  destroy() {
    scene.remove(this.model);
    this.clientTrail.clear();
    this.synth.dispose();
  }

  reset(x, z, angle) {
    this.state.reset(x, z, angle);
    this.model.position.set(x, 0, z);
    this.model.rotation.y = angle;
    this.clientTrail.clear();
    this._lastFinalizedCount = 0;
    this.synth.dispose();
    this.synth = new TrailSynth(BASE_NOTES[this.id % BASE_NOTES.length], this.isLocal);
    this.synth.init();
    this.synth.rebuildFromTrail({ segments: [] });
  }
}
