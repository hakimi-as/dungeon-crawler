import { TILE, MAP_WIDTH, MAP_HEIGHT } from './constants.js';
import { World } from './world.js';

// ── BSP parameters ────────────────────────────────────────────────────────────
const MIN_SPLIT = 9;  // smallest cell dimension that can still be split
const ROOM_PAD  = 2;  // min gap between BSP cell edge and room wall
const MAX_DEPTH = 5;  // recursion cap → controls room count (~8–20 rooms)

// ── BSP node ──────────────────────────────────────────────────────────────────
class Node {
  constructor(x, y, w, h) {
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.left = this.right = null;
    this.room = null; // filled in by carveRooms()
  }
  get isLeaf() { return !this.left && !this.right; }
}

// ── Tree operations ───────────────────────────────────────────────────────────

function split(node, depth) {
  if (depth >= MAX_DEPTH) return;

  const canH = node.h >= MIN_SPLIT * 2;
  const canV = node.w >= MIN_SPLIT * 2;
  if (!canH && !canV) return;

  // Prefer splitting the longer axis; randomise when square-ish
  const doH = canH && (!canV || node.h > node.w * 1.25 || Math.random() < 0.5);

  if (doH) {
    const at = MIN_SPLIT + Math.floor(Math.random() * (node.h - MIN_SPLIT * 2));
    node.left  = new Node(node.x, node.y,      node.w, at);
    node.right = new Node(node.x, node.y + at, node.w, node.h - at);
  } else {
    const at = MIN_SPLIT + Math.floor(Math.random() * (node.w - MIN_SPLIT * 2));
    node.left  = new Node(node.x,      node.y, at,          node.h);
    node.right = new Node(node.x + at, node.y, node.w - at, node.h);
  }

  split(node.left,  depth + 1);
  split(node.right, depth + 1);
}

function carveRooms(node, world) {
  if (!node.isLeaf) {
    carveRooms(node.left,  world);
    carveRooms(node.right, world);
    return;
  }
  // Random room size with padding inside the BSP cell
  const padX = ROOM_PAD + Math.floor(Math.random() * 2);
  const padY = ROOM_PAD + Math.floor(Math.random() * 2);
  const rx = node.x + padX,  ry = node.y + padY;
  const rw = node.w - padX * 2, rh = node.h - padY * 2;
  if (rw < 4 || rh < 4) return;

  world.carveRoom(rx, ry, rw, rh);

  node.room = {
    x: rx, y: ry, w: rw, h: rh,
    cx: rx + Math.floor(rw / 2),
    cy: ry + Math.floor(rh / 2),
  };
}

// Returns the room from the leftmost reachable leaf of a subtree
function getRoom(node) {
  if (!node) return null;
  if (node.isLeaf) return node.room;
  return getRoom(node.left) || getRoom(node.right);
}

// Collect every room in a subtree into an array
function collectRooms(node, out = []) {
  if (!node) return out;
  if (node.isLeaf) { if (node.room) out.push(node.room); }
  else { collectRooms(node.left, out); collectRooms(node.right, out); }
  return out;
}

// Connect two rooms with a random L-shaped corridor
function connectRooms(a, b, world) {
  if (Math.random() < 0.5) {
    world.carveHCorridor(a.cx, b.cx, a.cy);
    world.carveVCorridor(b.cx, a.cy, b.cy);
  } else {
    world.carveVCorridor(a.cx, a.cy, b.cy);
    world.carveHCorridor(a.cx, b.cx, b.cy);
  }
}

// Post-order traversal: connect sibling subtrees after carving their children
function connectTree(node, world) {
  if (node.isLeaf) return;
  connectTree(node.left,  world);
  connectTree(node.right, world);
  const rL = getRoom(node.left);
  const rR = getRoom(node.right);
  if (rL && rR) connectRooms(rL, rR, world);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateDungeon(mapW = MAP_WIDTH, mapH = MAP_HEIGHT) {
  const world = new World(mapW, mapH);
  const root  = new Node(1, 1, mapW - 2, mapH - 2);

  split(root, 0);
  carveRooms(root, world);
  connectTree(root, world);

  const rooms = collectRooms(root);

  // Start room: closest to top-left corner (low cx + cy sum)
  rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
  const startRoom = rooms[0];

  // End room: farthest from start → place stairs there
  const endRoom = rooms.reduce((best, r) =>
    dist(r, startRoom) > dist(best, startRoom) ? r : best
  );
  world.set(endRoom.cx, endRoom.cy, TILE.STAIR_DOWN);

  // ── Spike trap tiles (~4% of floor tiles, not near spawn) ───────────────
  for (let z = 0; z < mapH; z++) {
    for (let x = 0; x < mapW; x++) {
      if (world.get(x, z) !== TILE.FLOOR) continue;
      if (Math.hypot(x - startRoom.cx, z - startRoom.cy) < 6) continue;
      if (Math.random() < 0.040) world.set(x, z, TILE.TRAP);
    }
  }

  // ── Secret walls: up to 3 wall tiles bridging two floor areas ───────────
  // A good candidate: WALL tile that has FLOOR on both N+S or both E+W sides.
  const secretCandidates = [];
  for (let z = 1; z < mapH - 1; z++) {
    for (let x = 1; x < mapW - 1; x++) {
      if (world.get(x, z) !== TILE.WALL) continue;
      if (Math.hypot(x - startRoom.cx, z - startRoom.cy) < 9) continue;
      const ns = world.get(x, z-1) === TILE.FLOOR && world.get(x, z+1) === TILE.FLOOR;
      const ew = world.get(x-1, z) === TILE.FLOOR && world.get(x+1, z) === TILE.FLOOR;
      if (ns || ew) secretCandidates.push({ x, z });
    }
  }
  // Shuffle and pick up to 3
  for (let i = secretCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [secretCandidates[i], secretCandidates[j]] = [secretCandidates[j], secretCandidates[i]];
  }
  secretCandidates.slice(0, 3).forEach(({ x, z }) => world.set(x, z, TILE.SECRET_WALL));

  // ── Merchant room: one non-start, non-end room ───────────────────────────
  const merchantCandidates = rooms.filter(r => r !== startRoom && r !== endRoom);
  const merchantRoom = merchantCandidates.length > 0
    ? merchantCandidates[Math.floor(Math.random() * merchantCandidates.length)]
    : null;

  // Pre-reveal starting area so minimap isn't completely black on spawn
  world.markVisible(startRoom.cx + 0.5, startRoom.cy + 0.5, 11);

  return {
    world,
    startX: startRoom.cx + 0.5,
    startZ: startRoom.cy + 0.5,
    rooms,
    merchantRoom,
  };
}

function dist(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}
