import * as THREE                       from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { generateDungeon }              from './dungeon.js';
import { hasLOS }                       from './pathfinding.js';
import { Player }                       from './player.js';
import { InputHandler }                 from './input.js';
import { Renderer, EYE_H }             from './renderer.js';
import { TILE }                         from './constants.js';
import { Enemy, spawnEnemies, spawnBoss } from './enemies.js';
import { ITEMS, rollDrop, GroundItem }  from './items.js';
import { Inventory }                    from './inventory.js';
import { playHit, playHurt, playPickup, playDeath,
         playStep, playStairs, playEnemyDeath,
         playArrowHit, playMagicShot, playBarrelBreak,
         playPoisonTick, playBossEncounter,
         playSwing, startAmbient, playImpactWall,
         playCritical, playBurn, playBleed,
         playDodge, playResume, playStatusApply,
         playLevelUp, playFloorClear, playChampionKill,
         playPotionDrink, playHeartbeat } from './audio.js';

// ── Bootstrap ──────────────────────────────────────────────────────────────
const renderer  = new Renderer();
const player    = new Player(0, 0);
const input     = new InputHandler(renderer.gl.domElement);
const inventory = new Inventory(player, renderer.gl.domElement);

// ── Mutable game state ─────────────────────────────────────────────────────
let world, rooms;
let enemies       = [];
let groundItems   = [];
let barrels       = [];
let projectiles   = [];
let xpOrbs        = [];    // floating XP bonus orbs
let floorNum      = 0;
let isDead        = false;
let transitioning = false;
let boss          = null;
let nextBossFloor = 1 + Math.floor(Math.random() * 5);
let bossRevealed  = false;

// ── New gameplay systems ───────────────────────────────────────────────────
let _streakCount   = 0;    // kill streak counter
let _streakTimer   = 0;    // countdown window
let _comboCount    = 0;    // consecutive hit combo
let _comboReset    = 0;    // countdown to reset combo
let _floorCleared  = false;
let _trapCooldown  = 0;    // prevents trap re-triggering immediately
let bowAmmo        = 0;    // current bow arrow count
let merchantPos    = null; // { x, z } or null
let _merchantItems = [];   // [{itemId, cost}] for current floor shop
let _merchantOpen  = false;
let _merchantMesh  = null; // spinning merchant chest mesh in scene

// ── Constants ──────────────────────────────────────────────────────────────
const MOVE_SPEED      = 2.2;
const RUN_SPEED       = 3.6;
let   LOOK_SENS       = 0.0018;   // mutable for settings slider
const COLL_R          = 0.26;
const MAX_PITCH       = 0.65;
const PLAYER_ATK_CD   = 0.45;
const WEAPON_RANGE    = {
  fist: 1.05, rusty_dagger: 1.20, bone_club: 1.40,
  iron_sword: 1.60, dread_blade: 1.90, magic_staff: 0, bow: 0,
};
const SWING_DURATION  = 0.28;
const PROJ_SPEED      = 9.0;
const BARREL_DROP_CHANCE = 0.45;

// ── Dodge / Roll ───────────────────────────────────────────────────────────
const DODGE_DURATION = 0.28;
const DODGE_COOLDOWN = 1.8;
const DODGE_SPEED    = 7.5;
let dodgeActive   = false;
let dodgeTimer    = 0;
let dodgeCooldown = 0;
let dodgeVx = 0, dodgeVz = 0;

// ── Stamina ────────────────────────────────────────────────────────────────
const MAX_STAMINA = 3.0;
let stamina         = MAX_STAMINA;
let staminaDepleted = false;
let _staminaFill    = null;   // created lazily

// ── Player status effects ──────────────────────────────────────────────────
let playerBurn  = 0;  // seconds remaining
let playerBleed = 0;
let playerHaste = 0;
let _burnTick        = 0;
let _bleedTick       = 0;
let _shadowRobeTick  = 0;

// ── Enemy burn (tracked externally so enemies.js stays clean) ──────────────
const enemyBurns = new WeakMap();  // enemy → { timer, dps, tick }

// ── Meta progression ───────────────────────────────────────────────────────
const META_KEY     = 'dc_meta_v1';
const META_UPGRADES = [
  { id:'maxHp',    label:'Max HP +10',       cost:8,  max:5, apply: () => { player.maxHp += 10; player.hp += 10; } },
  { id:'attack',   label:'Attack +1',        cost:10, max:4, apply: () => { player.attack += 1; } },
  { id:'defense',  label:'Defense +1',       cost:10, max:4, apply: () => { player.defense += 1; } },
  { id:'dodgeSpd', label:'Dodge Speed +10%', cost:12, max:3, apply: () => {} },  // applied at dodge time
];
let metaSouls = 0;

// ── Floor themes — only fog/background here; textures/lights live in renderer ──
const FLOOR_THEMES = [
  { fogCol: 0x060810, fogD: 0.085, name: 'DUNGEON'   },
  { fogCol: 0x060410, fogD: 0.090, name: 'CATACOMBS' },
  { fogCol: 0x040208, fogD: 0.096, name: 'ABYSS'     },
];

const BOSS_NAMES = ['⚔ THE WARDEN ⚔','☠ THE DREAD ☠','✦ THE UNDYING ✦','⛧ SOUL CRUSHER ⛧'];

// ── Full map ───────────────────────────────────────────────────────────────
let mapOpen        = false;
let _mapTileCache  = null;   // offscreen canvas — rebuilt only when player moves
let _mapDirty      = true;

// ── Sprint FOV ─────────────────────────────────────────────────────────────
let _baseFov = 80;

// ── Low HP heartbeat ───────────────────────────────────────────────────────
let _heartbeatTimer = 0;

// ── Current theme name (for death screen) ─────────────────────────────────
let _currentThemeName = 'DUNGEON';

let playerAtkTimer = 0;
let swingTimer     = 0;
let _lastWeaponId  = null;

// ── DOM refs ───────────────────────────────────────────────────────────────
const hurtOverlay    = document.getElementById('hurt-overlay');
const poisonOverlay  = document.getElementById('poison-overlay');
const deathOverlay   = document.getElementById('death-overlay');
const pickupPrompt   = document.getElementById('pickup-prompt');
const dmgNumsEl      = document.getElementById('dmg-nums');
const hpFill         = document.getElementById('hp-fill');
const hpText         = document.getElementById('hp-text');
const mmCanvas       = document.getElementById('minimap');
const mmCtx          = mmCanvas.getContext('2d');
const floorLabel     = document.getElementById('floor-label');
const transitionEl   = document.getElementById('transition-overlay');
const xpFill         = document.getElementById('xp-fill');
const levelLabel     = document.getElementById('level-label');
const killLabel      = document.getElementById('kill-label');
const bossBar        = document.getElementById('boss-bar');
const bossFill       = document.getElementById('boss-fill');
const bossHpText     = document.getElementById('boss-hp-text');
const bossNameEl     = document.getElementById('boss-name');
const hitDirRing     = document.getElementById('hit-dir-ring');
const pauseMenu      = document.getElementById('pause-menu');
const mainOverlay    = document.getElementById('overlay');
const damageLogEl    = document.getElementById('damage-log');
const fullmapOverlay = document.getElementById('fullmap-overlay');
const fullmapCanvas  = document.getElementById('fullmap-canvas');
const fullmapCtx     = fullmapCanvas?.getContext('2d');
const statusEfxEl    = document.getElementById('status-effects');
const critFlash      = document.getElementById('crit-flash');
const lowHpOverlay   = document.getElementById('low-hp-overlay');
const dodgeCdEl      = document.getElementById('dodge-cd');
const dodgeCdArc     = document.getElementById('dodge-cd-arc');
const metaOverlay    = document.getElementById('meta-overlay');
const metaSoulsEl    = document.getElementById('meta-souls');
const upgradesListEl = document.getElementById('upgrades-list');

// ── Collision ──────────────────────────────────────────────────────────────
function _isSolid(t) { return t === TILE.WALL || t === TILE.SECRET_WALL; }
function blocked(x, z) {
  const r = COLL_R;
  return [[x+r,z+r],[x-r,z+r],[x+r,z-r],[x-r,z-r]]
    .some(([cx,cz]) => _isSolid(world.get(Math.floor(cx), Math.floor(cz))));
}
function wallAt(x, z) {
  return _isSolid(world.get(Math.floor(x), Math.floor(z)));
}

// ── Barrel class ───────────────────────────────────────────────────────────
class Barrel {
  constructor(scene, x, z) {
    this.x = x; this.z = z; this.broken = false;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.36, 9),
      new THREE.MeshLambertMaterial({ color: 0x6b3a10 })
    );
    g.add(body);
    [0.12, 0, -0.12].forEach(y => {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.185, 0.185, 0.030, 9),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      );
      ring.position.y = y; g.add(ring);
    });
    g.position.set(x, 0.18, z);
    g.rotation.y = Math.random() * Math.PI * 2;
    this.mesh = g;
    scene.add(g);
  }
  break(scene) {
    this.broken = true;
    scene.remove(this.mesh);
    this.mesh.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
  }
}

// ── Ground-item helpers (with rarity glow) ─────────────────────────────────
function addGroundItem(itemId, x, z) {
  const gi   = new GroundItem(renderer.scene, itemId, x, z);
  gi._glow   = renderer.createItemGlow(x, z, ITEMS[itemId]?.rarity ?? 'common');
  groundItems.push(gi);
  return gi;
}
function removeGroundItem(gi) {
  renderer.removeItemGlow(gi._glow);
  gi.remove(renderer.scene);
  const idx = groundItems.indexOf(gi);
  if (idx >= 0) groundItems.splice(idx, 1);
}

