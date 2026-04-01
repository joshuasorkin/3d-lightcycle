import { HALF_ARENA, ARENA_SIZE, MIN_SPEED, MAX_SPEED } from '../shared/constants.js';

let audioCtx = null;

export function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

export function getAudioCtx() { return audioCtx; }

export function updateAudioListener(camera) {
  if (!audioCtx) return;
  const THREE = await_three;
  const l = audioCtx.listener;
  const t = audioCtx.currentTime;
  if (l.positionX) {
    l.positionX.setValueAtTime(camera.position.x, t);
    l.positionY.setValueAtTime(camera.position.y, t);
    l.positionZ.setValueAtTime(camera.position.z, t);
  } else {
    l.setPosition(camera.position.x, camera.position.y, camera.position.z);
  }
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  if (l.forwardX) {
    l.forwardX.setValueAtTime(fwd.x, t);
    l.forwardY.setValueAtTime(fwd.y, t);
    l.forwardZ.setValueAtTime(fwd.z, t);
    l.upX.setValueAtTime(up.x, t);
    l.upY.setValueAtTime(up.y, t);
    l.upZ.setValueAtTime(up.z, t);
  } else {
    l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

// We need THREE for Vector3 in updateAudioListener — store ref
let await_three = null;
export function setThreeRef(THREE) { await_three = THREE; }

const PENTATONIC = [1, 9/8, 5/4, 3/2, 5/3];

export class TrailSynth {
  constructor(baseNote, isLocal) {
    this.baseNote = baseNote;
    this.isLocal = isLocal;
    this.voices = [];
    this.masterGain = null;
    this.filter = null;
    this.panner = null;
    this.maxVoices = 6;
    this.alive = true;
  }

  init() {
    if (!audioCtx) return;
    this.filter = audioCtx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 400;
    this.filter.Q.value = 4;

    this.masterGain = audioCtx.createGain();
    this.masterGain.gain.value = 0;

    if (!this.isLocal) {
      this.panner = audioCtx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 10;
      this.panner.maxDistance = 200;
      this.panner.rolloffFactor = 1;
      this.filter.connect(this.masterGain);
      this.masterGain.connect(this.panner);
      this.panner.connect(audioCtx.destination);
    } else {
      this.filter.connect(this.masterGain);
      this.masterGain.connect(audioCtx.destination);
    }
  }

  rebuildFromTrail(trail) {
    if (!audioCtx || !this.masterGain) return;
    for (const v of this.voices) {
      v.osc.stop();
      v.osc.disconnect();
      v.gain.disconnect();
    }
    this.voices = [];

    const segs = trail.segments;
    if (segs.length === 0) {
      this._addVoice(this.baseNote, 'sawtooth', 1.0);
      return;
    }

    const recent = segs.slice(-this.maxVoices);
    const waveforms = ['sawtooth', 'triangle', 'square', 'sine'];

    recent.forEach((seg, i) => {
      const dx = seg.end.x - seg.start.x;
      const dz = seg.end.z - seg.start.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const normLen = Math.min(len, 100) / 100;
      const octave = 1 + Math.floor((1 - normLen) * 3);
      const degree = Math.floor(normLen * 37) % PENTATONIC.length;
      const freq = this.baseNote * PENTATONIC[degree] * octave;
      const wave = waveforms[i % waveforms.length];
      const vol = 0.4 + (i / recent.length) * 0.6;
      this._addVoice(freq, wave, vol);
    });
  }

  _addVoice(freq, wave, vol) {
    const osc = audioCtx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 15;

    const gain = audioCtx.createGain();
    gain.gain.value = vol;

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start();

    this.voices.push({ osc, gain, baseVol: vol });
  }

  update(cycle) {
    if (!audioCtx || !this.masterGain) return;

    if (!cycle.alive) {
      this.masterGain.gain.value *= 0.9;
      return;
    }

    const trail = cycle.trail;
    let curLen = 0;
    if (trail.currentStart) {
      const dx = cycle.x - trail.currentStart.x;
      const dz = cycle.z - trail.currentStart.z;
      curLen = Math.sqrt(dx * dx + dz * dz);
    }
    const lenFactor = Math.min(curLen, 80) / 80;
    this.filter.frequency.value = 200 + lenFactor * 800;

    const speedT = (cycle.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED);
    this.filter.Q.value = 2 + speedT * 8;

    const baseVol = this.isLocal ? 0.06 : 0.08;
    this.masterGain.gain.value = baseVol + speedT * 0.03;

    if (this.panner) {
      this.panner.setPosition(cycle.x, 1, cycle.z);
    }
  }

  bypass3D() {
    if (this.panner && this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain.connect(audioCtx.destination);
    }
  }

  stop() {
    if (this.masterGain) this.masterGain.gain.value = 0;
  }

  dispose() {
    for (const v of this.voices) {
      v.osc.stop();
      v.osc.disconnect();
      v.gain.disconnect();
    }
    this.voices = [];
    if (this.masterGain) this.masterGain.disconnect();
    if (this.filter) this.filter.disconnect();
    if (this.panner) this.panner.disconnect();
    this.masterGain = null;
    this.filter = null;
    this.panner = null;
  }
}

export function playTurnSound(synth, dir) {
  if (!audioCtx || !synth || synth.voices.length === 0) return;
  const now = audioCtx.currentTime;
  const bendCents = dir * 400;
  for (const v of synth.voices) {
    v.osc.detune.cancelScheduledValues(now);
    v.osc.detune.setValueAtTime(bendCents, now);
    v.osc.detune.linearRampToValueAtTime((Math.random() - 0.5) * 15, now + 0.15);
  }
  synth.filter.frequency.cancelScheduledValues(now);
  const curFilter = synth.filter.frequency.value;
  synth.filter.frequency.setValueAtTime(curFilter + 800, now);
  synth.filter.frequency.linearRampToValueAtTime(curFilter, now + 0.15);
}

export function playExplosionSound(crashedSynth) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const duration = 1.8;

  // Noise burst
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(2000, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(80, now + duration);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioCtx.destination);
  noise.start();

  // Low boom
  const boom = audioCtx.createOscillator();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(80, now);
  boom.frequency.exponentialRampToValueAtTime(18, now + 0.7);
  const boomGain = audioCtx.createGain();
  boomGain.gain.setValueAtTime(0.25, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  boom.connect(boomGain);
  boomGain.connect(audioCtx.destination);
  boom.start();
  boom.stop(now + 0.8);

  // Trail chord death scream
  if (crashedSynth && crashedSynth.voices.length > 0) {
    const distortion = audioCtx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = (Math.PI + 50) * x / (Math.PI + 50 * Math.abs(x));
    }
    distortion.curve = curve;
    distortion.oversample = '4x';

    const deathFilter = audioCtx.createBiquadFilter();
    deathFilter.type = 'lowpass';
    deathFilter.frequency.setValueAtTime(3000, now);
    deathFilter.frequency.exponentialRampToValueAtTime(60, now + duration);
    deathFilter.Q.value = 8;

    const deathGain = audioCtx.createGain();
    deathGain.gain.setValueAtTime(0.15, now);
    deathGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    distortion.connect(deathFilter);
    deathFilter.connect(deathGain);
    deathGain.connect(audioCtx.destination);

    for (const v of crashedSynth.voices) {
      const freq = v.osc.frequency.value;
      const wave = v.osc.type;
      const osc = audioCtx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(freq * 0.08, 15), now + duration);
      osc.detune.setValueAtTime(0, now);
      osc.detune.linearRampToValueAtTime((Math.random() - 0.5) * 1200, now + 0.3);
      osc.detune.linearRampToValueAtTime((Math.random() - 0.5) * 2400, now + duration);

      const vGain = audioCtx.createGain();
      vGain.gain.value = v.baseVol;
      osc.connect(vGain);
      vGain.connect(distortion);
      osc.start();
      osc.stop(now + duration);
    }
  }
}

