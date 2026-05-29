import { TILE, MAP_WIDTH, MAP_HEIGHT } from './constants.js';

export class World {
  constructor(width = MAP_WIDTH, height = MAP_HEIGHT) {
    this.width   = width;
    this.height  = height;
    this.tiles   = new Uint8Array(width * height).fill(TILE.VOID);
    this.visited = new Uint8Array(width * height).fill(0); // fog of war
  }

  get(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return TILE.WALL;
    return this.tiles[y * this.width + x];
  }

  set(x, y, tile) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.tiles[y * this.width + x] = tile;
  }

  isWalkable(x, y) {
    const t = this.get(x, y);
    return t === TILE.FLOOR || t === TILE.DOOR
        || t === TILE.STAIR_DOWN || t === TILE.STAIR_UP
        || t === TILE.TRAP;   // traps are walkable for pathfinding; only player takes damage
  }

  isVisited(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.visited[y * this.width + x] === 1;
  }

  // Mark all tiles within radius tiles of (px, pz) as visited
  markVisible(px, pz, radius = 11) {
    const cx = Math.floor(px), cz = Math.floor(pz);
    const r  = Math.ceil(radius);
    const r2 = radius * radius;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx * dx + dy * dy <= r2) {
          const tx = cx + dx, tz = cz + dy;
          if (tx >= 0 && tx < this.width && tz >= 0 && tz < this.height)
            this.visited[tz * this.width + tx] = 1;
        }
  }

  // ── Carving helpers (used by dungeon generator) ──────────────────────────

  fillRect(x, y, w, h, tile) {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++)
        this.set(col, row, tile);
  }

  carveRoom(x, y, w, h) {
    this.fillRect(x,     y,     w,     h,     TILE.WALL);
    this.fillRect(x + 1, y + 1, w - 2, h - 2, TILE.FLOOR);
  }

  carveHCorridor(x1, x2, y) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      if (this.get(x, y - 1) === TILE.VOID) this.set(x, y - 1, TILE.WALL);
      this.set(x, y, TILE.FLOOR);
      if (this.get(x, y + 1) === TILE.VOID) this.set(x, y + 1, TILE.WALL);
    }
  }

  carveVCorridor(x, y1, y2) {
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      if (this.get(x - 1, y) === TILE.VOID) this.set(x - 1, y, TILE.WALL);
      this.set(x, y, TILE.FLOOR);
      if (this.get(x + 1, y) === TILE.VOID) this.set(x + 1, y, TILE.WALL);
    }
  }
}