// ── XP Orb ────────────────────────────────────────────────────────────────
class XPOrb {
  constructor(x, z, xpVal) {
    this.x = x; this.z = z; this.xp = xpVal;
    this._spin = Math.random() * Math.PI * 2;
    this.mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09, 0),
      new THREE.MeshLambertMaterial({ color: 0xffee22, emissive: 0xddaa00, emissiveIntensity: 2.2,
                                       transparent: true, opacity: 0.92, depthWrite: false })
    );
    this.mesh.position.set(x, 0.32, z);
    renderer.scene.add(this.mesh);
  }
  update(dt) {
    this._spin += dt * 3.2;
    this.mesh.rotation.y = this._spin;
    this.mesh.position.y = 0.30 + Math.sin(this._spin * 0.7) * 0.09;
  }
  remove() {
    renderer.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}

function spawnXpOrb(x, z, xpVal) {
  if (xpVal <= 0) return;
  xpOrbs.push(new XPOrb(x, z, Math.ceil(xpVal * 0.4)));  // orb = 40% bonus on top of direct XP
}

// ── Kill streak ────────────────────────────────────────────────────────────
const _STREAK_LABELS = { 3:'TRIPLE KILL!', 4:'QUAD KILL!', 5:'RAMPAGE!', 6:'GODLIKE!' };
function _registerKillStreak() {
  _streakCount++;
  _streakTimer = 4.5;
  if (_streakCount >= 3) {
    const label = _STREAK_LABELS[Math.min(_streakCount, 6)] ?? `${_streakCount}× KILLING SPREE`;
    _showBanner(label, _streakCount >= 5 ? '#ff4400' : '#ffaa00');
    playerHaste = Math.max(playerHaste, 3.5);
    playStatusApply();
  }
}

function _tickStreak(dt) {
  if (_streakTimer > 0) { _streakTimer -= dt; if (_streakTimer <= 0) _streakCount = 0; }
}

// ── Combo counter ──────────────────────────────────────────────────────────
function _registerHit() {
  _comboCount++;
  _comboReset = 2.2;
  _updateComboHUD();
}

function _tickCombo(dt) {
  if (_comboReset > 0) {
    _comboReset -= dt;
    if (_comboReset <= 0) { _comboCount = 0; _updateComboHUD(); }
  }
}

function _updateComboHUD() {
  const el = document.getElementById('combo-counter');
  if (!el) return;
  if (_comboCount >= 2) {
    el.style.display = 'block';
    el.textContent = `×${_comboCount}`;
    el.style.color = _comboCount >= 8 ? '#ff2200' : _comboCount >= 5 ? '#ff8800' : '#ffdd00';
    el.style.fontSize = `${Math.min(2.4, 1.4 + _comboCount * 0.1)}rem`;
  } else {
    el.style.display = 'none';
  }
}

// ── Generic banner ─────────────────────────────────────────────────────────
function _showBanner(text, color = '#ffd060') {
  const el = document.createElement('div');
  el.className = 'game-banner';
  el.textContent = text;
  el.style.color = color;
  el.style.textShadow = `0 0 30px ${color}88`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── Floor cleared ──────────────────────────────────────────────────────────
function _checkFloorClear() {
  if (_floorCleared) return;
  const allDead = enemies.every(e => e.dead) && (!boss || boss.dead || boss === null);
  if (!allDead) return;
  _floorCleared = true;
  playFloorClear();
  // Bonus chest near the stairs
  outer: for (let sz = 0; sz < world.height; sz++) {
    for (let sx = 0; sx < world.width; sx++) {
      if (world.get(sx, sz) === TILE.STAIR_DOWN) {
        addGroundItem('greater_potion', sx + 0.5, sz + 1.5);
        break outer;
      }
    }
  }
  _showBanner('✦  FLOOR CLEARED  ✦', '#00ffaa');
  addDamageLog('Floor cleared — bonus chest at stairs!', 'status-msg');
}

// ── Merchant helpers ───────────────────────────────────────────────────────
const _SHOP_CATALOG = [
  { itemId:'health_potion',  cost:8  },
  { itemId:'greater_potion', cost:18 },
  { itemId:'iron_sword',     cost:22 },
  { itemId:'leather_vest',   cost:16 },
  { itemId:'chainmail',      cost:28 },
  { itemId:'bow',            cost:25 },
  { itemId:'scroll_fireball',cost:20 },
  { itemId:'scroll_freeze',  cost:22 },
  { itemId:'scroll_teleport',cost:18 },
  { itemId:'scroll_haste',   cost:14 },
  { itemId:'dread_blade',    cost:40 },
  { itemId:'magic_staff',    cost:38 },
];

function _buildShopItems() {
  const pool = [..._SHOP_CATALOG];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 4);
}

function _openMerchant() {
  if (_merchantItems.length === 0 || !merchantPos) return;
  _merchantOpen = true;
  document.exitPointerLock();
  const overlay = document.getElementById('merchant-overlay');
  const list    = document.getElementById('merchant-items');
  if (!overlay || !list) return;
  const meta = loadMeta();
  document.getElementById('merchant-souls').textContent = `${meta.souls} souls`;
  list.innerHTML = '';
  _merchantItems.forEach(({ itemId, cost }, i) => {
    const def = ITEMS[itemId];
    const btn = document.createElement('button');
    btn.className = 'merchant-btn';
    const canAfford = meta.souls >= cost;
    btn.innerHTML = `<span class="shop-name">${def.name}</span>
      <span class="shop-desc">${def.desc}</span>
      <span class="shop-cost${canAfford ? '' : ' cant-afford'}">${cost} souls</span>`;
    if (canAfford) {
      btn.addEventListener('click', () => {
        const m2 = loadMeta();
        if (m2.souls < cost) return;
        if (!inventory.addItem(itemId)) { addDamageLog('Inventory full!', 'status-msg'); return; }
        m2.souls -= cost;
        saveMeta(m2);
        if (itemId === 'bow' && bowAmmo === 0) bowAmmo = 8;
        playPickup();
        addDamageLog(`Bought: ${def.name}`, 'status-msg');
        _merchantItems.splice(i, 1);
        _openMerchant();  // re-render with updated list
      });
    }
    list.appendChild(btn);
  });
  overlay.style.display = 'flex';
}

function _closeMerchant() {
  _merchantOpen = false;
  const overlay = document.getElementById('merchant-overlay');
  if (overlay) overlay.style.display = 'none';
  renderer.gl.domElement.requestPointerLock();
}

// ── Damage log ─────────────────────────────────────────────────────────────
function addDamageLog(msg, cls = 'enemy-hit') {
  if (!damageLogEl) return;
  const el = document.createElement('div');
  el.className = `dmg-entry ${cls}`;
  el.textContent = msg;
  damageLogEl.appendChild(el);
  while (damageLogEl.children.length > 5) damageLogEl.removeChild(damageLogEl.firstChild);
  setTimeout(() => el.remove(), 3500);
}

// ── Status effect icons ────────────────────────────────────────────────────
function updateStatusIcons() {
  if (!statusEfxEl) return;
  statusEfxEl.innerHTML = '';
  if (playerBurn  > 0) { const s = document.createElement('div'); s.className = 'status-icon burn';  s.textContent = '🔥 BURN';  statusEfxEl.appendChild(s); }
  if (playerBleed > 0) { const s = document.createElement('div'); s.className = 'status-icon bleed'; s.textContent = '🩸 BLEED'; statusEfxEl.appendChild(s); }
  if (playerHaste > 0) { const s = document.createElement('div'); s.className = 'status-icon haste'; s.textContent = '⚡ HASTE'; statusEfxEl.appendChild(s); }
  statusEfxEl.style.display = statusEfxEl.children.length ? 'flex' : 'none';
}

// ── Full map ───────────────────────────────────────────────────────────────
function toggleMap() {
  mapOpen = !mapOpen;
  if (fullmapOverlay) fullmapOverlay.style.display = mapOpen ? 'flex' : 'none';
  if (mapOpen) drawFullMap();
}
function _rebuildMapTileCache(W, H, sx, sz) {
  if (!_mapTileCache) {
    _mapTileCache = document.createElement('canvas');
    _mapTileCache.width = W; _mapTileCache.height = H;
  }
  const tc = _mapTileCache.getContext('2d');
  tc.fillStyle = '#04050c';
  tc.fillRect(0, 0, W, H);
  for (let z = 0; z < world.height; z++) {
    for (let x = 0; x < world.width; x++) {
      if (!world.isVisited(x, z)) continue;
      const t = world.get(x, z);
      if (t === TILE.VOID) continue;
      tc.fillStyle = t === TILE.WALL        ? '#2a2040'
                   : t === TILE.STAIR_DOWN  ? '#3db87a'
                   : t === TILE.TRAP        ? '#884422'
                   : '#18100a';
      tc.fillRect(x * sx, z * sz, Math.max(1, sx), Math.max(1, sz));
    }
  }
  _mapDirty = false;
}

function drawFullMap() {
  if (!fullmapCtx || !world) return;
  const W = fullmapCanvas.width, H = fullmapCanvas.height;
  const sx = W / world.width, sz = H / world.height;

  if (_mapDirty || !_mapTileCache) _rebuildMapTileCache(W, H, sx, sz);

  // Blit cached tile layer, then draw dynamic elements on top
  fullmapCtx.drawImage(_mapTileCache, 0, 0);

  for (const e of enemies) {
    if (e.dead || !world.isVisited(Math.floor(e.x), Math.floor(e.z))) continue;
    fullmapCtx.fillStyle = e.isElite ? '#ffaa00' : '#e04040';
    fullmapCtx.fillRect(e.x * sx - 2, e.z * sz - 2, 4, 4);
  }
  if (boss && !boss.dead && world.isVisited(Math.floor(boss.x), Math.floor(boss.z))) {
    fullmapCtx.fillStyle = '#ff2200';
    fullmapCtx.fillRect(boss.x * sx - 3, boss.z * sz - 3, 6, 6);
  }
  fullmapCtx.fillStyle = '#ffd060';
  fullmapCtx.beginPath();
  fullmapCtx.arc(player.x * sx, player.z * sz, 3.5, 0, Math.PI * 2);
  fullmapCtx.fill();
}

