import { C2S } from '../shared/protocol.js';

let ws = null;
let messageHandler = null;

export function connect(onMessage) {
  messageHandler = onMessage;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    console.log('Connected to server');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (messageHandler) messageHandler(msg);
    } catch (e) {
      console.error('Bad message:', e);
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
    ws = null;
    // Auto-reconnect after 2 seconds
    setTimeout(() => {
      if (!ws) connect(messageHandler);
    }, 2000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

export function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createRoom(playerName) {
  send({ type: C2S.CREATE, playerName });
}

export function joinRoom(roomCode, playerName) {
  send({ type: C2S.JOIN, roomCode: roomCode.toUpperCase(), playerName });
}

export function sendReady() {
  send({ type: C2S.READY });
}

export function sendTurn(dir, tick) {
  send({ type: C2S.TURN, dir, tick });
}

let lastSpeedSent = 0;
let lastSpeedTime = 0;

export function sendSpeed(speed, tick) {
  const now = Date.now();
  // Throttle speed messages to every 100ms
  if (now - lastSpeedTime < 100 && Math.abs(speed - lastSpeedSent) < 2) return;
  lastSpeedTime = now;
  lastSpeedSent = speed;
  send({ type: C2S.SPEED, speed, tick });
}

export function sendLeave() {
  send({ type: C2S.LEAVE });
}
