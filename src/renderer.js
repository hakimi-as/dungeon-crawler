import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { TILE } from './constants.js';
import { buildViewWeapon } from './weapons.js';

const WALL_H   = 2.4;
export const EYE_H = 0.82;
const DIRS4    = [[1,0],[-1,0],[0,1],[0,-1]];

// ── Per-theme visual presets ──────────────────────────────────────────────────
const DUNGEON_THEMES = [
  { idx: 0,
    ceilTint:   0x334455,
    torchColor: 0xff8820, torchI: 5.5,
    variantA: 0x1a0a08, variantB: 0x090e07,
    ambientCol: 0x111128, ambientI: 0.45,
    candleCol:  0xff5500,
  },
  { idx: 1,
    ceilTint:   0x223344,
    torchColor: 0x6699cc, torchI: 5.0,
    variantA: 0x0c0d14, variantB: 0x0d0e0c,
    ambientCol: 0x0c1020, ambientI: 0.50,
    candleCol:  0x2244aa,
  },
  { idx: 2,
    ceilTint:   0x0d0010,
    torchColor: 0x9922cc, torchI: 6.0,
    variantA: 0x0a0008, variantB: 0x120006,
    ambientCol: 0x0c0010, ambientI: 0.40,
    candleCol:  0x440066,
  },
];


export class Renderer {
  constructor() {
    this.gl = new THREE.WebGLRenderer({ antialias: true });
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.gl.setSize(innerWidth, innerHeight);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    document.body.prepend(this.gl.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060810);
    this.scene.fog = new THREE.FogExp2(0x060810, 0.085);

    this.camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.05, 60);
    this.scene.add(this.camera);

    // Player torch — casts shadows, follows camera
    this.torch = new THREE.PointLight(0xff8820, 5.5, 13, 1.8);
    this.torch.castShadow = true;
    this.torch.shadow.mapSize.set(512, 512);
    this.camera.add(this.torch);

    this._ambientLight = new THREE.AmbientLight(0x111128, 0.45);
    this.scene.add(this._ambientLight);
    const moon = new THREE.DirectionalLight(0x223355, 0.08);
    moon.position.set(0, 10, 0);
    this.scene.add(moon);

    this._candleLights  = [];
    this._sconceLights  = [];
    this._sconceFlames  = [];
    this._worldObjects  = [];   // everything from buildWorld, for clearWorld()
    this._stairBeam     = null; // animated beam mesh for the stair beacon
    this._stairLight    = null; // point light at beacon base

    this._particles    = [];  // { mesh, vy, life, maxLife }
    this._scorchMarks  = [];  // { mesh, life, maxLife }
    this._swingArc     = null;
    this._swingArcLife = 0;