// ── Meta progression ───────────────────────────────────────────────────────
function loadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) ?? { souls: 0, levels: {} }; }
  catch { return { souls: 0, levels: {} }; }
}
function saveMeta(data) {
  try { localStorage.setItem(META_KEY, JSON.stringify(data)); } catch {}
}
function applyMetaUpgrades() {
  const meta = loadMeta();
  metaSouls = meta.souls;
  META_UPGRADES.forEach(u => {
    const lvl = meta.levels[u.id] ?? 0;
    for (let i = 0; i < lvl; i++) u.apply();
  });
}
function showMetaScreen() {
  if (!metaOverlay) return;
  const meta = loadMeta();
  // Add souls earned this run
  meta.souls += floorNum * 3 + player.kills;
  saveMeta(meta);
  metaSouls = meta.souls;
  if (metaSoulsEl) metaSoulsEl.textContent = `${meta.souls} souls`;

  if (upgradesListEl) {
    upgradesListEl.innerHTML = '';
    META_UPGRADES.forEach(u => {
      const lvl = meta.levels[u.id] ?? 0;
      const btn = document.createElement('button');
      btn.className = 'upgrade-btn' + (lvl >= u.max ? ' maxed' : '');
      btn.textContent = lvl >= u.max
        ? `${u.label}  [MAXED]`
        : `${u.label}  [${u.cost} souls]  (${lvl}/${u.max})`;
      if (lvl < u.max && meta.souls >= u.cost) {
        btn.addEventListener('click', () => {
          meta.souls -= u.cost;
          meta.levels[u.id] = (meta.levels[u.id] ?? 0) + 1;
          saveMeta(meta);
          if (metaSoulsEl) metaSoulsEl.textContent = `${meta.souls} souls`;
          showMetaScreen();  // re-render
        });
      }
      upgradesListEl.appendChild(btn);
    });
  }
  metaOverlay.style.display = 'flex';
}

// ── Scroll use handler ─────────────────────────────────────────────────────
function handleScroll(itemId) {
  switch (itemId) {
    case 'scroll_fireball': {
      // Deal fire damage to all nearby enemies
      const range = 3.5;
      const allT  = boss && !boss.dead ? [...enemies, boss] : enemies;
      let count = 0;
      for (const e of allT) {
        if (e.dead || Math.hypot(e.x - player.x, e.z - player.z) > range) continue;
        const dmg = 15;
        e.takeDamage(dmg);
        spawnDmgNum(e.x, e.z, dmg, false, true);
        renderer.spawnImpactParticles(e.x, 1.0, e.z, 0xff4400);
        if (e.dead) { playEnemyDeath(); player.kills++; player.gainXP(e.xpValue ?? 8); }
        count++;
      }
      renderer.spawnImpactParticles(player.x, 0.8, player.z, 0xff6600);
      addDamageLog(`Scroll of Fire — hit ${count} enemies`, 'critical');
      break;
    }
    case 'scroll_teleport': {
      // Teleport to a random visited floor tile
      const floors = [];
      for (let z = 0; z < world.height; z++)
        for (let x = 0; x < world.width; x++)
          if (world.isVisited(x, z) && world.get(x, z) === TILE.FLOOR)
            floors.push([x + 0.5, z + 0.5]);
      if (floors.length) {
        const [tx, tz] = floors[Math.floor(Math.random() * floors.length)];
        player.x = tx; player.z = tz;
        renderer.spawnImpactParticles(tx, 0.8, tz, 0x4488ff);
      }
      addDamageLog('Scroll of Shifting — teleported!', 'status-msg');
      break;
    }
    case 'scroll_identify': {
      const cursed = [];
      for (const id of inventory.items)
        if (ITEMS[id]?.cursed) cursed.push(ITEMS[id].name);
      for (const slot of ['weapon', 'armor']) {
        const id = inventory.equipped[slot];
        if (id && ITEMS[id]?.cursed) cursed.push(`${ITEMS[id].name} [equipped]`);
      }
      if (cursed.length > 0)
        cursed.forEach(name => addDamageLog(`★ Cursed: ${name}`, 'critical'));
      else
        addDamageLog('Scroll of Sight — no curses found', 'status-msg');
      flashPrompt('All curses revealed — see log', true);
      break;
    }
    case 'scroll_haste':
      playerHaste = 8.0;
      playStatusApply();
      addDamageLog('Scroll of Haste — speed x1.5 for 8s', 'status-msg');
      break;
    case 'scroll_freeze': {
      const range = 4.0;
      const allT  = boss && !boss.dead ? [...enemies, boss] : enemies;
      let count = 0;
      for (const e of allT) {
        if (e.dead || Math.hypot(e.x - player.x, e.z - player.z) > range) continue;
        e.freeze(3.0);
        renderer.spawnImpactParticles(e.x, 1.0, e.z, 0x88aaff);
        count++;
      }
      playStatusApply();
      addDamageLog(`Scroll of Frost — froze ${count} enemies`, 'status-msg');
      break;
    }
  }
}

// ── Floor management ───────────────────────────────────────────────────────
function loadFloor() {
  floorNum++;

  if (boss) { boss.dispose(); boss = null; }
  for (const e  of enemies)     e.dispose();
  for (const gi of groundItems) { renderer.removeItemGlow(gi._glow); gi.remove(renderer.scene); }
  for (const b  of barrels)     b.break(renderer.scene);
  for (const p  of projectiles) renderer.scene.remove(p.mesh);
  enemies.length = groundItems.length = barrels.length = projectiles.length = 0;
  bossRevealed = false;
  bossBar.style.display = 'none';

  // Floor theme — random each floor
  const themeIdx = Math.floor(Math.random() * 3);
  const theme = FLOOR_THEMES[themeIdx];
  renderer.scene.fog.color.setHex(theme.fogCol);
  renderer.scene.fog.density = theme.fogD;
  renderer.scene.background.setHex(theme.fogCol);

  const { world: w, startX, startZ, rooms: r, merchantRoom: mr } = generateDungeon();
  world = w; rooms = r;
  player.x = startX; player.z = startZ;

  // Reset per-floor state
  _floorCleared  = false;
  _streakCount   = 0;
  _comboCount    = 0;
  merchantPos    = null;
  _merchantItems = [];
  _mapTileCache  = null;
  _mapDirty      = true;
  if (_merchantMesh) { renderer.scene.remove(_merchantMesh); _merchantMesh = null; }
  for (const orb of xpOrbs) orb.remove();
  xpOrbs = [];

  // Set up merchant in chosen room
  if (mr) {
    merchantPos = { x: mr.cx + 0.5, z: mr.cy + 0.5 };
    _merchantItems = _buildShopItems();
    // Merchant visual: rotating glowing chest orb
    const orbGeo = new THREE.OctahedronGeometry(0.14, 1);
    const orbMat = new THREE.MeshLambertMaterial({ color: 0xffd060, emissive: 0xcc8800, emissiveIntensity: 2.5 });
    _merchantMesh = new THREE.Mesh(orbGeo, orbMat);
    _merchantMesh.position.set(mr.cx + 0.5, 0.55, mr.cy + 0.5);
    renderer.scene.add(_merchantMesh);
    const ml = new THREE.PointLight(0xffaa00, 2.0, 5, 2);
    ml.position.set(mr.cx + 0.5, 0.8, mr.cy + 0.5);
    renderer.scene.add(ml);
    renderer._worldObjects.push(_merchantMesh, ml);
  }

  renderer.buildWorld(world, themeIdx);

  stairBeaconLoop: for (let sz = 0; sz < world.height; sz++) {
    for (let sx = 0; sx < world.width; sx++) {
      if (world.get(sx, sz) === TILE.STAIR_DOWN) {
        renderer.placeStairBeacon(sx + 0.5, sz + 0.5);
        break stairBeaconLoop;
      }
    }
  }

  enemies = spawnEnemies(renderer.scene, world, rooms, rooms[0], floorNum);

  for (const room of rooms) {
    if (room === rooms[0]) continue;
    const count = Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const bx = room.x + 1.5 + Math.random() * (room.w - 3);
      const bz = room.y + 1.5 + Math.random() * (room.h - 3);
      barrels.push(new Barrel(renderer.scene, bx, bz));
    }
  }

  const isBossFloor = (floorNum >= nextBossFloor);
  if (isBossFloor) {
    boss = spawnBoss(renderer.scene, rooms, rooms[0], floorNum);
    nextBossFloor = floorNum + 1 + Math.floor(Math.random() * 5);
    const bossName = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
    if (bossNameEl) bossNameEl.textContent = bossName;
    _showBossAnnounce(bossName);
  }

  _currentThemeName = theme.name;
  floorLabel.textContent = `FLOOR ${floorNum}  ·  ${theme.name}`;

  // Floor objective banner
  setTimeout(() => {
    const isBossFloor = (floorNum >= nextBossFloor - 1);
    _showBanner(isBossFloor ? '⚔  SLAY THE WARDEN  ⚔' : '▼  REACH THE STAIRS  ▼', '#ffd060');
  }, 600);

  _ensureStaminaBar();

  // Show play-time UI
  document.getElementById('hud').style.display        = 'flex';
  document.getElementById('minimap').style.display    = 'block';
  document.getElementById('crosshair').style.display  = 'block';
  document.getElementById('hotbar').style.display     = 'flex';
  if (damageLogEl) damageLogEl.style.display = 'flex';
}

