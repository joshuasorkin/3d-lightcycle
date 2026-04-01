import * as THREE from 'three';
import { ARENA_SIZE, HALF_ARENA, WALL_HEIGHT, TRAIL_WIDTH, GRID_COLOR } from '../shared/constants.js';

// --- Renderer singleton ---
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000508);
scene.fog = new THREE.Fog(0x000508, 200, 1000);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

// Lighting
const ambientLight = new THREE.AmbientLight(0x111122, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x224466, 0.4);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// --- Arena ---
export function createArena() {
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x000a0a,
    roughness: 0.8,
    metalness: 0.2,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.receiveShadow = true;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(ARENA_SIZE, 60, GRID_COLOR, GRID_COLOR);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Arena walls with random polygons
  const wallHeight = 15;
  const polyGeos = [
    new THREE.TetrahedronGeometry(1),
    new THREE.OctahedronGeometry(0.8),
    new THREE.IcosahedronGeometry(0.7),
    new THREE.DodecahedronGeometry(0.6),
    new THREE.TetrahedronGeometry(0.5),
    new THREE.BoxGeometry(1.2, 0.8, 0.3),
    new THREE.ConeGeometry(0.5, 1.0, 5),
  ];
  const polyColors = [0x003333, 0x004444, 0x002222, 0x005555, 0x001a1a, 0x006666];

  const walls = [
    { axis: 'z', sign: -1 },
    { axis: 'z', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'x', sign: 1 },
  ];

  walls.forEach(wall => {
    const polyCount = 120;
    for (let i = 0; i < polyCount; i++) {
      const geo = polyGeos[Math.floor(Math.random() * polyGeos.length)];
      const color = polyColors[Math.floor(Math.random() * polyColors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.3 + Math.random() * 0.4,
        metalness: 0.6,
        roughness: 0.3,
        transparent: true,
        opacity: 0.5 + Math.random() * 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const along = (Math.random() - 0.5) * ARENA_SIZE;
      const y = Math.random() * wallHeight;
      const scale = 0.5 + Math.random() * 2.0;
      mesh.scale.set(scale, scale, scale * (0.3 + Math.random() * 0.7));

      if (wall.axis === 'z') {
        mesh.position.set(along, y, wall.sign * HALF_ARENA);
      } else {
        mesh.position.set(wall.sign * HALF_ARENA, y, along);
      }
      mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      scene.add(mesh);
    }
  });
}

// --- Cycle Model ---
export function createCycleModel(color) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.8, 0.6, 2.5);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    emissive: color,
    emissiveIntensity: 0.3,
    metalness: 0.8,
    roughness: 0.2,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.7;
  body.castShadow = true;
  group.add(body);

  const stripGeo = new THREE.BoxGeometry(0.2, 0.15, 2.6);
  const stripMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.0,
  });
  const strip = new THREE.Mesh(stripGeo, stripMat);
  strip.position.y = 1.05;
  strip.castShadow = true;
  group.add(strip);

  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.15, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.rotation.x = Math.PI / 2;
  frontWheel.position.set(0, 0.35, -1.0);
  frontWheel.castShadow = true;
  group.add(frontWheel);
  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rearWheel.rotation.x = Math.PI / 2;
  rearWheel.position.set(0, 0.35, 1.0);
  rearWheel.castShadow = true;
  group.add(rearWheel);

  const glow = new THREE.PointLight(color, 2, 15);
  glow.position.y = 1.5;
  group.add(glow);

  return group;
}

