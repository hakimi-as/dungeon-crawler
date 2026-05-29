export class Player {
  constructor(x, z) {
    this.x     = x;
    this.z     = z;
    this.yaw   = -Math.PI / 2;
    this.pitch = 0;

    this.hp      = 30;
    this.maxHp   = 30;
    this.attack  = 5;
    this.defense = 2;

    this.level   = 1;
    this.xp      = 0;
    this.xpNext  = 40;
    this.kills   = 0;

    this.poisoned     = 0;   // seconds remaining
    this._poisonTick  = 0;   // internal tick timer
  }

  gainXP(amount) {
    this.xp += amount;
    if (this.xp >= this.xpNext) {
      this.xp     -= this.xpNext;
      this.level  += 1;
      this.xpNext  = Math.floor(this.xpNext * 1.55);
      this.maxHp  += 8;
      this.hp      = Math.min(this.hp + 12, this.maxHp);
      this.attack += 1;
      return true;   // levelled up
    }
    return false;
  }
}