function _ensureStaminaBar() {
  if (_staminaFill) return;
  const hud  = document.getElementById('hud');
  if (!hud) return;
  const row  = document.createElement('div');
  row.id = 'stamina-row';
  row.innerHTML = `<span class="label" style="color:#336688">SP</span>
    <div id="stamina-track"><div id="stamina-fill"></div></div>
    <span id="stamina-label" style="font-size:10px;color:#336688;width:52px">SPRINT</span>`;
  // Insert after xp-row
  const xpRow = document.getElementById('xp-row');
  if (xpRow) xpRow.after(row);
  else hud.appendChild(row);
  _staminaFill = document.getElementById('stamina-fill');
}

function triggerNextFloor() {
  if (transitioning) return;
  transitioning = true;
  transitionEl.classList.add('fade');
  playStairs();
  // Hide full map when transitioning
  if (mapOpen) toggleMap();
  setTimeout(() => {
    loadFloor();
    transitionEl.classList.remove('fade');
    setTimeout(() => { transitioning = false; }, 500);
  }, 460);
}

// ── Projectile system ──────────────────────────────────────────────────────
function spawnProjectile(x, z, dx, dz, dmg, team, dy = 0, isMagic = false, isArrow = false) {
  const g = new THREE.Group();
  const startY = EYE_H * 0.88;
  g.position.set(x, startY, z);

  if (isArrow) {
    // Player bow arrow: shaft + tip, aimed in flight direction
    g.rotation.order = 'YXZ';
    g.rotation.y = Math.atan2(dx, dz);
    g.rotation.x = Math.abs(dy) > 0.01 ? -Math.asin(Math.max(-1,Math.min(1,dy))) : 0;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,0.42,4),
      new THREE.MeshLambertMaterial({ color: 0x8B6914 }));
    shaft.rotation.z = Math.PI / 2; g.add(shaft);
    const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.020,0.08,4),
      new THREE.MeshLambertMaterial({ color: 0x888888 }));
    arrowHead.rotation.z = Math.PI / 2; arrowHead.position.x = 0.24; g.add(arrowHead);
    const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.016,0.036,0.024),
      new THREE.MeshLambertMaterial({ color: 0xcc3333 }));
    fletch.position.x = -0.19; g.add(fletch);
  } else if (team === 'player' || isMagic) {
    const orbColor  = isMagic ? 0xff0066 : 0xaa44ff;
    const emvColor  = isMagic ? 0xcc0044 : 0x7722cc;
    const trailEmv  = isMagic ? 0xff66aa : 0xcc88ff;

    g.rotation.order = 'YXZ';
    g.rotation.y = Math.atan2(dx, dz);
    if (team === 'player') {
      g.rotation.x = Math.abs(dy) > 0.01 ? -Math.asin(Math.max(-1, Math.min(1, dy))) : 0;
    }

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshLambertMaterial({ color: orbColor, emissive: emvColor, emissiveIntensity: 2.5 })
    );
    g.add(orb);
    const trail = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: trailEmv, emissiveIntensity: 3.0 })
    );
    g.add(trail);
    playMagicShot();
  } else {
    g.rotation.y = Math.atan2(dx, dz);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.40, 4),
      new THREE.MeshLambertMaterial({ color: 0x8B4513 })
    );
    shaft.rotation.z = Math.PI / 2;
    g.add(shaft);
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.022, 0.08, 4),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    head.rotation.z = Math.PI / 2; head.position.x = 0.22;
    g.add(head);
  }

  renderer.scene.add(g);
  projectiles.push({
    mesh: g, x, y: startY, z,
    vx: dx * PROJ_SPEED, vy: dy * PROJ_SPEED, vz: dz * PROJ_SPEED,
    dmg, team, isMagic, isArrow, life: 2.5,
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;

    const nx = p.x + p.vx * dt;
    const ny = p.y + (p.vy ?? 0) * dt;
    const nz = p.z + p.vz * dt;

    if (wallAt(nx, nz) || p.life <= 0 || ny < 0 || ny > 2.8) {
      if (wallAt(nx, nz)) {
        const pcol = (p.team === 'player') ? 0xaa44ff : (p.isMagic ? 0xff0066 : 0x886644);
        renderer.spawnImpactParticles(p.x, p.y, p.z, pcol);
        renderer.addScorchMark(nx, p.y, nz, p.vx, p.vz);
        if (p.team === 'player' || p.isMagic) playImpactWall();
      }
      renderer.scene.remove(p.mesh);
      p.mesh.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
      projectiles.splice(i, 1);
      continue;
    }

    p.x = nx; p.y = ny; p.z = nz;
    p.mesh.position.set(nx, ny, nz);

    if (p.team === 'player') {
      // Barrel collision
      let boltUsed = false;
      for (let bi = barrels.length - 1; bi >= 0; bi--) {
        const b = barrels[bi];
        if (b.broken) continue;
        if (Math.hypot(b.x - p.x, b.z - p.z) < 0.40) {
          renderer.spawnImpactParticles(b.x, 0.3, b.z, 0x6b3a10);
          b.break(renderer.scene);
          barrels.splice(bi, 1);
          playBarrelBreak();
          if (Math.random() < BARREL_DROP_CHANCE) {
            const table = ['health_potion','health_potion','rusty_dagger','leather_vest','iron_sword',null];
            const id = table[Math.floor(Math.random() * table.length)];
            if (id) addGroundItem(id, b.x, b.z);
          }
          boltUsed = true;
          break;
        }
      }
      if (boltUsed) {
        renderer.scene.remove(p.mesh);
        p.mesh.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
        projectiles.splice(i, 1);
        continue;
      }

      // Enemy hit
      const allTargets = boss && !boss.dead ? [...enemies, boss] : enemies;
      for (const e of allTargets) {
        if (e.dead) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < 0.60 && Math.abs(p.y - 0.85) < 1.1) {
          const isCrit = Math.random() < 0.12;
          const dmg    = Math.max(1, Math.round((p.dmg + randInt(-1,1)) * (isCrit ? 2 : 1)));
          e.takeDamage(dmg);
          renderer.spawnImpactParticles(e.x, p.y, e.z, 0xaa44ff);
          spawnDmgNum(e.x, e.z, dmg, false, isCrit);
          _registerHit();
          if (isCrit) {
            playCritical(); addDamageLog(`Critical hit! −${dmg}`, 'critical');
            if (Math.random() < 0.20 && !e.dead) { e.freeze(2.5); addDamageLog('Frozen!', 'status-msg'); }
          } else { playArrowHit(); addDamageLog(`Bolt hit − ${dmg}`, 'enemy-hit'); }
          if (e.dead) {
            playEnemyDeath(); player.kills++;
            const levelled = player.gainXP(e.xpValue ?? 8);
            if (levelled) showLevelUp();
            _onEnemyKill(e);
          }
          renderer.scene.remove(p.mesh);
          projectiles.splice(i, 1);
          break;
        }
      }
    }

    // Enemy projectile hitting player
    if ((p.team === 'enemy' || p.isMagic) && Math.hypot(player.x - p.x, player.z - p.z) < 0.35) {
      if (player.hp > 0 && !dodgeActive) {
        const dmg = Math.max(1, p.dmg - player.defense + randInt(-1,1));
        player.hp = Math.max(0, player.hp - dmg);
        spawnDmgNum(player.x, player.z, dmg, true, false);
        hurtOverlay.classList.add('active');
        shakeAmt = 0.045;
        playHurt();
        showHitDir(p.x - p.vx * 0.5, p.z - p.vz * 0.5);
        addDamageLog(`Hit for ${dmg} dmg`, 'player-hit');
        setTimeout(() => hurtOverlay.classList.remove('active'), 250);
        // Mage bolt applies burn
        if (p.isMagic) { playerBurn = Math.max(playerBurn, 4.0); playStatusApply(); addDamageLog('Burning!', 'status-msg'); }
        if (player.hp <= 0) triggerDeath();
      }
      renderer.scene.remove(p.mesh);
      p.mesh.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } });
      projectiles.splice(i, 1);
    }
  }
}

// ── Combat ─────────────────────────────────────────────────────────────────
const SWING_COLORS = {
  fist: 0xdd8855, rusty_dagger: 0x999988, bone_club: 0xddd4b8,
  iron_sword: 0xaaaacc, dread_blade: 0xdd2211, magic_staff: 0xaa44ff, bow: 0x8B6914,
};

