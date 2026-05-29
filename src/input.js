export class InputHandler {
  constructor(domElement) {
    this.keys          = new Set();
    this._mouseX       = 0;
    this._mouseY       = 0;
    this.locked        = false;
    this.inventoryOpen = false; // suppress overlay when inventory is open

    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === domElement;
      document.getElementById('crosshair').style.display = this.locked ? 'block' : 'none';
      document.getElementById('hud').style.display       = this.locked ? 'flex'  : 'none';
      document.getElementById('minimap').style.display   = this.locked ? 'block' : 'none';
    });

    document.addEventListener('mousemove', e => {
      if (this.locked) { this._mouseX += e.movementX; this._mouseY += e.movementY; }
    });
  }

  // Returns accumulated mouse delta since last call, then resets it
  consumeMouse() {
    const d = { dx: this._mouseX, dy: this._mouseY };
    this._mouseX = this._mouseY = 0;
    return d;
  }

  isDown(code) { return this.keys.has(code); }
}
