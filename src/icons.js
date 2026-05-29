import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { buildGroundMesh } from './weapons.js';
import { ITEMS } from './items.js';

// Cache: itemId → dataURL string
const _cache = {};
let   _built = false;

export function buildIcons() {
  if (_built) return;
  _built = true;

  const SIZE = 64;
  const gl = new THREE.WebGLRenderer({
    antialias: true, alpha: false, preserveDrawingBuffer: true,
  });
  gl.setSize(SIZE, SIZE);
  gl.setPixelRatio(1);
  gl.setClearColor(0x080a14, 1);
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.1;

  // Lighting for icons
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffe8cc, 1.1);
  key.position.set(2, 3, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8899cc, 0.40);
  fill.position.set(-1.5, 1, -1);
  scene.add(fill);

  // Orthographic camera — slightly top-down, angled
  const cam = new THREE.OrthographicCamera(-0.62, 0.62, 0.62, -0.62, 0.1, 12);
  cam.position.set(1.3, 1.1, 1.3);
  cam.lookAt(0, 0.05, 0);

  for (const [id, def] of Object.entries(ITEMS)) {
    const m = buildGroundMesh(id, def.color);
    // Add a slight y-rotation so 3-D depth is visible
    m.rotation.y += 0.45;
    scene.add(m);
    gl.render(scene, cam);
    _cache[id] = gl.domElement.toDataURL('image/png');
    scene.remove(m);
    // Dispose geometry & material of every mesh in the group
    m.traverse(c => {
      if (c.isMesh) { c.geometry?.dispose(); c.material?.dispose(); }
    });
  }

  gl.dispose();
}

export function getIcon(id) { return _cache[id] ?? null; }
