import * as THREE from 'three';
import { PLAYER_COLORS, SPAWN_POSITIONS, MIN_SPEED, MAX_SPEED } from '../shared/constants.js';
import { S2C } from '../shared/protocol.js';
import { renderer, scene, camera, createArena, updateCamera, Explosion } from './renderer.js';
import { ClientCycle } from './ClientCycle.js';
import {
  initAudio, setThreeRef, updateAudioListener,
  playStartSound, playTurnSound, playExplosionSound,
  playVictorySound, stopVictorySound,
} from './audio.js';
import { drawMinimap } from './Minimap.js';
import { connect, createRoom, joinRoom, sendReady, sendAddAI, sendRemoveAI, sendTurn, sendSpeed } from './network.js';

setThreeRef(THREE);

// --- State ---
let gameState = 'lobby'; // lobby, room, countdown, playing, exploding, gameover
let cycles = [];
let localPlayerId = -1;
let isHost = false;
let score = 0;
let gameTime = 0;
let gameOverTimer = 0;
let gameOverScore = 0;
let tick = 0;
let synthFadeTimer = 0;
const SYNTH_FADE_DURATION = 5.0;
const explosions = [];

// --- DOM ---
const lobbyDiv = document.getElementById('lobby');
const roomLobbyDiv = document.getElementById('room-lobby');
const countdownDiv = document.getElementById('countdown-display');
const overlayDiv = document.getElementById('overlay');
const gameOverDiv = document.getElementById('game-over');
const hudDiv = document.getElementById('hud');
const minimapCanvas = document.getElementById('minimap');
const speedLabel = document.getElementById('speed-label');
const speedBarContainer = document.getElementById('speed-bar-container');

function showScreen(screen) {
  lobbyDiv.style.display = 'none';
  roomLobbyDiv.style.display = 'none';
  countdownDiv.style.display = 'none';
  overlayDiv.style.display = 'none';
  gameOverDiv.style.display = 'none';
  hudDiv.style.display = 'none';
  minimapCanvas.style.display = 'none';
  speedLabel.style.display = 'none';
  speedBarContainer.style.display = 'none';

  switch (screen) {
    case 'lobby':
      lobbyDiv.style.display = 'flex';
      break;
    case 'room':
      roomLobbyDiv.style.display = 'flex';
      break;
    case 'countdown':
      countdownDiv.style.display = 'flex';
      break;
    case 'playing':
      hudDiv.style.display = 'block';
      minimapCanvas.style.display = 'block';
      speedLabel.style.display = 'block';
      speedBarContainer.style.display = 'block';
      break;
    case 'gameover':
      gameOverDiv.style.display = 'flex';
      hudDiv.style.display = 'block';
      minimapCanvas.style.display = 'block';
      break;
  }
}

// --- Arena ---
createArena();

// --- Lobby UI ---
document.getElementById('create-btn').addEventListener('click', () => {
  initAudio();
  createRoom('Player');
});

document.getElementById('join-btn').addEventListener('click', () => {
  const code = document.getElementById('room-input').value.trim();
  if (code.length !== 4) return;
  initAudio();
  joinRoom(code, 'Player');
});

document.getElementById('room-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('join-btn').click();
});

document.getElementById('room-code-display').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
});

document.getElementById('start-game-btn').addEventListener('click', () => {
  sendReady();
});

document.getElementById('add-ai-btn').addEventListener('click', () => {
  sendAddAI();
});

document.getElementById('remove-ai-btn').addEventListener('click', () => {
  sendRemoveAI();
});

// --- Network message handler ---
function onServerMessage(msg) {
  switch (msg.type) {
    case S2C.ROOM_JOINED:
      localPlayerId = msg.playerId;
      isHost = msg.isHost;
      document.getElementById('room-code-display').textContent = msg.roomCode;
      document.getElementById('start-game-btn').style.display = isHost ? 'block' : 'none';
      document.getElementById('ai-controls').style.display = isHost ? 'flex' : 'none';
      updatePlayerList(msg.players);
      gameState = 'room';
      showScreen('room');
      break;

    case S2C.PLAYER_JOINED:
    case S2C.PLAYER_LEFT:
      if (msg.players) updatePlayerList(msg.players);
      break;

    case S2C.COUNTDOWN: {
      gameState = 'countdown';
      showScreen('countdown');
      countdownDiv.textContent = msg.seconds;
      break;
    }

    case S2C.GAME_START:
      startGame(msg);
      break;

    case S2C.TURN:
      handleRemoteTurn(msg);
      break;

    case S2C.SPEED_CHANGE:
      handleRemoteSpeed(msg);
      break;

    case S2C.STATE_SNAPSHOT:
      handleSnapshot(msg);
      break;

    case S2C.CYCLE_DIED:
      handleCycleDied(msg);
      break;

    case S2C.GAME_OVER:
      handleGameOver(msg);
      break;

    case S2C.ERROR:
      console.error('Server error:', msg.message);
      alert(msg.message);
      break;
  }
}