function tryAttack() {
  if (playerAtkTimer > 0) return;
  playerAtkTimer = PLAYER_ATK_CD;
  swingTimer     = SWING_DURATION;

  const weaponId = inventory.equipped?.weapon ?? 'fist';
  const atkRange = WEAPON_RANGE[weaponId] ?? 1.0;

  const fwdX = -Math.sin(player.yaw);
  const fwdZ = -Math.cos(player.yaw);

  // Swing arc + sound
  renderer.showSwingArc(SWING_COLORS[weaponId] ?? 0xffffff);
  playSwing(weaponId);

  // Barrel smashing (melee only — staff uses projectile)
  for (let i = weaponId !== 'magic_staff' ? barrels.length - 1 : -1; i >= 0; i--) {
    const b = barrels[i];
    if (b.broken) continue;
    const dx = b.x - player.x, dz = b.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > atkRange + 0.4) continue;
    const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
    if (dot < 0.20) continue;
    renderer.spawnImpactParticles(b.x, 0.3, b.z, 0x6b3a10);
    b.break(renderer.scene);
    barrels.splice(i, 1);
    playBarrelBreak();
    if (Math.random() < BARREL_DROP_CHANCE) {
      const table = ['health_potion','health_potion','rusty_dagger','leather_vest','iron_sword',null];
      const id = table[Math.floor(Math.random() * table.length)];
      if (id) addGroundItem(id, b.x, b.z);
    }
    break;
  }

  // Staff fires pitch-aware bolt
  if (weaponId === 'magic_staff') {
    const cosPitch = Math.cos(player.pitch);
    spawnProjectile(player.x, player.z, fwdX * cosPitch, fwdZ * cosPitch,
      Math.round(player.attack * 1.3), 'player', Math.sin(player.pitch));
    return;
  }

  // Bow fires an arrow (same projectile system, different visual path)
  if (weaponId === 'bow') {
    if (bowAmmo <= 0) { addDamageLog('No arrows! Find a bow in the dungeon.', 'status-msg'); playerAtkTimer = 0; return; }
    bowAmmo--;
    playerAtkTimer = 0.70;  // bow has slightly longer attack cooldown
    const cosPitch = Math.cos(player.pitch);
    spawnProjectile(player.x, player.z, fwdX * cosPitch, fwdZ * cosPitch,
      Math.round(player.attack * 1.15), 'player', Math.sin(player.pitch), false, true);
    _updateHotbar();
    return;
  }

  // Melee enemy hit
  const allTargets = boss && !boss.dead ? [...enemies, boss] : enemies;
  let target = null, bestDist = Infinity;
  for (const e of allTargets) {
    if (e.dead) continue;
    const dx = e.x - player.x, dz = e.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist > atkRange) continue;
    const dot = (dx / dist) * fwdX + (dz / dist) * fwdZ;
    if (dot < 0.25) continue;
    if (dist < bestDist) { bestDist = dist; target = e; }
  }

  if (target) {
    const isCrit = Math.random() < 0.12;
    const dmg    = Math.max(1, Math.round((player.attack - target.def + randInt(-1,1)) * (isCrit ? 2 : 1)));

    target.takeDamage(dmg);
    renderer.spawnImpactParticles(target.x, 0.9, target.z, SWING_COLORS[weaponId] ?? 0xffffff);
    spawnDmgNum(target.x, target.z, dmg, false, isCrit);

    // Knockback enemy away from player
    const kDx = target.x - player.x, kDz = target.z - player.z;
    const kD  = Math.hypot(kDx, kDz);
    if (kD > 0) {
      const kx = target.x + (kDx / kD) * 0.5;
      const kz = target.z + (kDz / kD) * 0.5;
      if (!blocked(kx, target.z)) target.x = kx;
      if (!blocked(target.x, kz)) target.z = kz;
    }

    _registerHit();

    if (isCrit) {
      playCritical();
      critFlash.classList.add('active');
      setTimeout(() => critFlash?.classList.remove('active'), 120);
      addDamageLog(`Critical! −${dmg}`, 'critical');
      // Staff crit freezes (20% chance)
      if (weaponId === 'magic_staff' && Math.random() < 0.20 && !target.dead) {
        target.freeze(2.5);
        addDamageLog('Frozen!', 'status-msg');
      }
    } else {
      playHit();
      addDamageLog(`${target.type ?? 'Enemy'} hit −${dmg}`, 'enemy-hit');
    }

    // Status effect application
    if (weaponId === 'dread_blade' && Math.random() < 0.35) {
      if (!enemyBurns.has(target)) {
        enemyBurns.set(target, { timer: 4.0, dps: 2, tick: 0 });
        addDamageLog('Bleed applied!', 'status-msg');
      }
    }
    if (weaponId === 'bone_club') {
      player.hp = Math.max(1, player.hp - 1);
      spawnDmgNum(player.x, player.z, 1, true, false);
    }

    if (target.dead) {
      playEnemyDeath(); player.kills++;
      const levelled = player.gainXP(target.xpValue ?? 8);
      if (levelled) showLevelUp();
      _onEnemyKill(target);
    }
  }
}

function _onEnemyKill(e) {
  _registerKillStreak();
  spawnXpOrb(e.x, e.z, e.xpValue ?? 8);

  // Death particle burst — color by enemy tier
  const deathCol = e.isChampion ? 0xff2244 : e.isElite ? 0xffaa00 : 0xdd3300;
  renderer.spawnImpactParticles(e.x, 0.8, e.z, deathCol);

  if (e.isChampion) {
    playChampionKill();
    const rareDrops = ['dread_blade','magic_staff','shadow_robe','chainmail','scroll_fireball','bow','scroll_freeze'];
    addGroundItem(rareDrops[Math.floor(Math.random() * rareDrops.length)], e.x, e.z);
    _showBanner('⚔  CHAMPION SLAIN  ⚔', '#ff2244');
  }

  if (e === boss) {
    bossBar.style.display = 'none';
    _showBossDefeated();
    addGroundItem('greater_potion', e.x,       e.z);
    addGroundItem('dread_blade',    e.x + 0.8, e.z);
  } else {
    const drop = rollDrop(e.type);
    if (drop) addGroundItem(drop, e.x, e.z);
  }

  _checkFloorClear();
}

// ── Poison / Status ticks ──────────────────────────────────────────────────
function applyPoison(seconds = 6) {
  player.poisoned = Math.max(player.poisoned, seconds);
  poisonOverlay.classList.add('active');
}

function tickPoison(dt) {
  if (player.poisoned <= 0) { poisonOverlay.classList.remove('active'); return; }
  player.poisoned -= dt;
  player._poisonTick += dt;
  if (player._poisonTick >= 1.0) {
    player._poisonTick -= 1.0;
    const dmg = 2;
    player.hp = Math.max(1, player.hp - dmg);
    spawnDmgNum(player.x, player.z, dmg, true, false);
    playPoisonTick();
    addDamageLog(`Poison − ${dmg}`, 'status-msg');
    if (player.poisoned <= 0) poisonOverlay.classList.remove('active');
  }
}

function tickPlayerStatuses(dt) {
  // Burn
  if (playerBurn > 0) {
    playerBurn -= dt;
    _burnTick  += dt;
    if (_burnTick >= 1.0) {
      _burnTick -= 1.0;
      const dmg = 3;
      player.hp = Math.max(1, player.hp - dmg);
      spawnDmgNum(player.x, player.z, dmg, true, false);
      playBurn();
      addDamageLog(`Burn − ${dmg}`, 'status-msg');
    }
    if (playerBurn <= 0) _burnTick = 0;
  }
  // Bleed
  if (playerBleed > 0) {
    playerBleed -= dt;
    _bleedTick  += dt;
    if (_bleedTick >= 1.0) {
      _bleedTick -= 1.0;
      const dmg = 2;
      player.hp = Math.max(1, player.hp - dmg);
      spawnDmgNum(player.x, player.z, dmg, true, false);
      playBleed();
      addDamageLog(`Bleed − ${dmg}`, 'status-msg');
    }
    if (playerBleed <= 0) _bleedTick = 0;
  }
  // Haste
  if (playerHaste > 0) playerHaste -= dt;
  // Shadow robe: 1 HP drain every 4s while worn
  if (inventory.equipped?.armor === 'shadow_robe') {
    _shadowRobeTick += dt;
    if (_shadowRobeTick >= 4.0) {
      _shadowRobeTick -= 4.0;
      player.hp = Math.max(1, player.hp - 1);
      spawnDmgNum(player.x, player.z, 1, true, false);
      addDamageLog('Shadow Robe drains 1 HP', 'status-msg');
    }
  } else {
    _shadowRobeTick = 0;
  }
  updateStatusIcons();
}

function tickEnemyStatuses(dt) {
  const allT = boss && !boss.dead ? [...enemies, boss] : enemies;
  for (const e of allT) {
    if (e.dead) continue;
    const b = enemyBurns.get(e);
    if (!b) continue;
    b.timer -= dt;
    b.tick  += dt;
    if (b.tick >= 1.0) {
      b.tick -= 1.0;
      const dmg = b.dps;
      e.takeDamage(dmg);
      spawnDmgNum(e.x, e.z, dmg, false, false);
      renderer.spawnImpactParticles(e.x, 0.8, e.z, 0xff4400);
      if (e.dead) { playEnemyDeath(); player.kills++; player.gainXP(e.xpValue ?? 8); _onEnemyKill(e); }
    }
    if (b.timer <= 0) enemyBurns.delete(e);
  }
}

// ── Death ──────────────────────────────────────────────────────────────────
function triggerDeath() {
  isDead = true;
  playDeath();
  document.exitPointerLock();
  document.getElementById('death-stats').textContent =
    `Floor ${floorNum}  ·  ${_currentThemeName}  ·  Level ${player.level}  ·  ${player.kills} kills`;
  deathOverlay.style.display = 'flex';
}

document.getElementById('death-restart').addEventListener('click', () => {
  deathOverlay.style.display = 'none';
  showMetaScreen();
});

document.getElementById('meta-continue')?.addEventListener('click', () => {
  if (metaOverlay) metaOverlay.style.display = 'none';
  location.reload();
});

// ── Menu system ────────────────────────────────────────────────────────────
let gameStarted = false;

