export const TILE = Object.freeze({
  VOID:        0,
  WALL:        1,
  FLOOR:       2,
  DOOR:        3,
  STAIR_DOWN:  4,
  STAIR_UP:    5,
  TRAP:        6,   // spike trap — walkable but deals damage to player
  SECRET_WALL: 7,   // looks like wall; press E to open, reveals loot
});

export const TILE_SIZE = 32; // pixels per tile

export const MAP_WIDTH  = 80;
export const MAP_HEIGHT = 50;