// --- Trail Rendering ---
export class ClientTrail {
  constructor(color) {
    this.color = color;
    this.meshes = []; // finalized segment meshes
    this.currentMesh = null;
    this.material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.85,
    });
  }

  updateCurrentSegment(startX, startZ, endX, endZ) {
    const dx = endX - startX;
    const dz = endZ - startZ;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) return;

    if (this.currentMesh) {
      scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
    }

    const geo = new THREE.BoxGeometry(TRAIL_WIDTH, WALL_HEIGHT, len);
    this.currentMesh = new THREE.Mesh(geo, this.material);
    this.currentMesh.position.set(startX + dx / 2, WALL_HEIGHT / 2, startZ + dz / 2);
    this.currentMesh.rotation.y = Math.atan2(dx, dz);
    this.currentMesh.castShadow = true;
    this.currentMesh.receiveShadow = true;
    scene.add(this.currentMesh);
  }

  addFinalizedSegment(seg) {
    const dx = seg.end.x - seg.start.x;
    const dz = seg.end.z - seg.start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.1) return;

    const geo = new THREE.BoxGeometry(TRAIL_WIDTH, WALL_HEIGHT, len);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(seg.start.x + dx / 2, WALL_HEIGHT / 2, seg.start.z + dz / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.meshes.push(mesh);
  }

  // Rebuild all meshes from trail data (used for snapshots/sync)
  rebuildFromData(segments) {
    this.clear();
    for (const seg of segments) {
      this.addFinalizedSegment(seg);
    }
  }

  clear() {
    for (const m of this.meshes) {
      scene.remove(m);
      m.geometry.dispose();
    }
    this.meshes = [];
    if (this.currentMesh) {
      scene.remove(this.currentMesh);
      this.currentMesh.geometry.dispose();
      this.currentMesh = null;
    }
  }
}

// --- Explosion ---
const shardGeometries = [
  new THREE.TetrahedronGeometry(0.4),
  new THREE.OctahedronGeometry(0.3),
  new THREE.BoxGeometry(0.5, 0.1, 0.3),
  new THREE.TetrahedronGeometry(0.25),
  new THREE.PlaneGeometry(0.5, 0.5),
];

export class Explosion {
  constructor(x, z, color) {
    this.shards = [];
    this.age = 0;
    this.lifetime = 3.0;

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });

    const count = 25;
    for (let i = 0; i < count; i++) {
      const geo = shardGeometries[Math.floor(Math.random() * shardGeometries.length)];
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.set(
        x + (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 1.0,
        z + (Math.random() - 0.5) * 1.5
      );
      const speed = 3 + Math.random() * 12;
      const angle = Math.random() * Math.PI * 2;
      this.shards.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 4 + Math.random() * 10,
        vz: Math.sin(angle) * speed,
        spinX: (Math.random() - 0.5) * 15,
        spinY: (Math.random() - 0.5) * 15,
        spinZ: (Math.random() - 0.5) * 15,
      });
      scene.add(mesh);
    }

    this.light = new THREE.PointLight(color, 8, 30);
    this.light.position.set(x, 3, z);
    scene.add(this.light);
  }

  update(dt) {
    this.age += dt;
    const fade = Math.max(0, 1 - this.age / this.lifetime);
    this.light.intensity = 8 * fade;

    for (const s of this.shards) {
      s.vy -= 15 * dt;
      s.mesh.position.x += s.vx * dt;
      s.mesh.position.y += s.vy * dt;
      s.mesh.position.z += s.vz * dt;

      if (s.mesh.position.y < 0.1) {
        s.mesh.position.y = 0.1;
        s.vy = Math.abs(s.vy) * 0.3;
        s.vx *= 0.7;
        s.vz *= 0.7;
      }

      s.mesh.rotation.x += s.spinX * dt;
      s.mesh.rotation.y += s.spinY * dt;
      s.mesh.rotation.z += s.spinZ * dt;
      s.spinX *= 0.995;
      s.spinY *= 0.995;
      s.spinZ *= 0.995;

      s.mesh.material.opacity = fade;
      s.mesh.material.emissiveIntensity = 1.5 * fade;
    }
    return this.age < this.lifetime;
  }

  dispose() {
    for (const s of this.shards) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    }
    scene.remove(this.light);
    this.light.dispose();
  }
}

// --- Camera ---
export function updateCamera(playerCycle) {
  const camDist = 6;
  const camHeight = 3.5;
  const camLookAhead = 15;
  const behindX = playerCycle.x - Math.sin(playerCycle.angle) * camDist;
  const behindZ = playerCycle.z - Math.cos(playerCycle.angle) * camDist;
  const lookX = playerCycle.x + Math.sin(playerCycle.angle) * camLookAhead;
  const lookZ = playerCycle.z + Math.cos(playerCycle.angle) * camLookAhead;

  camera.position.lerp(new THREE.Vector3(behindX, camHeight, behindZ), 0.15);
  camera.lookAt(lookX, 1.5, lookZ);
}

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
