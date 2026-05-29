import { TILE } from './constants.js';

// ── Min-heap (priority queue by .f) ──────────────────────────────────────────
class MinHeap {
  constructor() { this._d = []; }
  get size()     { return this._d.length; }

  push(item) {
    this._d.push(item);
    let i = this._d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._d[p].f <= this._d[i].f) break;
      [this._d[p], this._d[i]] = [this._d[i], this._d[p]];
      i = p;
    }
  }

  pop() {
    const top  = this._d[0];
    const last = this._d.pop();
    if (this._d.length) {
      this._d[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < this._d.length && this._d[l].f < this._d[s].f) s = l;
        if (r < this._d.length && this._d[r].f < this._d[s].f) s = r;
        if (s === i) break;
        [this._d[i], this._d[s]] = [this._d[s], this._d[i]];
        i = s;
      }
    }
    return top;
  }
}

// ── A* ────────────────────────────────────────────────────────────────────────
const MAX_PATH = 50; // max tile steps before giving up
const DIRS     = [[1,0],[-1,0],[0,1],[0,-1]];

export function astar(world, fx, fz, tx, tz) {
  const sx = Math.floor(fx), sz = Math.floor(fz);
  const ex = Math.floor(tx), ez = Math.floor(tz);
  if (sx === ex && sz === ez) return [];

  const W        = world.width;
  const key      = (x, z) => z * W + x;
  const open     = new MinHeap();
  const cameFrom = new Map();
  const gScore   = new Map();

  gScore.set(key(sx, sz), 0);
  open.push({ x: sx, z: sz, f: h(sx, sz, ex, ez) });

  while (open.size > 0) {
    const { x, z } = open.pop();
    const k = key(x, z);
    const g = gScore.get(k);

    if (x === ex && z === ez) return buildPath(cameFrom, k, W);
    if (g >= MAX_PATH) continue;

    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      if (world.get(nx, nz) === TILE.WALL) continue;
      const nk = key(nx, nz);
      const ng = g + 1;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, k);
        gScore.set(nk, ng);
        open.push({ x: nx, z: nz, f: ng + h(nx, nz, ex, ez) });
      }
    }
  }
  return null; // no path within MAX_PATH steps
}

const h = (x1, z1, x2, z2) => Math.abs(x1 - x2) + Math.abs(z1 - z2);

function buildPath(cameFrom, endKey, W) {
  const path = [];
  let k = endKey;
  while (cameFrom.has(k)) {
    path.unshift({ x: k % W, z: Math.floor(k / W) });
    k = cameFrom.get(k);
  }
  return path; // list of tile {x,z} from start+1 to end
}

// ── Line of sight (Bresenham) ─────────────────────────────────────────────────
export function hasLOS(world, x1, z1, x2, z2) {
  let x = Math.floor(x1), z = Math.floor(z1);
  const ex = Math.floor(x2), ez = Math.floor(z2);
  const dx = Math.abs(ex - x), dz = Math.abs(ez - z);
  const sx = x < ex ? 1 : -1,  sz = z < ez ? 1 : -1;
  let err = dx - dz;

  for (let step = 0; step < dx + dz + 2; step++) {
    if (world.get(x, z) === TILE.WALL) return false;
    if (x === ex && z === ez) return true;
    const e2 = err * 2;
    if (e2 > -dz) { err -= dz; x += sx; }
    if (e2 <  dx) { err += dx; z += sz; }
  }
  return true;
}
