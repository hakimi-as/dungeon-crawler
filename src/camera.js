import { TILE_SIZE } from './constants.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  // Center the viewport on the given entity every frame
  follow(entity) {
    this.x = entity.x;
    this.y = entity.y;
  }

  // Convert a world tile coordinate to a canvas pixel position
  toScreen(tx, ty, viewW, viewH) {
    return [
      (tx - this.x) * TILE_SIZE + Math.floor(viewW / 2),
      (ty - this.y) * TILE_SIZE + Math.floor(viewH / 2),
    ];
  }
}
