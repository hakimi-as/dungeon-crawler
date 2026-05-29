import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { buildGroundMesh } from './weapons.js';

// ── Item catalogue ────────────────────────────────────────────────────────────
export const ITEMS = {
  // Weapons
  rusty_dagger:   { name: 'Rusty Dagger',   type: 'weapon', stat: 2,  color: 0x8a8a7a, rarity: 'common',
                    desc: '+2 ATK · Short-range melee blade.' },
  iron_sword:     { name: 'Iron Sword',     type: 'weapon', stat: 4,  color: 0xaaaacc, rarity: 'common',
                    desc: '+4 ATK · Reliable mid-range sword.' },
  bone_club:      { name: 'Bone Club',      type: 'weapon', stat: 3,  color: 0xddd4b8, rarity: 'common', cursed: true,
                    desc: '+3 ATK · [CURSED] Drains 1 HP on each hit.' },
  dread_blade:    { name: 'Dread Blade',    type: 'weapon', stat: 6,  color: 0xdd2211, rarity: 'rare',
                    desc: '+6 ATK · 35% chance to inflict Bleed (2 dmg/s for 4s).' },
  magic_staff:    { name: 'Magic Staff',    type: 'weapon', stat: 7,  color: 0x9944ff, rarity: 'rare',
                    desc: '+7 ATK · Fires pitch-aware magic bolts. F/Click to cast.' },

  // Armour
  leather_vest:   { name: 'Leather Vest',   type: 'armor',  stat: 2,  color: 0x8b4513, rarity: 'common',
                    desc: '+2 DEF · Light leather protection.' },
  bone_shield:    { name: 'Bone Shield',    type: 'armor',  stat: 3,  color: 0xddd4b8, rarity: 'common',
                    desc: '+3 DEF · Carved from monster remains.' },
  chainmail:      { name: 'Chainmail',      type: 'armor',  stat: 4,  color: 0x8899aa, rarity: 'common',
                    desc: '+4 DEF · Sturdy interlocked iron rings.' },
  shadow_robe:    { name: 'Shadow Robe',    type: 'armor',  stat: 5,  color: 0x442266, rarity: 'rare', cursed: true,
                    desc: '+5 DEF · [CURSED] Slowly drains HP while worn.' },

  // Potions
  health_potion:  { name: 'Health Potion',  type: 'potion', stat: 20, color: 0xcc1133, rarity: 'common',
                    desc: 'Restores 20 HP instantly on use.' },
  greater_potion: { name: 'Greater Potion', type: 'potion', stat: 40, color: 0xff3355, rarity: 'rare',
                    desc: 'Restores 40 HP instantly on use.' },

  // Scrolls — equip to SPELL slot, then press Q to activate
  scroll_fireball: { name: 'Scroll of Fire',     type: 'scroll', stat: 15, color: 0xff4400, rarity: 'rare',
                     desc: 'Deals 15 fire dmg to all enemies within 3.5 tiles. Equip → Q.' },
  scroll_teleport: { name: 'Scroll of Shifting', type: 'scroll', stat: 0,  color: 0x4488ff, rarity: 'rare',
                     desc: 'Teleports to a random visited floor tile. Equip → Q.' },
  scroll_identify: { name: 'Scroll of Sight',    type: 'scroll', stat: 0,  color: 0x44dd66, rarity: 'rare',
                     desc: 'Reveals all cursed items in inventory. Equip → Q.' },
  scroll_haste:    { name: 'Scroll of Haste',    type: 'scroll', stat: 5,  color: 0xffdd00, rarity: 'rare',
                     desc: 'Grants 1.5× move speed for 8 seconds. Equip → Q.' },
  scroll_freeze:   { name: 'Scroll of Frost',    type: 'scroll', stat: 0,  color: 0x88ccff, rarity: 'rare',
                     desc: 'Freezes all nearby enemies for 3s, stopping them cold. Equip → Q.' },

  // Ranged
  bow:             { name: 'Short Bow',           type: 'weapon', stat: 3,  color: 0x8B6914, rarity: 'common',
                     desc: '+3 ATK · Ranged. Fires arrows (8 ammo on pickup). Fast attack rate.' },
};