export function playStartSound() {
  if (!audioCtx) return;
  const notes = [330, 440, 660];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.1);
    gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + i * 0.1 + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + i * 0.1);
    osc.stop(audioCtx.currentTime + i * 0.1 + 0.2);
  });
}

let victoryNodes = [];
let victoryInterval = null;

export function stopVictorySound() {
  if (victoryInterval) {
    clearInterval(victoryInterval);
    victoryInterval = null;
  }
  for (const node of victoryNodes) {
    try { if (node.stop) node.stop(); } catch(e) {}
    try { node.disconnect(); } catch(e) {}
  }
  victoryNodes = [];
}

export function playVictorySound(playerCycle, playerSynth) {
  if (!audioCtx || !playerCycle || !playerSynth) return;
  stopVictorySound();

  const points = [];
  const segs = playerCycle.trail.segments;
  if (segs.length > 0) {
    points.push(segs[0].start);
    for (const seg of segs) points.push(seg.end);
    points.push({ x: playerCycle.x, z: playerCycle.z });
  }
  if (points.length < 2 || playerSynth.voices.length === 0) return;

  const voiceSnapshots = playerSynth.voices.map(v => ({
    freq: v.osc.frequency.value,
    wave: v.osc.type,
  }));

  function xToMult(x) {
    const t = (x + HALF_ARENA) / ARENA_SIZE;
    return 0.25 + t * 3.75;
  }
  function zToAmp(z) {
    const t = (z + HALF_ARENA) / ARENA_SIZE;
    return 0.01 + t * 0.19;
  }

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = playerSynth.filter ? playerSynth.filter.frequency.value : 600;
  filter.Q.value = playerSynth.filter ? playerSynth.filter.Q.value : 4;
  filter.connect(audioCtx.destination);
  victoryNodes.push(filter);

  const timePerPoint = 0.15;
  const loopDuration = (points.length - 1) * timePerPoint + 0.3;
  let loopCount = 0;

  function scheduleLoop() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const iteration = loopCount++;
    const arpOffset = iteration % voiceSnapshots.length;
    const staggerTime = Math.min(0.12, iteration * 0.02);
    const reverse = iteration % 2 === 1;

    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.12;
    masterGain.connect(filter);
    victoryNodes.push(masterGain);

    voiceSnapshots.forEach((snap, vi) => {
      let arpIndex = (vi + arpOffset) % voiceSnapshots.length;
      if (reverse) arpIndex = voiceSnapshots.length - 1 - arpIndex;
      const voiceDelay = arpIndex * staggerTime;

      const osc = audioCtx.createOscillator();
      osc.type = snap.wave;

      const startTime = now + voiceDelay;
      osc.frequency.setValueAtTime(snap.freq * xToMult(points[0].x), startTime);
      for (let i = 1; i < points.length; i++) {
        osc.frequency.linearRampToValueAtTime(snap.freq * xToMult(points[i].x), startTime + i * timePerPoint);
      }

      const voiceGain = audioCtx.createGain();
      const perVoice = 1.0 / voiceSnapshots.length;
      voiceGain.gain.setValueAtTime(0.001, startTime);
      voiceGain.gain.linearRampToValueAtTime(perVoice, startTime + 0.05);
      const voiceEnd = startTime + (points.length - 1) * timePerPoint;
      voiceGain.gain.setValueAtTime(perVoice, voiceEnd);
      voiceGain.gain.linearRampToValueAtTime(0.001, voiceEnd + 0.2);

      const ampGain = audioCtx.createGain();
      ampGain.gain.setValueAtTime(zToAmp(points[0].z), startTime);
      for (let i = 1; i < points.length; i++) {
        ampGain.gain.linearRampToValueAtTime(zToAmp(points[i].z), startTime + i * timePerPoint);
      }

      osc.connect(voiceGain);
      voiceGain.connect(ampGain);
      ampGain.connect(masterGain);

      const stopTime = voiceEnd + 0.3;
      osc.start(startTime);
      osc.stop(stopTime);
      victoryNodes.push(osc, voiceGain, ampGain);
    });
  }

  scheduleLoop();
  victoryInterval = setInterval(() => {
    scheduleLoop();
  }, loopDuration * 1000);
}
