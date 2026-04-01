import { ARENA_SIZE, HALF_ARENA } from '../shared/constants.js';

const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

export function drawMinimap(cycles) {
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  minimapCtx.fillStyle = 'rgba(0, 5, 8, 0.9)';
  minimapCtx.fillRect(0, 0, w, h);

  const scale = w / ARENA_SIZE;

  function toMap(x, z) {
    return [(x + HALF_ARENA) * scale, (z + HALF_ARENA) * scale];
  }

  for (const cycle of cycles) {
    const trail = cycle.trail;
    const color = cycle.colorHex;

    // Draw finalized segments
    minimapCtx.strokeStyle = color;
    minimapCtx.lineWidth = 2;
    for (const seg of trail.segments) {
      const [x1, y1] = toMap(seg.start.x, seg.start.z);
      const [x2, y2] = toMap(seg.end.x, seg.end.z);
      minimapCtx.beginPath();
      minimapCtx.moveTo(x1, y1);
      minimapCtx.lineTo(x2, y2);
      minimapCtx.stroke();
    }

    // Current segment
    if (trail.currentStart) {
      const [x1, y1] = toMap(trail.currentStart.x, trail.currentStart.z);
      const [x2, y2] = toMap(cycle.x, cycle.z);
      minimapCtx.beginPath();
      minimapCtx.moveTo(x1, y1);
      minimapCtx.lineTo(x2, y2);
      minimapCtx.stroke();
    }

    // Cycle dot
    if (cycle.alive) {
      const [mx, my] = toMap(cycle.x, cycle.z);
      minimapCtx.fillStyle = color;
      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, 4, 0, Math.PI * 2);
      minimapCtx.fill();
      minimapCtx.fillStyle = '#fff';
      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, 2, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // Border
  minimapCtx.strokeStyle = '#003333';
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(0, 0, w, h);
}