function updatePlayerList(players) {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const li = document.createElement('li');
    const p = players.find(pp => pp.slot === i);
    if (p) {
      const color = PLAYER_COLORS[i];
      li.textContent = p.name + (p.isAI ? ' (AI)' : '') + (p.id === localPlayerId ? ' (You)' : '');
      li.style.borderColor = color.hex;
      li.style.color = color.hex;
    } else {
      li.textContent = 'Empty';
      li.className = 'empty-slot';
    }
    list.appendChild(li);
  }
}

// --- Game start ---
function startGame(msg) {
  // Clean up old cycles
  for (const c of cycles) c.destroy();
  cycles = [];
  for (const e of explosions) e.dispose();
  explosions.length = 0;
  stopVictorySound();

  tick = msg.tick || 0;
  score = 0;
  gameTime = 0;
  document.getElementById('score').textContent = 'SCORE: 0';

  // Create cycles from server data
  for (const cd of msg.cycles) {
    const color = PLAYER_COLORS[cd.slot || cd.id];
    const isLocal = cd.id === localPlayerId;
    const cycle = new ClientCycle(
      cd.id, cd.x, cd.z, cd.angle,
      color.int, color.hex, cd.isAI, isLocal
    );
    cycle.state.speed = cd.speed || 30;
    cycles.push(cycle);
  }

  playStartSound();
  gameState = 'playing';
  showScreen('playing');
}

// --- Remote events ---
function handleRemoteTurn(msg) {
  const cycle = cycles.find(c => c.id === msg.playerId);
  if (!cycle || cycle.isLocal) return; // local player already predicted
  // Snap to authoritative position before turning
  cycle.state.x = msg.x;
  cycle.state.z = msg.z;
  cycle.state.angle = msg.angle;
  cycle.turn(msg.dir);
}

function handleRemoteSpeed(msg) {
  const cycle = cycles.find(c => c.id === msg.playerId);
  if (!cycle || cycle.isLocal) return;
  cycle.setSpeed(msg.speed);
}

function handleSnapshot(msg) {
  tick = msg.tick;
  for (const cs of msg.cycles) {
    const cycle = cycles.find(c => c.id === cs.id);
    if (!cycle) continue;
    // For remote cycles, snap to server state
    // For local cycle, gently correct
    if (cycle.isLocal) {
      const dx = cs.x - cycle.x;
      const dz = cs.z - cycle.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 3) {
        // Large discrepancy — snap
        cycle.state.x = cs.x;
        cycle.state.z = cs.z;
      } else if (dist > 0.5) {
        // Smooth correction
        cycle.state.x += dx * 0.3;
        cycle.state.z += dz * 0.3;
      }
    } else {
      cycle.state.x = cs.x;
      cycle.state.z = cs.z;
      cycle.state.angle = cs.angle;
      cycle.state.speed = cs.speed;
    }
    cycle.state.alive = cs.alive;
  }
}

function handleCycleDied(msg) {
  const cycle = cycles.find(c => c.id === msg.playerId);
  if (!cycle) return;
  cycle.alive = false;
  scene.remove(cycle.model);
  explosions.push(new Explosion(cycle.x, cycle.z, cycle.colorInt));
  playExplosionSound(cycle.synth);

  // If the local player just died, transition to exploding immediately
  if (msg.playerId === localPlayerId && gameState === 'playing') {
    gameState = 'exploding';
    gameOverTimer = 1.5;
    gameOverScore = score;
  }
}

function showLocalGameOver() {
  if (gameState === 'gameover') return;
  gameState = 'gameover';
  gameOverScore = score;

  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');

  const localCycle = cycles.find(c => c.id === localPlayerId);
  const localAlive = localCycle && localCycle.alive;

  if (!localAlive) {
    resultText.textContent = 'DEREZZED';
    resultText.style.color = '#ff0044';
    resultText.style.textShadow = '0 0 30px #ff0044';
    resultDetail.textContent = 'You crashed! Score: ' + gameOverScore;
  } else {
    resultText.textContent = 'VICTORY';
    resultText.style.color = '#00ffcc';
    resultText.style.textShadow = '0 0 30px #00ffcc';
    resultDetail.textContent = 'Score: ' + gameOverScore;
    playVictorySound(localCycle, localCycle.synth);
  }

  // Fade synths
  synthFadeTimer = SYNTH_FADE_DURATION;
  for (const c of cycles) {
    if (c.synth) {
      c.synth.bypass3D();
      if (c.synth.masterGain) c.synth.masterGain.gain.value = 0.15;
    }
  }

  showScreen('gameover');
}