document.getElementById('btn-start').addEventListener('click', () =>
  renderer.gl.domElement.requestPointerLock()
);
document.getElementById('btn-resume').addEventListener('click', () => {
  pauseMenu.style.display = 'none';
  playResume();
  renderer.gl.domElement.requestPointerLock();
});
document.getElementById('btn-restart-pause').addEventListener('click', () => location.reload());

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.gl.domElement) {
    gameStarted = true;
    mainOverlay.style.display = 'none';
    pauseMenu.style.display   = 'none';
  } else {
    if (isDead)          return;
    if (_merchantOpen) { _closeMerchant(); return; }
    if (inventory.open)  return;
    if (!gameStarted) {
      mainOverlay.style.display = 'flex';
    } else {
      if (mapOpen) toggleMap();
      pauseMenu.style.display = 'flex';
    }
  }
});

// Start ambient on first interaction
document.getElementById('btn-start').addEventListener('click', startAmbient, { once: true });

// ── Settings panel ─────────────────────────────────────────────────────────
(function buildSettingsPanel() {
  const card = pauseMenu?.querySelector('.menu-card');
  if (!card) return;

  const btn = document.createElement('button');
  btn.className = 'btn-secondary'; btn.textContent = 'SETTINGS';
  const divider = card.querySelector('.menu-divider');
  if (divider) card.insertBefore(btn, divider);

  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.innerHTML = `
    <div class="setting-row">
      <span class="setting-label">SENSITIVITY</span>
      <input type="range" id="sl-sens" min="5" max="40" value="18">
      <span class="setting-val" id="sv-sens">1.0×</span>
    </div>
    <div class="setting-row">
      <span class="setting-label">FIELD OF VIEW</span>
      <input type="range" id="sl-fov"  min="60" max="100" value="80">
      <span class="setting-val" id="sv-fov">80°</span>
    </div>`;
  card.appendChild(panel);

  btn.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
  });
  document.getElementById('sl-sens').addEventListener('input', e => {
    LOOK_SENS = e.target.value / 10000;
    document.getElementById('sv-sens').textContent = (e.target.value / 18).toFixed(1) + '×';
  });
  document.getElementById('sl-fov').addEventListener('input', e => {
    _baseFov = parseInt(e.target.value);
    renderer.camera.fov = _baseFov;
    renderer.camera.updateProjectionMatrix();
    document.getElementById('sv-fov').textContent = e.target.value + '°';
  });
})();

// ── Scroll use wired to inventory ──────────────────────────────────────────
inventory.onScrollUse = (itemId) => handleScroll(itemId);

// ── Hit direction indicator ────────────────────────────────────────────────
function showHitDir(srcX, srcZ) {
  const worldAngle = Math.atan2(srcX - player.x, srcZ - player.z);
  const relAngle   = player.yaw + Math.PI - worldAngle;
  const el = document.createElement('div');
  el.className = 'hit-dir';
  el.style.transform = `rotate(${relAngle}rad)`;
  hitDirRing.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// ── Pickup ─────────────────────────────────────────────────────────────────
let _flashTimer = null;

function pickupNearest() {
  let nearest = null, nearDist = Infinity;
  for (const gi of groundItems) {
    const d = Math.hypot(gi.x - player.x, gi.z - player.z);
    if (d < 1.5 && d < nearDist) { nearest = gi; nearDist = d; }
  }
  if (!nearest) return;
  if (inventory.addItem(nearest.itemId)) {
    removeGroundItem(nearest);
    playPickup();
    const def = ITEMS[nearest.itemId];
    const cursedNote = def.cursed ? ' [CURSED]' : '';
    if (nearest.itemId === 'bow') bowAmmo = (bowAmmo === 0) ? 8 : bowAmmo + 4;
    flashPrompt(`Picked up: ${def.name}${cursedNote}`, true);
    addDamageLog(`Picked up ${def.name}${cursedNote}`, 'status-msg');
    _updateHotbar();
  } else {
    flashPrompt('Inventory full!', false);
  }
}

function _tryOpenSecretWall() {
  if (!world) return;
  for (let z = Math.floor(player.z) - 1; z <= Math.floor(player.z) + 1; z++) {
    for (let x = Math.floor(player.x) - 1; x <= Math.floor(player.x) + 1; x++) {
      if (world.get(x, z) !== TILE.SECRET_WALL) continue;
      if (Math.hypot(x + 0.5 - player.x, z + 0.5 - player.z) > 1.4) continue;
      // Open the wall
      world.set(x, z, TILE.FLOOR);
      renderer.openSecretWall(x, z);
      // Loot drop
      const secretLoot = ['dread_blade','magic_staff','greater_potion','chainmail','scroll_fireball','scroll_freeze','shadow_robe'];
      addGroundItem(secretLoot[Math.floor(Math.random() * secretLoot.length)], x + 0.5, z + 0.5);
      addDamageLog('★  Secret passage opened!', 'critical');
      _showBanner('★  SECRET FOUND  ★', '#ffdd00');
      return;
    }
  }
}

function _tryOpenMerchant() {
  if (!merchantPos || _merchantItems.length === 0) return;
  if (Math.hypot(merchantPos.x - player.x, merchantPos.z - player.z) > 2.0) return;
  _openMerchant();
}

function flashPrompt(msg, ok) {
  pickupPrompt.textContent = msg;
  pickupPrompt.className   = ok ? 'picked' : 'full';
  pickupPrompt.style.display = 'block';
  if (_flashTimer) clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => {
    pickupPrompt.className = '';
    pickupPrompt.style.display = 'none';
    _flashTimer = null;
  }, 1600);
}

// ── Input ──────────────────────────────────────────────────────────────────
renderer.gl.domElement.addEventListener('click', () => { if (input.locked) tryAttack(); });
window.addEventListener('keydown', e => {
  if (e.code === 'KeyF' && input.locked)     tryAttack();
  if (e.code === 'KeyQ' && input.locked && !isDead) {
    const spellId = inventory.useEquippedSpell();
    if (spellId) { handleScroll(spellId); _updateHotbar(); }
  }
  if (e.code === 'KeyG' && input.locked && !isDead) {
    const potionPriority = ['greater_potion', 'health_potion'];
    let healed = false;
    for (const pid of potionPriority) {
      const idx = inventory.items.indexOf(pid);
      if (idx >= 0) {
        const amt = ITEMS[pid].stat;
        player.hp = Math.min(player.maxHp, player.hp + amt);
        inventory.items.splice(idx, 1);
        playPotionDrink();
        spawnDmgNum(player.x, player.z, amt, false, false);
        addDamageLog(`Drank ${ITEMS[pid].name} +${amt} HP`, 'status-msg');
        _updateHotbar();
        healed = true;
        break;
      }
    }
    if (!healed) addDamageLog('No potions!', 'player-hit');
  }
  if (e.code === 'KeyE' && input.locked) {
    pickupNearest();
    _tryOpenSecretWall();
    _tryOpenMerchant();
  }
  if (e.code === 'Escape' && _merchantOpen) { _closeMerchant(); return; }
  if (e.code === 'KeyI')                     inventory.toggle(input);
  if (e.code === 'KeyM' && input.locked)     toggleMap();
  else if (e.code === 'KeyM' && mapOpen)     toggleMap();
  if (e.code === 'Escape' && inventory.open) inventory.close(input);
  if (e.code === 'Escape' && mapOpen)        toggleMap();

  // Dodge / Roll
  if (e.code === 'Space' && input.locked && !isDead && dodgeCooldown <= 0) {
    const fX = -Math.sin(player.yaw), fZ = -Math.cos(player.yaw);
    const rX =  Math.cos(player.yaw), rZ = -Math.sin(player.yaw);
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp'))    { mx += fX; mz += fZ; }
    if (input.isDown('KeyS') || input.isDown('ArrowDown'))  { mx -= fX; mz -= fZ; }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  { mx -= rX; mz -= rZ; }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx += rX; mz += rZ; }
    if (mx === 0 && mz === 0)                               { mx = fX; mz = fZ; }
    const len = Math.hypot(mx, mz);
    const dodgeSpeedMult = 1.0 + (loadMeta().levels?.dodgeSpd ?? 0) * 0.10;
    dodgeVx = (mx / len) * DODGE_SPEED * dodgeSpeedMult;
    dodgeVz = (mz / len) * DODGE_SPEED * dodgeSpeedMult;
    dodgeActive   = true;
    dodgeTimer    = DODGE_DURATION;
    dodgeCooldown = DODGE_COOLDOWN;
    playDodge();
  }
});

