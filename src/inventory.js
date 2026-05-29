import { ITEMS } from './items.js';
import { buildIcons, getIcon } from './icons.js';

const MAX_SLOTS  = 20;
const RARITY_COL = { common: '#3a3a4a', rare: '#6633bb', epic: '#cc8800' };

export class Inventory {
  constructor(player, domElement) {
    this.player   = player;
    this._dom     = domElement;
    this.items    = [];
    this.equipped = { weapon: null, armor: null, spell: null };
    this.open     = false;
    this._buildUI();
  }

  // ── DOM construction ───────────────────────────────────────────────────────
  _buildUI() {
    const el = document.createElement('div');
    el.id = 'inv-overlay';
    el.innerHTML = `
      <div id="inv-panel">
        <div id="inv-header">
          <span>INVENTORY</span>
          <span id="inv-close">[I / ESC]</span>
        </div>
        <div id="inv-body">
          <div id="inv-grid-wrap">
            <div class="inv-label">BAG</div>
            <div id="inv-grid"></div>
          </div>
          <div id="inv-sidebar">
            <div class="inv-label">EQUIPPED</div>
            <div class="equip-slot" id="equip-weapon" data-slot="weapon">
              <div class="equip-slot-label">WEAPON  [F]</div>
              <div class="equip-slot-item" id="equip-weapon-item">— empty —</div>
            </div>
            <div class="equip-slot" id="equip-armor" data-slot="armor">
              <div class="equip-slot-label">ARMOR</div>
              <div class="equip-slot-item" id="equip-armor-item">— empty —</div>
            </div>
            <div class="equip-slot equip-spell-slot" id="equip-spell" data-slot="spell">
              <div class="equip-slot-label">SPELL  [Q]</div>
              <div class="equip-slot-item" id="equip-spell-item">— empty —</div>
              <div class="equip-slot-hint">Click scroll in bag to equip</div>
            </div>
            <div id="inv-stats">
              <div class="inv-label" style="margin-top:14px">STATS</div>
              <div id="stat-atk" class="stat-line"></div>
              <div id="stat-def" class="stat-line"></div>
              <div id="stat-hp"  class="stat-line"></div>
            </div>
            <div id="inv-details">
              <div class="inv-label" style="margin-top:14px">DETAILS</div>
              <div id="inv-details-name"></div>
              <div id="inv-details-desc"></div>
            </div>
            <div id="inv-hint">Click weapon/armor → equip.<br>Click scroll → SPELL slot.<br>Click equipped → unequip.<br>Hover item → see details.</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector('#inv-close').addEventListener('click', () => this.close());

    el.querySelectorAll('.equip-slot').forEach(slot =>
      slot.addEventListener('click', () => this._unequip(slot.dataset.slot))
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  toggle(input) {
    this.open ? this.close(input) : this._open(input);
  }

  _open(input) {
    this.open = true;
    if (input) input.inventoryOpen = true;
    buildIcons();
    document.exitPointerLock();
    this._el.style.display = 'flex';
    this._render();
  }

  close(input) {
    this.open = false;
    if (input) input.inventoryOpen = false;
    this._el.style.display = 'none';
    this._dom.requestPointerLock();
  }

  addItem(itemId) {
    if (this.items.length >= MAX_SLOTS) return false;
    this.items.push(itemId);
    return true;
  }

  // Returns the equipped scroll ID and clears the spell slot, or null if none.
  useEquippedSpell() {
    const id = this.equipped.spell;
    if (!id) return null;
    this.equipped.spell = null;
    if (this.open) this._render();
    return id;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  _render() {
    this._renderGrid();
    this._renderEquipSlot('weapon');
    this._renderEquipSlot('armor');
    this._renderEquipSlot('spell');
    this._renderStats();
    this._clearItemDetails();
  }

  _renderGrid() {
    const grid = this._el.querySelector('#inv-grid');
    grid.innerHTML = '';
    for (let i = 0; i < MAX_SLOTS; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      if (i < this.items.length) {
        const id  = this.items[i];
        const def = ITEMS[id];
        cell.style.borderColor = RARITY_COL[def.rarity] ?? '#2a2a3a';

        const iconURL = getIcon(id);
        const icon = document.createElement(iconURL ? 'img' : 'div');
        icon.className = 'inv-icon';
        if (iconURL) {
          icon.src = iconURL;
        } else {
          icon.style.background = '#' + def.color.toString(16).padStart(6, '0');
        }
        cell.appendChild(icon);

        if (def.type === 'scroll') {
          const colorHex = '#' + def.color.toString(16).padStart(6, '0');
          cell.classList.add('scroll-cell');
          cell.style.borderColor = colorHex;
          cell.style.setProperty('--scroll-color', colorHex);
        } else {
          cell.style.borderColor = RARITY_COL[def.rarity] ?? '#2a2a3a';
        }

        const lbl = document.createElement('div');
        lbl.className = 'inv-cell-name';
        lbl.textContent = def.name;
        cell.appendChild(lbl);

        const disc = document.createElement('span');
        disc.className = 'inv-discard';
        disc.textContent = '×';
        disc.title = 'Discard item';
        disc.addEventListener('click', e => {
          e.stopPropagation();
          this._discardItem(i);
        });
        cell.appendChild(disc);

        const isEquipped = Object.values(this.equipped).includes(id);
        if (isEquipped) {
          cell.classList.add('inv-cell-equipped');
          const badge = document.createElement('div');
          badge.className = 'inv-equipped-badge';
          badge.textContent = '✓';
          cell.appendChild(badge);
        }

        cell.addEventListener('click', () => this._useItem(i));
        cell.addEventListener('mouseenter', () => this._showItemDetails(id));
        cell.addEventListener('mouseleave', () => this._clearItemDetails());
      }
      grid.appendChild(cell);
    }
  }

  _renderEquipSlot(slot) {
    const slotEl = this._el.querySelector(`#equip-${slot}`);
    const itemEl = this._el.querySelector(`#equip-${slot}-item`);
    if (!itemEl) return;
    const id = this.equipped[slot];
    if (id) {
      const def = ITEMS[id];
      const colorHex = '#' + def.color.toString(16).padStart(6, '0');
      itemEl.textContent      = def.name;
      itemEl.style.color      = slot === 'spell' ? colorHex : '#ffd060';
      itemEl.style.background = colorHex + '22';
      if (slot === 'spell' && slotEl) {
        slotEl.style.setProperty('--spell-color', colorHex);
        slotEl.classList.add('spell-active');
      }
    } else {
      itemEl.textContent      = '— empty —';
      itemEl.style.color      = '#333';
      itemEl.style.background = '';
      if (slot === 'spell' && slotEl) {
        slotEl.classList.remove('spell-active');
        slotEl.style.removeProperty('--spell-color');
      }
    }
  }