function handleGameOver(msg) {
  // Server confirmed game over — update the screen if not already showing
  gameOverScore = msg.score || score;

  const resultText = document.getElementById('result-text');
  const resultDetail = document.getElementById('result-detail');

  const localCycle = cycles.find(c => c.id === localPlayerId);
  const localAlive = localCycle && localCycle.alive;
  const aliveCount = cycles.filter(c => c.alive).length;

  if (aliveCount === 0) {
    resultText.textContent = 'DRAW';
    resultText.style.color = '#888';
    resultText.style.textShadow = '0 0 30px #888';
    resultDetail.textContent = 'All cycles derezzed! Score: ' + gameOverScore;
  } else if (!localAlive) {
    resultText.textContent = 'DEREZZED';
    resultText.style.color = '#ff0044';
    resultText.style.textShadow = '0 0 30px #ff0044';
    resultDetail.textContent = 'You crashed! Score: ' + gameOverScore;
  } else {
    resultText.textContent = 'VICTORY';
    resultText.style.color = '#00ffcc';
    resultText.style.textShadow = '0 0 30px #00ffcc';
    resultDetail.textContent = 'Score: ' + gameOverScore;
    if (gameState !== 'gameover') {
      playVictorySound(localCycle, localCycle.synth);
    }
  }

  if (gameState !== 'gameover') {
    synthFadeTimer = SYNTH_FADE_DURATION;
    for (const c of cycles) {
      if (c.synth) {
        c.synth.bypass3D();
        if (c.synth.masterGain) c.synth.masterGain.gain.value = 0.15;
      }
    }
  }

  gameState = 'gameover';
  showScreen('gameover');
}

// --- Input ---
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;

  if (e.code === 'Space') {
    e.preventDefault();
    if (gameState === 'gameover') {
      // Tell server we want to restart (go back to room lobby)
      gameState = 'room';
      showScreen('room');
    }
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// --- Game Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameState === 'playing') {
    gameTime += dt;
    tick++;
    score = Math.floor(gameTime * 10);
    document.getElementById('score').textContent = 'SCORE: ' + score;

    const localCycle = cycles.find(c => c.id === localPlayerId);

    // Player input
    if (localCycle && localCycle.alive) {
      if ((keys['KeyA'] || keys['ArrowLeft']) && localCycle.turnCooldown <= 0) {
        localCycle.turn(1);
        playTurnSound(localCycle.synth, 1);
        sendTurn(1, tick);
        keys['KeyA'] = false;
        keys['ArrowLeft'] = false;
      }
      if ((keys['KeyD'] || keys['ArrowRight']) && localCycle.turnCooldown <= 0) {
        localCycle.turn(-1);
        playTurnSound(localCycle.synth, -1);
        sendTurn(-1, tick);
        keys['KeyD'] = false;
        keys['ArrowRight'] = false;
      }

      // Speed control
      if (keys['KeyW'] || keys['ArrowUp']) {
        const newSpeed = Math.min(MAX_SPEED, localCycle.speed + 30 * dt);
        localCycle.setSpeed(newSpeed);
        sendSpeed(newSpeed, tick);
      }
      if (keys['KeyS'] || keys['ArrowDown']) {
        const newSpeed = Math.max(MIN_SPEED, localCycle.speed - 30 * dt);
        localCycle.setSpeed(newSpeed);
        sendSpeed(newSpeed, tick);
      }

      // Speed bar
      const speedPct = ((localCycle.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 100;
      document.getElementById('speed-bar').style.width = speedPct + '%';
    }

    // Update all cycles (movement only — server handles collisions)
    for (const cycle of cycles) {
      cycle.update(dt);
    }
  }

  // Fade synths during exploding/gameover
  if (gameState === 'exploding' || gameState === 'gameover') {
    synthFadeTimer = Math.max(0, synthFadeTimer - dt);
    const fadeFactor = synthFadeTimer / SYNTH_FADE_DURATION;
    for (const c of cycles) {
      if (c.synth && c.synth.masterGain) {
        c.synth.masterGain.gain.value = 0.15 * fadeFactor;
      }
    }
    if (synthFadeTimer <= 0) {
      for (const c of cycles) {
        if (c.synth) c.synth.stop();
      }
    }
  }

  if (gameState === 'exploding') {
    gameOverTimer -= dt;
    if (gameOverTimer <= 0) {
      // Show game-over screen now (server game_over may arrive later and update it)
      showLocalGameOver();
    }
  }

  // Update explosions
  for (let i = explosions.length - 1; i >= 0; i--) {
    if (!explosions[i].update(dt)) {
      explosions[i].dispose();
      explosions.splice(i, 1);
    }
  }

  // Camera follows local player (or first alive cycle)
  const camTarget = cycles.find(c => c.id === localPlayerId) || cycles[0];
  if (camTarget) {
    updateCamera(camTarget);
  }

  updateAudioListener(camera);
  if (gameState === 'playing' || gameState === 'exploding' || gameState === 'gameover') {
    drawMinimap(cycles);
  }
  renderer.render(scene, camera);
}

// --- Init ---
showScreen('lobby');
connect(onServerMessage);
animate();