    // Pre-allocated glow light pool — avoids mid-game shader recompile hitches.
    // All lights are added to the scene NOW (intensity 0, parked off-screen) so
    // Three.js compiles the N-light shader variant once at startup.
    this._glowPool     = [];
    this._glowFree     = [];
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight(0x6633ff, 0, 2.8, 2.2);
      l.position.set(0, -200, 0);   // off-screen — invisible but counted by shader
      this.scene.add(l);
      this._glowPool.push(l);
      this._glowFree.push(l);
    }

    // First-person weapon viewmodel — child of camera so it moves with the view
    this._weaponGroup = new THREE.Group();
    this._weaponGroup.position.set(0.32, -0.30, -0.52);
    this._weaponGroup.visible = false;   // hidden until first weapon/attack
    this.camera.add(this._weaponGroup);
    this._currentWeaponId = undefined;   // must differ from null so setWeapon(null) builds the fist
    this.setWeapon(null);

    this._buildTextures(0);

    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.gl.setSize(innerWidth, innerHeight);
    });
  }

  // ── Procedural textures ───────────────────────────────────────────────────

  _buildTextures(themeIdx = 0) {
    const T = DUNGEON_THEMES[themeIdx] ?? DUNGEON_THEMES[0];
    // Dispose previous textures to avoid GPU memory leaks on floor transitions
    if (this.wallMat?.map)  this.wallMat.map.dispose();
    if (this.floorMat?.map) this.floorMat.map.dispose();
    if (this.ceilMat?.map)  this.ceilMat.map.dispose();
    this.wallMat  = new THREE.MeshLambertMaterial({ map: this._brickTex(T) });
    this.floorMat = new THREE.MeshLambertMaterial({ map: this._stoneTex(T) });
    this.ceilMat  = new THREE.MeshLambertMaterial({ map: this._ceilTex(), color: T.ceilTint });
    this._ambientLight.color.setHex(T.ambientCol);
    this._ambientLight.intensity = T.ambientI;
    this.torch.color.setHex(T.torchColor);
    this.torch.intensity = T.torchI;
    this._currentTheme = T;
  }

  _brickTex(T) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');

    if (T.idx === 0) {
      // DUNGEON: offset reddish-brown brick courses
      c.fillStyle = '#100c18'; c.fillRect(0, 0, 128, 128);
      for (let row = 0; row < 8; row++) {
        const off = (row % 2) * 20;
        for (let col = -1; col <= 3; col++) {
          const bx = col * 40 + off, by = row * 16;
          const sh = 16 + ((bx * 3 + by * 7) % 8);
          c.fillStyle = `rgb(${50+sh},${27+sh},${17+sh})`;
          c.fillRect(bx + 2, by + 2, 36, 12);
          c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(bx + 2, by + 2, 36, 3);
          c.fillStyle = 'rgba(0,0,0,0.30)';       c.fillRect(bx + 2, by + 12, 36, 2);
        }
      }

    } else if (T.idx === 1) {
      // CATACOMBS: large dressed stone blocks with carved inner-border panels
      c.fillStyle = '#181410'; c.fillRect(0, 0, 128, 128);
      [[0,0],[62,0],[0,32],[62,32],[0,64],[62,64],[0,96],[62,96]].forEach(([bx, by]) => {
        const sh = ((bx * 7 + by * 13) % 12);
        c.fillStyle = `rgb(${80+sh},${73+sh},${62+sh})`; // bone-pale stone
        c.fillRect(bx + 2, by + 2, 58, 28);
        c.strokeStyle = 'rgba(0,0,0,0.40)'; c.lineWidth = 1.2;
        c.strokeRect(bx + 6, by + 5, 50, 20);          // carved inner border
        c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(bx + 2, by + 2, 58, 3);
        c.fillStyle = 'rgba(0,0,0,0.28)';       c.fillRect(bx + 2, by + 27, 58, 2);
        // Carved rune mark on alternate blocks
        if (((bx / 62 + by / 32) % 2) === 0) {
          c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.9;
          const cx2 = bx + 31, cy2 = by + 15;
          c.beginPath(); c.arc(cx2, cy2, 4, 0, Math.PI * 2); c.stroke();
          c.beginPath(); c.moveTo(cx2 - 4, cy2); c.lineTo(cx2 + 4, cy2); c.stroke();
        }
      });

    } else {
      // ABYSS: near-black cracked obsidian with glowing purple veins
      c.fillStyle = '#050308'; c.fillRect(0, 0, 128, 128);
      // Irregular dark rock tiles
      [[0,0,60,30],[62,0,64,28],[0,32,44,32],[46,32,80,32],
       [0,66,70,28],[72,64,54,30],[0,96,58,30],[60,96,66,30]].forEach(([rx,ry,rw,rh]) => {
        const sh = ((rx * 3 + ry * 5) % 8);
        c.fillStyle = `rgb(${10+sh},${6+sh},${15+sh})`;
        c.fillRect(rx + 1, ry + 1, rw - 2, rh - 2);
      });
      // Glowing purple crack network — double-stroke fakes glow without shadowBlur
      const _cracks = [[5,8,28,22,20,42],[40,0,55,18,68,14],[90,5,112,20,108,38],
       [10,50,35,62,28,80],[60,45,78,60,92,52],[100,50,118,68,122,90],
       [8,95,22,110,14,128],[55,80,70,96,62,128],[96,85,112,102,128,110]];
      c.lineWidth = 2.8; c.strokeStyle = 'rgba(160,0,255,0.18)';
      _cracks.forEach(([x1,y1,x2,y2,x3,y3]) => { c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.lineTo(x3,y3); c.stroke(); });
      c.lineWidth = 0.9; c.strokeStyle = 'rgba(160,0,255,0.72)';
      _cracks.forEach(([x1,y1,x2,y2,x3,y3]) => { c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.lineTo(x3,y3); c.stroke(); });
      // Ember glow spots
      [[25,35],[85,22],[52,75],[110,65],[15,115]].forEach(([ex, ey]) => {
        const g = c.createRadialGradient(ex, ey, 0, ex, ey, 4);
        g.addColorStop(0, 'rgba(255,120,0,0.45)'); g.addColorStop(1, 'rgba(255,120,0,0)');
        c.fillStyle = g; c.fillRect(ex - 5, ey - 5, 10, 10);
      });
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1.2);
    return t;
  }

  _stoneTex(T) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');

    if (T.idx === 0) {
      // DUNGEON: warm dark stone tiles
      c.fillStyle = '#0b0807'; c.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) {
        const v = 6 + ((r * 3 + col * 7) % 5);
        c.fillStyle = `hsl(25,14%,${v}%)`; c.fillRect(col*32+1, r*32+1, 30, 30);
        c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(col*32+1, r*32+1, 30, 4);
        c.fillStyle = 'rgba(0,0,0,0.22)';       c.fillRect(col*32+1, r*32+27, 30, 3);
      }

    } else if (T.idx === 1) {
      // CATACOMBS: cold irregular flagstone with carved bone-cross details
      c.fillStyle = '#141218'; c.fillRect(0, 0, 128, 128);
      [[0,0,40,38],[42,0,84,40],[0,42,62,38],[64,42,62,38],
       [0,82,38,44],[40,82,42,44],[84,82,42,44]].forEach(([fx, fy, fw, fh]) => {
        const sh = ((fx * 5 + fy * 7) % 8);
        c.fillStyle = `rgb(${52+sh},${49+sh},${44+sh})`; // cold gray-tan flagstone
        c.fillRect(fx + 1, fy + 1, fw - 2, fh - 2);
        c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(fx + 1, fy + 1, fw - 2, 3);
        c.fillStyle = 'rgba(0,0,0,0.20)';       c.fillRect(fx + 1, fy + fh - 4, fw - 2, 3);
      });
      // Carved bone cross marks
      c.strokeStyle = 'rgba(150,140,120,0.22)'; c.lineWidth = 0.8;
      [[20,20],[106,20],[32,62],[96,62],[20,104],[105,104]].forEach(([bx, by]) => {
        c.beginPath(); c.moveTo(bx - 5, by); c.lineTo(bx + 5, by); c.stroke();
        c.beginPath(); c.moveTo(bx, by - 5); c.lineTo(bx, by + 5); c.stroke();
      });

    } else {
      // ABYSS: near-black obsidian with branching orange-red lava cracks
      c.fillStyle = '#040206'; c.fillRect(0, 0, 128, 128);
      for (let r = 0; r < 4; r++) for (let col = 0; col < 4; col++) {
        const v = 2 + ((r * 2 + col * 3) % 3);
        c.fillStyle = `hsl(290,12%,${v}%)`; c.fillRect(col*32+1, r*32+1, 30, 30);
        c.fillStyle = 'rgba(180,60,255,0.03)'; c.fillRect(col*32+1, r*32+1, 30, 4);
      }
      // Lava cracks — double-stroke fakes glow without shadowBlur
      const _lava = [[8,12,30,24,18,46],[60,0,72,18,88,8],[100,15,112,30,124,22],
       [5,65,22,78,10,100],[48,55,62,70,56,92],[90,60,108,78,118,72],
       [15,100,32,116,22,128],[70,95,84,112,90,128]];
      c.lineWidth = 2.2; c.strokeStyle = 'rgba(255,70,0,0.20)';
      _lava.forEach(([x1,y1,x2,y2,x3,y3]) => { c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.lineTo(x3,y3); c.stroke(); });
      c.lineWidth = 0.7; c.strokeStyle = 'rgba(255,70,0,0.65)';
      _lava.forEach(([x1,y1,x2,y2,x3,y3]) => { c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.lineTo(x3,y3); c.stroke(); });
    }

    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
    return t;
  }

  _ceilTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#060508'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = 'rgba(255,255,255,0.018)';
    for (let i = 0; i < 10; i++) c.fillRect((i*17)%64, (i*13)%64, 6, 2);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
    return t;
  }

  // ── World geometry ────────────────────────────────────────────────────────

  clearWorld() {
    for (const obj of this._worldObjects) this.scene.remove(obj);
    this._worldObjects  = [];
    this._candleLights  = [];
    this._sconceLights  = [];
    this._sconceFlames  = [];
    this._stairBeam     = null;
    this._stairLight    = null;

    for (const p of this._particles) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
    this._particles = [];
    for (const s of this._scorchMarks) { this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    this._scorchMarks = [];
    if (this._swingArc) { this.camera.remove(this._swingArc); this._swingArc = null; this._swingArcLife = 0; }
  }

  buildWorld(world, themeIdx = 0) {
    this._buildTextures(themeIdx);
    this.clearWorld();
    const T     = DUNGEON_THEMES[themeIdx] ?? DUNGEON_THEMES[0];
    const dummy = new THREE.Object3D();
    const walls  = [], floors = [];

    this._secretWallMeshes = new Map();   // key="${x},${z}" → mesh

    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) {
        const t = world.get(x, y);
        if (t === TILE.WALL)         walls.push([x, y]);
        else if (t === TILE.SECRET_WALL) {/* placed individually below */}
        else if (t !== TILE.VOID)    floors.push([x, y]);
      }

    // Walls (instanced — does NOT include SECRET_WALL)
    const wMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, WALL_H, 1), this.wallMat, walls.length
    );
    wMesh.castShadow = wMesh.receiveShadow = true;
    walls.forEach(([x, y], i) => {
      dummy.position.set(x + 0.5, WALL_H / 2, y + 0.5);
      dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      wMesh.setMatrixAt(i, dummy.matrix);
    });
    wMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(wMesh);
    this._worldObjects.push(wMesh);

    // Floors
    const fMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1), this.floorMat, floors.length
    );
    fMesh.receiveShadow = true;
    floors.forEach(([x, y], i) => {
      dummy.position.set(x + 0.5, 0, y + 0.5);
      dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.updateMatrix();
      fMesh.setMatrixAt(i, dummy.matrix);
    });
    fMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(fMesh);
    this._worldObjects.push(fMesh);

    // Variant floor tiles — theme-flavored detail patches on ~12% of floor tiles
    const variantTiles = floors.filter(() => Math.random() < 0.12);
    if (variantTiles.length > 0) {
      const varMat = new THREE.MeshLambertMaterial({ map: this.floorMat.map, color: T.variantA });
      const vMesh  = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.9, 0.9), varMat, variantTiles.length
      );
      vMesh.receiveShadow = true;
      variantTiles.forEach(([x, y], i) => {
        dummy.position.set(x + 0.5, 0.001, y + 0.5);
        dummy.rotation.set(-Math.PI / 2, 0, Math.floor(Math.random() * 4) * Math.PI / 2);
        dummy.updateMatrix();
        vMesh.setMatrixAt(i, dummy.matrix);
        vMesh.setColorAt(i, Math.random() < 0.5
          ? new THREE.Color(T.variantA)
          : new THREE.Color(T.variantB)
        );
      });
      vMesh.instanceMatrix.needsUpdate = true;
      if (vMesh.instanceColor) vMesh.instanceColor.needsUpdate = true;
      this.scene.add(vMesh);
      this._worldObjects.push(vMesh);
    }

    // Ceilings
    const cMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1), this.ceilMat, floors.length
    );
    floors.forEach(([x, y], i) => {
      dummy.position.set(x + 0.5, WALL_H, y + 0.5);
      dummy.rotation.set(Math.PI / 2, 0, 0); dummy.updateMatrix();
      cMesh.setMatrixAt(i, dummy.matrix);
    });
    cMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(cMesh);
    this._worldObjects.push(cMesh);

    // Secret wall tiles — individual meshes so they can be removed when opened
    const secretMat = this.wallMat.clone();
    secretMat.emissive = new THREE.Color(0x330033);
    secretMat.emissiveIntensity = 0.12;  // barely-visible hint of something different
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (world.get(x, y) !== TILE.SECRET_WALL) continue;
        const sm = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1), secretMat.clone());
        sm.castShadow = sm.receiveShadow = true;
        sm.position.set(x + 0.5, WALL_H / 2, y + 0.5);
        this.scene.add(sm);
        this._worldObjects.push(sm);
        this._secretWallMeshes.set(`${x},${y}`, sm);
      }
    }

    // Trap tiles — spike plate visuals on floor
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (world.get(x, y) !== TILE.TRAP) continue;
        this._placeTrap(x, y);
      }
    }

    // Ambient ceiling fill lights — sparser in Abyss to keep light count low
    const candleStep = themeIdx === 2 ? 15 : 9;
    for (let y = 4; y < world.height; y += candleStep)
      for (let x = 4; x < world.width; x += candleStep)
        if (world.get(x, y) === TILE.FLOOR) {
          const l = new THREE.PointLight(T.candleCol, 0.9, 7, 2.2);
          l.position.set(x + 0.5, WALL_H - 0.3, y + 0.5);
          this.scene.add(l);
          this._candleLights.push(l);
          this._worldObjects.push(l);
        }

    // Wall fixtures (torch / candelabra / void-crystal) — per-theme mesh
    this._buildSconces(world, floors, themeIdx);

    // Environmental props — entirely different geometry per theme
    this._addThemeProps(world, floors, themeIdx);
  }

  _placeTrap(x, z) {
    const g = new THREE.Group();
    g.position.set(x + 0.5, 0.002, z + 0.5);
    const baseMat  = new THREE.MeshLambertMaterial({ color: 0x556066 });
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x8899aa, emissive: 0x112233, emissiveIntensity: 0.4 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.040, 0.72), baseMat);
    g.add(base);
    [-0.18, 0.18].forEach(sx => [-0.18, 0.18].forEach(sz => {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.040, 0.18, 5), spikeMat.clone());
      spike.position.set(sx, 0.10, sz);
      g.add(spike);
    }));
    // Center spike slightly larger
    const center = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.22, 5), spikeMat.clone());
    center.position.y = 0.11;
    g.add(center);
    this.scene.add(g);
    this._worldObjects.push(g);
  }

  openSecretWall(x, z) {
    const key = `${x},${z}`;
    const sm = this._secretWallMeshes?.get(key);
    if (!sm) return false;
    this.scene.remove(sm);
    sm.geometry.dispose(); sm.material.dispose();
    this._secretWallMeshes.delete(key);
    return true;
  }

  _buildSconces(world, floors, themeIdx = 0) {
    const MAX  = themeIdx === 2 ? 28 : 42;  // Abyss: fewer sconces = fewer PointLights
    const MIND = 3;    // min tile distance between sconces
    const placed = [];
    const candidates = [];

    for (const [fx, fz] of floors) {
      for (const [dx, dz] of DIRS4) {
        if (world.get(fx + dx, fz + dz) === TILE.WALL)
          candidates.push({ fx, fz, wx: fx + dx, wz: fz + dz, dx, dz });
      }
    }

    // Fisher-Yates shuffle for even distribution
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const c of candidates) {
      if (placed.length >= MAX) break;
      const cx = c.wx + 0.5, cz = c.wz + 0.5;
      if (placed.some(p => Math.hypot(p[0] - cx, p[1] - cz) < MIND)) continue;
      placed.push([cx, cz]);
      this._placeSconce(c.wx, c.wz, c.dx, c.dz, themeIdx);
    }
  }

  _placeSconce(wx, wz, dx, dz, themeIdx = 0) {
    if (themeIdx === 1) { this._placeBoneCandelabra(wx, wz, dx, dz); return; }
    if (themeIdx === 2) { this._placeVoidCrystal(wx, wz, dx, dz); return; }
    this._placeIronTorch(wx, wz, dx, dz);
  }

  // DUNGEON — iron wall bracket with wooden torch and orange flame
  _placeIronTorch(wx, wz, dx, dz) {
    const g = new THREE.Group();
    g.position.set(wx + 0.5 - dx * 0.5, WALL_H * 0.46, wz + 0.5 - dz * 0.5);
    g.rotation.y = Math.atan2(-dx, -dz);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x555555 }));
    bracket.position.set(0, 0, 0.03); g.add(bracket);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x444444 }));
    arm.position.set(0, 0.02, 0.11); g.add(arm);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.32, 7),
      new THREE.MeshLambertMaterial({ color: 0x5c3318 }));
    handle.position.set(0, 0.20, 0.19); handle.rotation.x = -0.20; g.add(handle);

    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.044, 0.08, 7),
      new THREE.MeshLambertMaterial({ color: 0x3a2208 }));
    wrap.position.set(0, 0.36, 0.22); g.add(wrap);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.28, 8),
      new THREE.MeshLambertMaterial({ color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 3.2 }));
    flame.position.set(0, 0.52, 0.24); g.add(flame);
    this._sconceFlames.push(flame);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffee77, emissiveIntensity: 5.0 }));
    core.position.set(0, 0.43, 0.24); g.add(core);

    const light = new THREE.PointLight(0xff7700, 3.5, 10, 1.8);
    light.position.set(0, 0.50, 0.50); g.add(light);
    this._sconceLights.push(light);

    this.scene.add(g); this._worldObjects.push(g);
  }

  // CATACOMBS — bone candelabra: pale bracket, bone staff, skull decoration, cold blue candle
  _placeBoneCandelabra(wx, wz, dx, dz) {
    const g = new THREE.Group();
    g.position.set(wx + 0.5 - dx * 0.5, WALL_H * 0.46, wz + 0.5 - dz * 0.5);
    g.rotation.y = Math.atan2(-dx, -dz);
    const BONE = 0xddd0a8;

    // Bone plaque flush against wall
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.04),
      new THREE.MeshLambertMaterial({ color: BONE }));
    plaque.position.set(0, 0, 0.02); g.add(plaque);

    // Horizontal bone arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.22, 5),
      new THREE.MeshLambertMaterial({ color: BONE }));
    arm.position.set(0, 0.01, 0.13); arm.rotation.x = Math.PI / 2; g.add(arm);

    // Vertical bone staff
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 0.40, 6),
      new THREE.MeshLambertMaterial({ color: BONE }));
    staff.position.set(0, 0.22, 0.24); staff.rotation.x = -0.12; g.add(staff);

    // Skull atop staff
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.066, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0xe8e0c0 }));
    skull.position.set(0, 0.45, 0.26); g.add(skull);
    // Eye sockets
    const eyeM = new THREE.MeshLambertMaterial({ color: 0x060404 });
    [-0.027, 0.027].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), eyeM.clone());
      eye.position.set(ex, 0.458, 0.316); g.add(eye);
    });
    // Jaw
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.026, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xe0d8b8 }));
    jaw.position.set(0, 0.402, 0.282); g.add(jaw);

    // Wax candle stub on staff
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.10, 6),
      new THREE.MeshLambertMaterial({ color: 0xeeeedd }));
    candle.position.set(0, 0.38, 0.25); g.add(candle);

    // Cold blue flame — narrow like a candle flame
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.16, 6),
      new THREE.MeshLambertMaterial({ color: 0x88ccff, emissive: 0x2244cc, emissiveIntensity: 2.8 }));
    flame.position.set(0, 0.47, 0.26); g.add(flame);
    this._sconceFlames.push(flame);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.026, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xaaddff, emissiveIntensity: 5.0 }));
    core.position.set(0, 0.44, 0.26); g.add(core);

    const light = new THREE.PointLight(0x4488cc, 3.2, 10, 1.8);
    light.position.set(0, 0.48, 0.52); g.add(light);
    this._sconceLights.push(light);

    this.scene.add(g); this._worldObjects.push(g);
  }

  // ABYSS — floating void crystal: dark wall plate, chain, pulsing OctahedronGeometry crystal
  _placeVoidCrystal(wx, wz, dx, dz) {
    const g = new THREE.Group();
    g.position.set(wx + 0.5 - dx * 0.5, WALL_H * 0.44, wz + 0.5 - dz * 0.5);
    g.rotation.y = Math.atan2(-dx, -dz);

    // Dark obsidian wall plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x0a0812 }));
    plate.position.set(0, 0, 0.02); g.add(plate);

    // Iron ring on plate
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.010, 5, 10),
      new THREE.MeshLambertMaterial({ color: 0x333344 }));
    ring.position.set(0, 0, 0.04); g.add(ring);

    // Short suspension chain (2 links)
    [0, 1].forEach(i => {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.007, 4, 7),
        new THREE.MeshLambertMaterial({ color: 0x222233 }));
      link.position.set(0, 0.08 + i * 0.06, 0.12);
      link.rotation.x = i % 2 === 0 ? Math.PI / 2 : 0;
      g.add(link);
    });

    // Main floating void crystal
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 0),
      new THREE.MeshLambertMaterial({ color: 0xcc00ff, emissive: 0x8800cc, emissiveIntensity: 4.0 }));
    crystal.position.set(0, 0.26, 0.26);
    crystal.rotation.set(0.3, 0.4, 0.2);
    g.add(crystal);
    this._sconceFlames.push(crystal);  // reuse for animation

    // Orbiting crystal shards
    [[-0.10, 0.30, 0.23], [0.09, 0.22, 0.29]].forEach(([sx, sy, sz]) => {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0),
        new THREE.MeshLambertMaterial({ color: 0xee44ff, emissive: 0xaa00ee, emissiveIntensity: 3.5 }));
      shard.position.set(sx, sy, sz); shard.rotation.set(0.5, 1.0, -0.4);
      g.add(shard);
    });

    // Inner glow core
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.050, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdd88ff, emissiveIntensity: 6.0 }));
    glow.position.set(0, 0.26, 0.26); g.add(glow);

    const light = new THREE.PointLight(0x8800cc, 4.0, 10, 1.8);
    light.position.set(0, 0.30, 0.56); g.add(light);
    this._sconceLights.push(light);

    this.scene.add(g); this._worldObjects.push(g);
  }

  // ── Theme-specific environmental props ────────────────────────────────────

  _addThemeProps(world, floors, themeIdx) {
    if (themeIdx === 0) this._addDungeonProps(world, floors);
    else if (themeIdx === 1) this._addCatacombProps(world, floors);
    else this._addAbyssProps(world, floors);
  }

  _addDungeonProps(world, floors) {
    const chainM = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const boneM  = new THREE.MeshLambertMaterial({ color: 0xc8b898 });
    floors.forEach(([x, z]) => {
      if (world.get(x, z) !== TILE.FLOOR) return;

      // Hanging chain (~8%)
      if (Math.random() < 0.08) {
        const g = new THREE.Group();
        g.position.set(x + 0.5 + (Math.random() - 0.5) * 0.5, 0, z + 0.5 + (Math.random() - 0.5) * 0.5);
        const nLinks = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < nLinks; i++) {
          const link = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 4, 7), chainM.clone());
          link.position.y = WALL_H - 0.08 - i * 0.058;
          link.rotation.x = i % 2 === 0 ? Math.PI / 2 : 0;
          g.add(link);
        }
        this.scene.add(g); this._worldObjects.push(g);
      }

      // Bone pile (~4%)
      if (Math.random() < 0.04) {
        const g = new THREE.Group();
        g.position.set(x + 0.5 + (Math.random() - 0.5) * 0.4, 0, z + 0.5 + (Math.random() - 0.5) * 0.4);
        for (let i = 0; i < 3; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.025, 5, 4), boneM.clone());
          b.position.set((Math.random() - 0.5) * 0.12, i * 0.038, (Math.random() - 0.5) * 0.12);
          g.add(b);
        }
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.20, 5), boneM.clone());
        stick.position.set(0.07, 0.03, 0); stick.rotation.z = 0.65; g.add(stick);
        this.scene.add(g); this._worldObjects.push(g);
      }
    });
  }

  _addCatacombProps(world, floors) {
    const stoneM   = new THREE.MeshLambertMaterial({ color: 0x686260 });
    const lidM     = new THREE.MeshLambertMaterial({ color: 0x76706c });
    const skullM   = new THREE.MeshLambertMaterial({ color: 0xe8e0c0 });
    const eyeM     = new THREE.MeshLambertMaterial({ color: 0x060404 });
    const boneM    = new THREE.MeshLambertMaterial({ color: 0xd8cda8 });
    const pillarM  = new THREE.MeshLambertMaterial({ color: 0xd0c8a0 });

    floors.forEach(([x, z]) => {
      if (world.get(x, z) !== TILE.FLOOR) return;

      // Stone sarcophagus (~8%)
      if (Math.random() < 0.08) {
        const g = new THREE.Group();
        g.position.set(x + 0.5, 0, z + 0.5);
        g.rotation.y = Math.floor(Math.random() * 2) * Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 1.02), stoneM.clone());
        base.position.y = 0.14; g.add(base);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.97), lidM.clone());
        lid.position.y = 0.31; g.add(lid);
        // Carved line details on lid
        [0.20, -0.20].forEach(lz => {
          const detail = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.012),
            new THREE.MeshLambertMaterial({ color: 0x504c48 }));
          detail.position.set(0, 0.315, lz); g.add(detail);
        });
        this.scene.add(g); this._worldObjects.push(g);

      // Skull pile (~5%)
      } else if (Math.random() < 0.05) {
        const g = new THREE.Group();
        g.position.set(x + 0.5 + (Math.random() - 0.5) * 0.35, 0, z + 0.5 + (Math.random() - 0.5) * 0.35);
        g.rotation.y = Math.random() * Math.PI * 2;
        for (let i = 0; i < 3; i++) {
          const sg = new THREE.Group();
          sg.position.set((i - 1) * 0.12 + (Math.random() - 0.5) * 0.04, i === 2 ? 0.13 : 0, (Math.random() - 0.5) * 0.06);
          sg.rotation.y = (Math.random() - 0.5) * 0.8;
          const sk = new THREE.Mesh(new THREE.SphereGeometry(0.068, 7, 5), skullM.clone());
          sg.add(sk);
          [-0.026, 0.026].forEach(ex => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), eyeM.clone());
            eye.position.set(ex, 0.010, 0.056); sg.add(eye);
          });
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.024, 0.052),
            new THREE.MeshLambertMaterial({ color: 0xe0d8b8 }));
          jaw.position.set(0, -0.052, 0.020); sg.add(jaw);
          g.add(sg);
        }
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.014, 0.22, 5), boneM.clone());
        stick.position.set(0.14, 0.02, 0.02); stick.rotation.z = 0.70; g.add(stick);
        this.scene.add(g); this._worldObjects.push(g);

      // Bone column pillar (~2%)
      } else if (Math.random() < 0.02) {
        const g = new THREE.Group();
        g.position.set(x + 0.5, 0, z + 0.5);
        for (let i = 0; i < 7; i++) {
          const seg = new THREE.Mesh(
            i % 2 === 0 ? new THREE.SphereGeometry(0.060, 6, 5) : new THREE.CylinderGeometry(0.038, 0.048, 0.13, 6),
            pillarM.clone()
          );
          seg.position.y = i * 0.14 + 0.04; g.add(seg);
        }
        this.scene.add(g); this._worldObjects.push(g);
      }
    });
  }

  _addAbyssProps(world, floors) {
    const lavaMat = new THREE.MeshLambertMaterial({
      color: 0xff3300, emissive: 0xff2200, emissiveIntensity: 2.5,
      transparent: true, opacity: 0.84, depthWrite: false,
    });
    const runeMat = new THREE.MeshLambertMaterial({
      color: 0xaa00ff, emissive: 0x7700cc, emissiveIntensity: 2.2,
      transparent: true, opacity: 0.82, depthWrite: false,
    });
    const stalaM = new THREE.MeshLambertMaterial({ color: 0x0d0810 });

    floors.forEach(([x, z]) => {
      if (world.get(x, z) !== TILE.FLOOR) return;

      // Crystal spike cluster (~7%)
      if (Math.random() < 0.07) {
        const g = new THREE.Group();
        g.position.set(x + 0.5 + (Math.random() - 0.5) * 0.4, 0, z + 0.5 + (Math.random() - 0.5) * 0.4);
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const h = 0.14 + Math.random() * 0.28;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035 + Math.random() * 0.020, h, 5),
            new THREE.MeshLambertMaterial({ color: 0xcc00ff, emissive: 0x8800cc, emissiveIntensity: 3.5 }));
          spike.position.set((Math.random() - 0.5) * 0.16, h / 2, (Math.random() - 0.5) * 0.16);
          spike.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4);
          g.add(spike);
        }
        const cl = new THREE.PointLight(0x8800cc, 0.8, 3.5, 2);
        cl.position.y = 0.3; g.add(cl);
        this.scene.add(g); this._worldObjects.push(g);

      // Lava glow pool (~4%)
      } else if (Math.random() < 0.04) {
        const g = new THREE.Group();
        g.position.set(x + 0.5, 0.005, z + 0.5);
        const r = 0.18 + Math.random() * 0.28;
        const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 10), lavaMat.clone());
        pool.rotation.x = -Math.PI / 2; g.add(pool);
        const pl = new THREE.PointLight(0xff4400, 1.2, 5, 2);
        pl.position.y = 0.35; g.add(pl);
        this.scene.add(g); this._worldObjects.push(g);

      // Floor rune circle (~2%)
      } else if (Math.random() < 0.02) {
        const g = new THREE.Group();
        g.position.set(x + 0.5, 0.006, z + 0.5);
        const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 4, 14), runeMat.clone());
        outerRing.rotation.x = -Math.PI / 2; g.add(outerRing);
        const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.008, 4, 10), runeMat.clone());
        innerRing.rotation.x = -Math.PI / 2; g.add(innerRing);
        [0, 1].forEach(i => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.005, 0.010), runeMat.clone());
          bar.rotation.y = i * Math.PI / 2; bar.rotation.x = -Math.PI / 2; g.add(bar);
        });
        const rl = new THREE.PointLight(0x9900cc, 0.6, 4, 2); g.add(rl);
        this.scene.add(g); this._worldObjects.push(g);
      }

      // Stalactite hanging from ceiling (~9%, independent of floor prop)
      if (Math.random() < 0.09) {
        const h = 0.18 + Math.random() * 0.44;
        const stalac = new THREE.Mesh(new THREE.ConeGeometry(0.036 + Math.random() * 0.040, h, 6), stalaM.clone());
        stalac.rotation.x = Math.PI;
        stalac.position.set(x + 0.5 + (Math.random() - 0.5) * 0.5, WALL_H - h / 2 - 0.02, z + 0.5 + (Math.random() - 0.5) * 0.5);
        this.scene.add(stalac); this._worldObjects.push(stalac);
      }
    });
  }

  // ── Weapon viewmodel ──────────────────────────────────────────────────────

  setWeapon(itemId) {
    if (itemId === this._currentWeaponId) return;
    this._currentWeaponId = itemId;
    while (this._weaponGroup.children.length) this._weaponGroup.remove(this._weaponGroup.children[0]);
    const model = buildViewWeapon(itemId ?? 'fist');
    // Render weapon on top of all world geometry — prevents wall clipping
    model.traverse(m => {
      if (!m.isMesh) return;
      m.renderOrder = 10;
      m.material    = m.material.clone();
      m.material.depthTest = false;
    });
    this._weaponGroup.add(model);
  }

  // progress 0→1: weapon swings forward then returns
  swingWeapon(progress) {
    const arc = Math.sin(progress * Math.PI);   // 0→1→0 bell curve
    const isFist = this._currentWeaponId === null;

    if (isFist) {
      // Fist: quick forward lunge — arm extends toward target, fist lunges in
      this._weaponGroup.rotation.x = -arc * 1.90;  // forward punch, more aggressive
      this._weaponGroup.rotation.z =  arc * 0.15;  // minimal side roll (straight punch)
      this._weaponGroup.position.z = -0.52 - arc * 0.20;  // lunge forward
      this._weaponGroup.position.y = -0.30 + arc * 0.04;  // slight lift on extension
    } else {
      // Weapons: slashing arc
      this._weaponGroup.rotation.x = -arc * 1.35;
      this._weaponGroup.rotation.z =  arc * 0.35;
      this._weaponGroup.position.y = -0.30 - arc * 0.08;
    }
  }

  resetWeaponPose() {
    this._weaponGroup.rotation.set(0, 0, 0);
    this._weaponGroup.position.set(0.32, -0.30, -0.52);  // also resets z lunge
  }

  // Called each frame during gameplay to add walking sway to the viewmodel
  bobWeapon(phase, moving, sprinting) {
    const amp = sprinting ? 1.55 : 1.0;
    if (moving) {
      this._weaponGroup.position.x = 0.32 + Math.sin(phase) * 0.022 * amp;
      this._weaponGroup.position.y = -0.30 - Math.abs(Math.sin(phase)) * 0.018 * amp;
    } else {
      // Subtle idle breathing sway
      this._weaponGroup.position.x = 0.32 + Math.sin(phase * 0.45) * 0.004;
      this._weaponGroup.position.y = -0.30 + Math.sin(phase * 0.65) * 0.005;
    }
    this._weaponGroup.position.z = -0.52;
    this._weaponGroup.rotation.set(0, 0, 0);
  }

  // ── Stair exit beacon ────────────────────────────────────────────────────

  placeStairBeacon(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    // Main beam — narrow at ceiling, wide at base, transparent so you can walk through it
    const beamMat = new THREE.MeshLambertMaterial({
      color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 2.2,
      transparent: true, opacity: 0.55, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.22, WALL_H, 10),
      beamMat
    );
    beam.position.y = WALL_H / 2;
    g.add(beam);

    // Wide glow ring on the floor
    const ringMat = new THREE.MeshLambertMaterial({
      color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 3.8,
      transparent: true, opacity: 0.70, depthWrite: false,
    });
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.60, 0.60, 0.03, 20),
      ringMat
    );
    ring.position.y = 0.015;
    g.add(ring);

    // Solid bright core at floor level
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.05, 14),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xaaffcc, emissiveIntensity: 6.0 })
    );
    core.position.y = 0.025;
    g.add(core);

    this.scene.add(g);
    this._worldObjects.push(g);
    this._stairBeam = beam;  // stored for per-frame animation

    // Green fill light — illuminates surrounding floor and walls
    const light = new THREE.PointLight(0x00ee77, 5.5, 11, 1.5);
    light.position.set(x, 0.7, z);
    this.scene.add(light);
    this._worldObjects.push(light);
    this._stairLight = light;
  }

  // ── Per-frame updates ─────────────────────────────────────────────────────

  syncCamera(player, bob, shake = 0) {
    const sx = shake > 0.001 ? (Math.random() - 0.5) * shake * 1.8 : 0;
    const sy = shake > 0.001 ? (Math.random() - 0.5) * shake       : 0;
    this.camera.position.set(player.x + sx, EYE_H + bob + sy, player.z + sx * 0.4);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = player.yaw;
    this.camera.rotation.x = player.pitch;
  }

  flickerLights(t) {
    this.torch.intensity = 5.0 + Math.sin(t * 0.19) * 0.5 + Math.sin(t * 0.43) * 0.2;

    this._candleLights.forEach((l, i) => {
      l.intensity = 0.8 + Math.sin(t * 0.14 + i * 1.9) * 0.18;
    });

    const sconceBase = ([3.5, 3.2, 4.0][this._currentTheme?.idx ?? 0] ?? 3.5) * 0.92;
    this._sconceLights.forEach((l, i) => {
      l.intensity = sconceBase + Math.sin(t * 0.21 + i * 2.3) * 0.7 + Math.sin(t * 0.57 + i * 0.9) * 0.3;
    });

    const isAbyss = this._currentTheme?.idx === 2;
    const flameBase = isAbyss ? 3.5 : (this._currentTheme?.idx === 1 ? 2.2 : 2.8);
    this._sconceFlames.forEach((f, i) => {
      if (isAbyss) {
        // Void crystals slowly rotate and pulse
        f.rotation.y += 0.012 + i * 0.004;
        f.rotation.x = Math.sin(t * 0.18 + i * 1.3) * 0.25;
        f.material.emissiveIntensity = flameBase + Math.sin(t * 0.25 + i * 1.8) * 1.2;
      } else {
        // Flames scale and flicker
        const s = 0.86 + Math.sin(t * 0.28 + i * 1.7) * 0.16;
        f.scale.set(1, s, 1);
        f.material.emissiveIntensity = flameBase + Math.sin(t * 0.33 + i * 2.1) * 0.8;
      }
    });

    // Stair beacon — slow deep breath: ~6 second cycle
    if (this._stairBeam && this._stairLight) {
      const pulse = 0.70 + Math.sin(t * 0.055) * 0.22 + Math.sin(t * 0.11) * 0.08;
      this._stairBeam.material.emissiveIntensity = 1.8 + pulse * 1.4;
      this._stairBeam.material.opacity           = 0.40 + pulse * 0.28;
      this._stairLight.intensity                 = 5.0 * pulse;
    }
  }

  // ── Particle impact system ────────────────────────────────────────────────

  spawnImpactParticles(x, y, z, color = 0xffffff) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 3),
        new THREE.MeshLambertMaterial({
          color, emissive: color, emissiveIntensity: 2.0,
          transparent: true, opacity: 1.0, depthWrite: false,
        })
      );
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.0;
      mesh.position.set(x, y, z);
      mesh.userData.vx = Math.cos(angle) * speed;
      mesh.userData.vy = 1.0 + Math.random() * 3.0;
      mesh.userData.vz = Math.sin(angle) * speed;
      mesh.renderOrder = 8;
      this.scene.add(mesh);
      this._particles.push({ mesh, life: 0.35, maxLife: 0.35 });
    }
  }

  // ── Scorch marks ──────────────────────────────────────────────────────────

  // vx/vz: normalized direction the projectile was travelling when it hit the wall.
  // Needed so the plane can be oriented parallel to the wall face it struck.
  addScorchMark(x, y, z, vx = 0, vz = 0) {
    const len = Math.hypot(vx, vz);
    // Step the mark slightly back from the wall surface to avoid z-fighting
    const ox = len > 0.001 ? (vx / len) * 0.06 : 0;
    const oz = len > 0.001 ? (vz / len) * 0.06 : 0;
    // rotation.y aligns the plane's normal with the projectile direction,
    // so the plane lies flush against the wall face. rotation.x stays 0 (vertical).
    const angle = len > 0.001
      ? Math.atan2(vx / len, vz / len)
      : Math.random() * Math.PI * 2;

    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.20, 8),
      new THREE.MeshLambertMaterial({
        color: 0x050505, transparent: true, opacity: 0.90,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    mesh.position.set(x - ox, y, z - oz);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = angle + (Math.random() - 0.5) * 0.30;
    mesh.rotation.x = 0;   // keep vertical — horizontal tilt made marks look like lines
    mesh.renderOrder = 7;
    this.scene.add(mesh);
    if (this._scorchMarks.length >= 24) {
      const old = this._scorchMarks.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose(); old.mesh.material.dispose();
    }
    this._scorchMarks.push({ mesh, life: 9.0, maxLife: 9.0 });
  }

  // ── Melee swing arc ───────────────────────────────────────────────────────

  showSwingArc(color = 0xffffff) {
    // Remove previous arc if still fading
    if (this._swingArc) {
      this.camera.remove(this._swingArc);
      this._swingArc = null;
    }
    const arc = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color, emissive: color, emissiveIntensity: 2.5,
      transparent: true, opacity: 0.65, depthWrite: false, depthTest: false,
    });
    // 7 thin boxes arranged in a 70° sweep arc
    const radius = 0.55;
    for (let i = 0; i < 7; i++) {
      const t     = i / 6;
      const angle = (t - 0.5) * (Math.PI * 0.38);  // -35° to +35°
      const seg   = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.14, 0.08), mat.clone());
      seg.position.set(Math.sin(angle) * radius, -0.08 - t * 0.04, -Math.cos(angle) * radius);
      seg.rotation.y = -angle;
      seg.renderOrder = 9;
      arc.add(seg);
    }
    this.camera.add(arc);
    this._swingArc     = arc;
    this._swingArcLife = 0.18;
  }

  // ── Item glow API (pool-based — zero runtime allocation) ─────────────────

  createItemGlow(x, z, rarity) {
    if (rarity !== 'rare' || this._glowFree.length === 0) return null;
    const light = this._glowFree.pop();
    light.intensity = 1.4;
    light.position.set(x, 0.45, z);
    return light;
  }

  removeItemGlow(light) {
    if (!light) return;
    light.intensity = 0;
    light.position.set(0, -200, 0);   // park off-screen
    this._glowFree.push(light);
  }

  // ── Unified per-frame effect updates ─────────────────────────────────────

  updateEffects(dt) {
    // Particles
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;
      const m = p.mesh;
      m.userData.vy -= 9 * dt;
      m.position.x  += m.userData.vx * dt;
      m.position.y  += m.userData.vy * dt;
      m.position.z  += m.userData.vz * dt;
      m.material.opacity = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        this.scene.remove(m);
        m.geometry.dispose(); m.material.dispose();
        this._particles.splice(i, 1);
      }
    }

    // Scorch marks
    for (let i = this._scorchMarks.length - 1; i >= 0; i--) {
      const s = this._scorchMarks[i];
      s.life -= dt;
      s.mesh.material.opacity = Math.min(0.85, s.life / 2.5);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this._scorchMarks.splice(i, 1);
      }
    }

    // Swing arc
    if (this._swingArc && this._swingArcLife > 0) {
      this._swingArcLife -= dt;
      const t = this._swingArcLife / 0.18;
      this._swingArc.traverse(m => {
        if (m.isMesh) m.material.opacity = 0.65 * t;
      });
      if (this._swingArcLife <= 0) {
        this.camera.remove(this._swingArc);
        this._swingArc = null;
      }
    }
  }

  render() { this.gl.render(this.scene, this.camera); }
}