  _renderStats() {
    const wBonus = this.equipped.weapon ? ITEMS[this.equipped.weapon].stat : 0;
    const aBonus = this.equipped.armor  ? ITEMS[this.equipped.armor].stat  : 0;
    const baseAtk = this.player.attack  - wBonus;
    const baseDef = this.player.defense - aBonus;
    this._el.querySelector('#stat-atk').textContent = `ATK  ${baseAtk}${wBonus ? ` + ${wBonus}` : ''}`;
    this._el.querySelector('#stat-def').textContent = `DEF  ${baseDef}${aBonus ? ` + ${aBonus}` : ''}`;
    this._el.querySelector('#stat-hp' ).textContent = `HP   ${this.player.hp} / ${this.player.maxHp}`;
  }

  _showItemDetails(id) {
    const def  = ITEMS[id];
    const nameEl = this._el.querySelector('#inv-details-name');
    const descEl = this._el.querySelector('#inv-details-desc');
    if (!nameEl || !descEl) return;
    nameEl.textContent = def.name + (def.cursed ? '  [CURSED]' : '');
    nameEl.style.color = def.rarity === 'rare' ? '#bb88ff' : '#ffd060';
    descEl.textContent = def.desc ?? '';
  }

  _clearItemDetails() {
    const nameEl = this._el.querySelector('#inv-details-name');
    const descEl = this._el.querySelector('#inv-details-desc');
    if (nameEl) nameEl.textContent = '';
    if (descEl) descEl.textContent = '';
  }

  // ── Item actions ───────────────────────────────────────────────────────────
  _useItem(idx) {
    const id  = this.items[idx];
    const def = ITEMS[id];
    if (def.type === 'weapon' || def.type === 'armor') {
      this._equip(id, idx);
    } else if (def.type === 'potion') {
      this._usePotion(idx, def.stat);
    } else if (def.type === 'scroll') {
      this._equipScroll(id, idx);   // scrolls go to spell slot, not immediate use
    }
  }

  _equip(itemId, bagIdx) {
    const def  = ITEMS[itemId];
    const slot = def.type;
    const old  = this.equipped[slot];

    if (old) {
      const oldDef = ITEMS[old];
      if (slot === 'weapon') this.player.attack  -= oldDef.stat;
      else                   this.player.defense -= oldDef.stat;
      this.items[bagIdx] = old;
    } else {
      this.items.splice(bagIdx, 1);
    }

    this.equipped[slot] = itemId;
    if (slot === 'weapon') this.player.attack  += def.stat;
    else                   this.player.defense += def.stat;

    this._render();
  }

  _equipScroll(itemId, bagIdx) {
    const old = this.equipped.spell;
    if (old) {
      this.items[bagIdx] = old;     // swap old scroll back to bag
    } else {
      this.items.splice(bagIdx, 1);
    }
    this.equipped.spell = itemId;
    this._render();
  }

  _unequip(slot) {
    const id = this.equipped[slot];
    if (!id || this.items.length >= MAX_SLOTS) return;
    // For spell slot there's no stat to remove
    if (slot === 'weapon' || slot === 'armor') {
      const def = ITEMS[id];
      if (slot === 'weapon') this.player.attack  -= def.stat;
      else                   this.player.defense -= def.stat;
    }
    this.items.push(id);
    this.equipped[slot] = null;
    this._render();
  }

  _usePotion(idx, healAmt) {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
    this.items.splice(idx, 1);
    this._render();
  }

  _discardItem(idx) {
    this.items.splice(idx, 1);
    this._render();
  }
}