// ── Drop tables ───────────────────────────────────────────────────────────────
const DROP_TABLES = {
  goblin: [
    { id: 'health_potion', weight: 35 },
    { id: 'rusty_dagger',  weight: 22 },
    { id: 'leather_vest',  weight: 18 },
    { id: 'iron_sword',    weight: 10 },
    { id: null,            weight: 15 },
  ],
  skeleton: [
    { id: 'health_potion',  weight: 22 },
    { id: 'bone_club',      weight: 18 },
    { id: 'bone_shield',    weight: 18 },
    { id: 'chainmail',      weight: 14 },
    { id: 'dread_blade',    weight: 8  },
    { id: 'greater_potion', weight: 6  },
    { id: 'magic_staff',    weight: 5  },
    { id: 'scroll_fireball', weight: 5 },
    { id: 'scroll_identify', weight: 8 },
    { id: 'scroll_haste',    weight: 6 },
    { id: null,             weight: 9  },
  ],
  troll: [
    { id: 'greater_potion', weight: 28 },
    { id: 'dread_blade',    weight: 20 },
    { id: 'chainmail',      weight: 16 },
    { id: 'shadow_robe',    weight: 12 },
    { id: 'magic_staff',    weight: 10 },
    { id: 'bow',            weight: 10 },
    { id: 'scroll_fireball', weight: 7 },
    { id: 'scroll_teleport', weight: 5 },
    { id: 'scroll_freeze',   weight: 5 },
    { id: 'scroll_haste',    weight: 5 },
    { id: null,             weight: 5  },
  ],
  archer: [
    { id: 'health_potion',  weight: 30 },
    { id: 'rusty_dagger',   weight: 20 },
    { id: 'iron_sword',     weight: 15 },
    { id: 'scroll_identify', weight: 10 },
    { id: 'scroll_haste',    weight: 7  },
    { id: null,             weight: 35 },
  ],
  spider: [
    { id: 'health_potion',  weight: 40 },
    { id: 'leather_vest',   weight: 20 },
    { id: null,             weight: 40 },
  ],
  wraith: [
    { id: 'scroll_teleport', weight: 25 },
    { id: 'scroll_identify', weight: 20 },
    { id: 'shadow_robe',     weight: 15 },
    { id: 'health_potion',   weight: 18 },
    { id: 'greater_potion',  weight: 8  },
    { id: null,              weight: 14 },
  ],
  brute: [
    { id: 'greater_potion',  weight: 25 },
    { id: 'chainmail',       weight: 20 },
    { id: 'dread_blade',     weight: 16 },
    { id: 'bone_shield',     weight: 15 },
    { id: 'scroll_fireball', weight: 10 },
    { id: null,              weight: 14 },
  ],
  mage: [
    { id: 'scroll_fireball', weight: 22 },
    { id: 'scroll_freeze',   weight: 18 },
    { id: 'scroll_teleport', weight: 15 },
    { id: 'scroll_haste',    weight: 12 },
    { id: 'magic_staff',     weight: 10 },
    { id: 'greater_potion',  weight: 8  },
    { id: null,              weight: 15 },
  ],
};

export function rollDrop(enemyType) {
  const table = DROP_TABLES[enemyType] ?? DROP_TABLES.goblin;
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) return entry.id;
  }
  return null;
}

// ── Ground item (3D floating pickup) ─────────────────────────────────────────
export class GroundItem {
  constructor(scene, itemId, x, z) {
    this.itemId = itemId;
    this.x      = x;
    this.z      = z;
    this._spin  = Math.random() * Math.PI * 2;

    const def  = ITEMS[itemId];
    this.mesh  = buildGroundMesh(itemId, def.color);
    this.mesh.position.set(x, 0.55, z);
    scene.add(this.mesh);
  }

  update(dt) {
    this._spin          += dt * 1.6;
    this.mesh.rotation.y = this._spin;
    this.mesh.position.y = 0.48 + Math.sin(this._spin * 0.6) * 0.08;
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}