// ── Floating damage numbers ────────────────────────────────────────────────
function spawnDmgNum(wx, wz, amount, isPlayerDmg, isCrit = false) {
  const v = new THREE.Vector3(wx, 1.6, wz).project(renderer.camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'dmg-num' + (isPlayerDmg ? ' dmg-player' : '') + (isCrit ? ' dmg-crit' : '');
  el.textContent = (isCrit ? '★ −' : '−') + amount;
  el.style.left = ((v.x + 1) / 2 * innerWidth)  + 'px';
  el.style.top  = ((-v.y + 1) / 2 * innerHeight) + 'px';
  dmgNumsEl.appendChild(el);
  setTimeout(() => el.remove(), 750);
}

// ── Boss helpers ───────────────────────────────────────────────────────────
function _showBossAnnounce(name = '— BOSS FLOOR —') {
  const el = document.createElement('div');
  el.className = 'boss-announce';
  el.textContent = name;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function _showBossDefeated() {
  const el = document.createElement('div');
  el.className = 'boss-defeated';
  el.textContent = 'SLAIN';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Level up popup ─────────────────────────────────────────────────────────
function showLevelUp() {
  playLevelUp();
  const el = document.createElement('div');
  el.className = 'level-up-notice';
  el.textContent = `LEVEL ${player.level}!`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ── HUD ────────────────────────────────────────────────────────────────────
function updateHud() {
  const ratio = player.hp / player.maxHp;
  hpFill.style.width      = Math.max(0, ratio * 100) + '%';
  hpFill.style.background = ratio > 0.6 ? '#2ec86e' : ratio > 0.3 ? '#e8a020' : '#d03030';
  hpFill.classList.toggle('hp-critical', ratio <= 0.25);
  hpText.textContent      = `${player.hp} / ${player.maxHp}`;
  xpFill.style.width      = (player.xp / player.xpNext * 100) + '%';
  levelLabel.textContent  = `LVL ${player.level}`;
  killLabel.textContent   = `${player.kills} kills`;

  if (_staminaFill) {
    _staminaFill.style.width      = (stamina / MAX_STAMINA * 100) + '%';
    _staminaFill.style.background = staminaDepleted ? '#336688' : '#44aaff';
  }
  _updateHotbar();
}

function _updateHotbar() {
  const wEl = document.getElementById('hb-weapon-name');
  const sEl = document.getElementById('hb-spell-name');
  if (wEl) {
    const wId = inventory.equipped.weapon;
    const name = wId ? ITEMS[wId].name.toUpperCase() : 'FISTS';
    wEl.textContent = wId === 'bow' ? `${name}  ×${bowAmmo}` : name;
    wEl.style.color = wId ? (wId === 'bow' && bowAmmo === 0 ? '#ff4444' : '#ffd060') : '#555';
  }
  if (sEl) {
    const sId       = inventory.equipped.spell;
    const spellSlot = document.getElementById('hb-spell-slot');
    if (sId) {
      const colorHex = '#' + ITEMS[sId].color.toString(16).padStart(6, '0');
      sEl.textContent = ITEMS[sId].name.toUpperCase();
      sEl.style.color = colorHex;
      if (spellSlot) {
        spellSlot.style.setProperty('--spell-color', colorHex);
        spellSlot.classList.add('spell-active');
      }
    } else {
      sEl.textContent = '— empty —';
      sEl.style.color = '#333';
      if (spellSlot) {
        spellSlot.classList.remove('spell-active');
        spellSlot.style.removeProperty('--spell-color');
      }
    }
  }
}

function drawMinimap() {
  const MM_S = mmCanvas.width / world.width;
  mmCtx.fillStyle = '#06080f';
  mmCtx.fillRect(0, 0, mmCanvas.width, mmCanvas.height);
  for (let z = 0; z < world.height; z++) {
    for (let x = 0; x < world.width; x++) {
      if (!world.isVisited(x, z)) continue;
      const t = world.get(x, z);
      if (t === TILE.VOID) continue;
      const close = Math.hypot(x - player.x, z - player.z) < 7;
      mmCtx.fillStyle = t === TILE.WALL       ? (close ? '#3a3060' : '#252040')
                      : t === TILE.STAIR_DOWN  ? '#3db87a'
                      : t === TILE.TRAP        ? '#884422'
                      : (close ? '#2a1e10' : '#18100a');
      mmCtx.fillRect(x * MM_S, z * MM_S, MM_S, MM_S);
    }
  }
  for (const e of enemies) {
    if (e.dead || !world.isVisited(Math.floor(e.x), Math.floor(e.z))) continue;
    // Type-based icon color
    const col = e.type === 'wraith' ? '#4444cc'
              : e.type === 'brute'  ? '#cc6622'
              : e.type === 'mage'   ? '#cc22aa'
              : e.isElite           ? '#ffaa00' : '#e04040';
    mmCtx.fillStyle = col;
    mmCtx.fillRect(e.x * MM_S - 1.5, e.z * MM_S - 1.5, e.isElite ? 4 : 3, e.isElite ? 4 : 3);
  }
  if (boss && !boss.dead && world.isVisited(Math.floor(boss.x), Math.floor(boss.z))) {
    mmCtx.fillStyle = '#ff2200';
    mmCtx.fillRect(boss.x * MM_S - 3, boss.z * MM_S - 3, 6, 6);
  }
  mmCtx.fillStyle = '#ffd060';
  mmCtx.beginPath();
  mmCtx.arc(player.x * MM_S, player.z * MM_S, 2.5, 0, Math.PI * 2);
  mmCtx.fill();
  mmCtx.strokeStyle = '#ffd060'; mmCtx.lineWidth = 1;
  mmCtx.beginPath();
  mmCtx.moveTo(player.x * MM_S, player.z * MM_S);
  mmCtx.lineTo(
    player.x * MM_S - Math.sin(player.yaw) * 7,
    player.z * MM_S - Math.cos(player.yaw) * 7
  );
  mmCtx.stroke();
}

// ── Game loop ──────────────────────────────────────────────────────────────
let lastTime  = 0;
let walkPhase = 0;
let tick      = 0;
let shakeAmt  = 0;
let stepTimer = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  tick++;

  playerAtkTimer = Math.max(0, playerAtkTimer - dt);
  shakeAmt      *= 0.80;

  // Dodge cooldown UI
  if (dodgeCooldown > 0) {
    dodgeCooldown = Math.max(0, dodgeCooldown - dt);
    if (dodgeCdEl) {
      dodgeCdEl.style.display = 'flex';
      const pct = ((DODGE_COOLDOWN - dodgeCooldown) / DODGE_COOLDOWN * 100).toFixed(0);
      if (dodgeCdArc) dodgeCdArc.style.background =
        `conic-gradient(#44aaff ${pct}%, #111 0%)`;
    }
  } else if (dodgeCdEl) {
    dodgeCdEl.style.display = 'none';
  }

  // Weapon swing animation
  if (swingTimer > 0) {
    swingTimer -= dt;
    renderer.swingWeapon(1 - swingTimer / SWING_DURATION);
  } else if (!input.locked || isDead) {
    renderer.resetWeaponPose();
  }

  // Sync weapon viewmodel
  const equippedWeapon = inventory.equipped?.weapon ?? null;
  if (equippedWeapon !== _lastWeaponId) {
    _lastWeaponId = equippedWeapon;
    renderer.setWeapon(equippedWeapon);
  }
  // Bare fists: only show the hand during the swing (punch); hide when idle.
  // Equipped weapon: always visible.
  renderer._weaponGroup.visible = equippedWeapon !== null || swingTimer > 0;

  // Visual effects (particles, scorch, swing arc)
  renderer.updateEffects(dt);

  if (input.locked && player.hp > 0 && !isDead) {
    const { dx, dy } = input.consumeMouse();
    player.yaw   -= dx * LOOK_SENS;
    player.pitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch - dy * LOOK_SENS));

    const fwdX = -Math.sin(player.yaw), fwdZ = -Math.cos(player.yaw);
    const rgtX = -Math.sin(player.yaw - Math.PI / 2), rgtZ = -Math.cos(player.yaw - Math.PI / 2);
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp'))    { mx += fwdX; mz += fwdZ; }
    if (input.isDown('KeyS') || input.isDown('ArrowDown'))  { mx -= fwdX; mz -= fwdZ; }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  { mx -= rgtX; mz -= rgtZ; }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx += rgtX; mz += rgtZ; }

    const moving    = mx !== 0 || mz !== 0;
    const wantSprint = moving && input.isDown('ShiftLeft');

    // Stamina gating
    if (wantSprint && !staminaDepleted) {
      stamina = Math.max(0, stamina - dt);
      if (stamina <= 0) staminaDepleted = true;
    } else if (!input.isDown('ShiftLeft')) {
      stamina = Math.min(MAX_STAMINA, stamina + dt * 0.75);
      if (stamina > 0.5) staminaDepleted = false;
    }
    const sprinting = wantSprint && !staminaDepleted;
    const hasteBonus = playerHaste > 0 ? 1.5 : 1.0;
    const speed = (sprinting ? RUN_SPEED : MOVE_SPEED) * hasteBonus;

    // Sprint FOV — smooth lerp ±6° when sprinting
    const targetFov = _baseFov + (sprinting ? 6 : 0);
    if (Math.abs(renderer.camera.fov - targetFov) > 0.08) {
      renderer.camera.fov += (targetFov - renderer.camera.fov) * Math.min(1, dt * 7);
      renderer.camera.updateProjectionMatrix();
    }

    // Dodge movement (overrides normal movement, grants invincibility)
    if (dodgeActive) {
      dodgeTimer -= dt;
      const dnx = player.x + dodgeVx * dt;
      const dnz = player.z + dodgeVz * dt;
      if (!blocked(dnx, player.z)) player.x = dnx;
      if (!blocked(player.x, dnz)) player.z = dnz;
      if (dodgeTimer <= 0) { dodgeActive = false; dodgeTimer = 0; }
    } else if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      const nx = player.x + mx * speed * dt;
      const nz = player.z + mz * speed * dt;
      if (!blocked(nx, player.z)) player.x = nx;
      if (!blocked(player.x, nz)) player.z = nz;
      walkPhase += dt * (sprinting ? 11 : 7);

      stepTimer -= dt;
      if (stepTimer <= 0) {
        playStep(sprinting);
        stepTimer = sprinting ? 0.27 : 0.42;
      }
    } else {
      stepTimer = 0;
    }
    if (moving || dodgeActive) _mapDirty = true;

    // Update regular enemies
    for (const e of enemies) {
      const dmg = e.update(dt, player, world, blocked);

      if (e._pendingProj) {
        const p = e._pendingProj; e._pendingProj = null;
        spawnProjectile(p.x, p.z, p.dx, p.dz, p.dmg, 'enemy', 0, p.magic ?? false);
      }

      if (dmg !== null && player.hp > 0 && !dodgeActive) {
        // Knockback player away from enemy
        const kDx = player.x - e.x, kDz = player.z - e.z;
        const kD  = Math.hypot(kDx, kDz);
        if (kD > 0) {
          const kx = player.x + (kDx / kD) * 0.35;
          const kz = player.z + (kDz / kD) * 0.35;
          if (!blocked(kx, player.z)) player.x = kx;
          if (!blocked(player.x, kz)) player.z = kz;
        }
        player.hp = Math.max(0, player.hp - dmg);
        spawnDmgNum(player.x, player.z, dmg, true, false);
        hurtOverlay.classList.add('active');
        shakeAmt = 0.055;
        playHurt();
        showHitDir(e.x, e.z);
        addDamageLog(`${e.type ?? 'Enemy'} hit you − ${dmg}`, 'player-hit');
        setTimeout(() => hurtOverlay.classList.remove('active'), 250);
        if (e.isPoison && Math.random() < 0.4) applyPoison(6);
        if (player.hp <= 0) triggerDeath();
      }
      e.syncHpBar(renderer.camera);
    }

    // Update boss — keep updating even when dead so the death animation plays out
    if (boss) {
      if (boss.dead) {
        boss.update(dt, player, world, blocked);
        if (boss._deathTimer <= 0) boss = null;   // mesh removed, safe to clear ref
      } else {
        const dmg = boss.update(dt, player, world, blocked);
        if (boss._pendingProj) {
          const p = boss._pendingProj; boss._pendingProj = null;
          spawnProjectile(p.x, p.z, p.dx, p.dz, p.dmg, 'enemy', 0, p.magic ?? false);
        }
        if (dmg !== null && player.hp > 0 && !dodgeActive) {
          const kDx = player.x - boss.x, kDz = player.z - boss.z;
          const kD  = Math.hypot(kDx, kDz);
          if (kD > 0) {
            const kx = player.x + (kDx / kD) * 0.5;
            const kz = player.z + (kDz / kD) * 0.5;
            if (!blocked(kx, player.z)) player.x = kx;
            if (!blocked(player.x, kz)) player.z = kz;
          }
          player.hp = Math.max(0, player.hp - dmg);
          spawnDmgNum(player.x, player.z, dmg, true, false);
          hurtOverlay.classList.add('active');
          shakeAmt = 0.090;
          playHurt();
          showHitDir(boss.x, boss.z);
          addDamageLog(`Boss hit you − ${dmg}`, 'player-hit');
          setTimeout(() => hurtOverlay.classList.remove('active'), 250);
          if (player.hp <= 0) triggerDeath();
        }
        boss.syncHpBar(renderer.camera);

        if (!bossRevealed && hasLOS(world, player.x, player.z, boss.x, boss.z)) {
          bossRevealed = true;
          bossBar.style.display = 'flex';
          playBossEncounter();
        }
        if (bossRevealed) {
          const pct = boss.hp / boss.maxHp;
          bossFill.style.width   = (pct * 100) + '%';
          bossHpText.textContent = `${Math.round(pct * 100)}%  ${boss.hp} / ${boss.maxHp}`;
          bossFill.classList.toggle('enraged', pct < 0.40);
        }
      }
    }

    updateProjectiles(dt);
    tickPoison(dt);
    tickPlayerStatuses(dt);
    tickEnemyStatuses(dt);
    _tickStreak(dt);
    _tickCombo(dt);

    // ── Trap tile damage ──────────────────────────────────────────────────
    if (_trapCooldown > 0) { _trapCooldown -= dt; }
    else {
      const tx = Math.floor(player.x), tz = Math.floor(player.z);
      if (world.get(tx, tz) === TILE.TRAP) {
        const dmg = 5;
        player.hp = Math.max(0, player.hp - dmg);
        spawnDmgNum(player.x, player.z, dmg, true, false);
        hurtOverlay.classList.add('active');
        setTimeout(() => hurtOverlay.classList.remove('active'), 220);
        playHurt(); shakeAmt = 0.04;
        addDamageLog('Spike trap! −5', 'player-hit');
        _trapCooldown = 1.6;
        if (player.hp <= 0) triggerDeath();
      }
    }

    // ── XP orb collection ─────────────────────────────────────────────────
    for (let i = xpOrbs.length - 1; i >= 0; i--) {
      const orb = xpOrbs[i];
      orb.update(dt);
      if (Math.hypot(orb.x - player.x, orb.z - player.z) < 0.85) {
        const levelled = player.gainXP(orb.xp);
        if (levelled) showLevelUp();
        spawnDmgNum(player.x, player.z, orb.xp, false, false);
        orb.remove();
        xpOrbs.splice(i, 1);
      }
    }

    // ── Merchant chest spin ───────────────────────────────────────────────
    if (_merchantMesh) { _merchantMesh.rotation.y += dt * 1.2; }

    // ── Boss enrage detection ─────────────────────────────────────────────
    if (boss && boss._justEnraged) {
      boss._justEnraged = false;
      _showBanner('⚠  PHASE TWO  ⚠', '#ff1100');
      addDamageLog('The Warden ENRAGES!', 'critical');
      playBossEncounter();
    }

    // ── Secret wall / merchant prompt ─────────────────────────────────────
    if (!_flashTimer) {
      let nearSecret = false;
      for (let z2 = Math.floor(player.z)-1; z2 <= Math.floor(player.z)+1; z2++)
        for (let x2 = Math.floor(player.x)-1; x2 <= Math.floor(player.x)+1; x2++)
          if (world.get(x2,z2) === TILE.SECRET_WALL && Math.hypot(x2+0.5-player.x,z2+0.5-player.z) < 1.4)
            nearSecret = true;
      const nearMerchant = merchantPos && Math.hypot(merchantPos.x-player.x, merchantPos.z-player.z) < 2.0 && _merchantItems.length > 0;
      if (nearSecret) {
        pickupPrompt.style.display = 'block';
        pickupPrompt.textContent = 'E — hidden passage';
      } else if (nearMerchant) {
        pickupPrompt.style.display = 'block';
        pickupPrompt.textContent = 'E — MERCHANT  [shop]';
      }
    }

    for (const gi of groundItems) gi.update(dt);

    if (!_flashTimer) {
      let nearItem = null;
      for (const gi of groundItems) {
        if (Math.hypot(gi.x - player.x, gi.z - player.z) < 1.5) { nearItem = gi; break; }
      }
      if (nearItem) {
        pickupPrompt.style.display = 'block';
        const def = ITEMS[nearItem.itemId];
        pickupPrompt.textContent = `E — pick up  ${def.name}${def.cursed ? ' [CURSED]' : ''}`;
      } else {
        pickupPrompt.style.display = 'none';
      }
    }

    if (!transitioning && world.get(Math.floor(player.x), Math.floor(player.z)) === TILE.STAIR_DOWN) {
      triggerNextFloor();
    }

    world.markVisible(player.x, player.z);

    const bobAmp = sprinting ? 0.048 : 0.028;
    const bob    = moving && !dodgeActive ? Math.sin(walkPhase) * bobAmp : 0;

    renderer.syncCamera(player, bob, shakeAmt);
    if (swingTimer <= 0) renderer.bobWeapon(walkPhase, moving, sprinting);
    renderer.flickerLights(tick);
    updateHud();
    drawMinimap();

    // ── Low HP vignette + heartbeat ───────────────────────────────────────
    const hpRatio = player.hp / player.maxHp;
    if (lowHpOverlay) lowHpOverlay.classList.toggle('active', hpRatio <= 0.30);
    if (hpRatio <= 0.25) {
      _heartbeatTimer -= dt;
      if (_heartbeatTimer <= 0) {
        playHeartbeat();
        _heartbeatTimer = 0.5 + hpRatio * 4; // faster when lower HP
      }
    } else {
      _heartbeatTimer = 0;
    }

    // ── Crosshair enemy targeting ─────────────────────────────────────────
    if (tick % 4 === 0) {
      const fwdX2 = -Math.sin(player.yaw), fwdZ2 = -Math.cos(player.yaw);
      const wId   = inventory.equipped?.weapon ?? 'fist';
      const aRng  = (WEAPON_RANGE[wId] ?? 1.05) + 0.35;
      const allT2 = boss && !boss.dead ? [...enemies, boss] : enemies;
      const onTarget = allT2.some(e => {
        if (e.dead) return false;
        const dx2 = e.x - player.x, dz2 = e.z - player.z;
        const d2 = Math.hypot(dx2, dz2);
        return d2 <= aRng && (dx2/d2)*fwdX2 + (dz2/d2)*fwdZ2 > 0.25;
      });
      const ce = document.getElementById('crosshair');
      if (ce) ce.classList.toggle('target', onTarget);
    }

    // ── Near-trap proximity warning ───────────────────────────────────────
    if (!_flashTimer) {
      const ptx = Math.floor(player.x), ptz = Math.floor(player.z);
      let nearTrap = false;
      for (let dz3 = -1; dz3 <= 1 && !nearTrap; dz3++)
        for (let dx3 = -1; dx3 <= 1; dx3++)
          if (world.get(ptx+dx3, ptz+dz3) === TILE.TRAP &&
              Math.hypot(dx3, dz3) < 1.5) nearTrap = true;
      if (nearTrap) {
        pickupPrompt.style.display = 'block';
        pickupPrompt.className = 'full';
        pickupPrompt.textContent = '⚠  SPIKE TRAP';
      }
    }

    // Keep full map in sync while open
    if (mapOpen && tick % 6 === 0) drawFullMap();
  }

  renderer.render();
}

// ── Start ──────────────────────────────────────────────────────────────────
applyMetaUpgrades();
loadFloor();
requestAnimationFrame(loop);

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
