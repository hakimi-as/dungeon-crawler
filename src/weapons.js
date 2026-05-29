import * as THREE from 'https://unpkg.com/three@0.164.1/build/three.module.js';

// ── Ground pickup meshes ──────────────────────────────────────────────────

export function buildGroundMesh(itemId, color) {
  switch (itemId) {
    case 'rusty_dagger':    return _groundDagger(0x8a8a7a, 0x666655);
    case 'iron_sword':      return _groundSword(0xaaaacc, 0xccaa55, false);
    case 'bone_club':       return _groundClub(0xddd4b8);
    case 'dread_blade':     return _groundSword(0xdd2211, 0x881100, true);
    case 'magic_staff':     return _groundStaff(0x9944ff, 0x5522aa);
    case 'bow':             return _groundBow();
    case 'leather_vest':    return _groundLeatherVest(0x8b4513);
    case 'bone_shield':     return _groundShield(0xddd4b8);
    case 'chainmail':       return _groundChainmail(0x8899aa);
    case 'shadow_robe':     return _groundRobe(0x442266);
    case 'health_potion':   return _groundPotion(0xcc1133, false);
    case 'greater_potion':  return _groundPotion(0xff3355, true);
    case 'scroll_fireball': return _groundScroll(0xff4400, 0xff8800);
    case 'scroll_teleport': return _groundScroll(0x4488ff, 0x88ccff);
    case 'scroll_identify': return _groundScroll(0x44dd66, 0x88ffaa);
    case 'scroll_haste':    return _groundScroll(0xffdd00, 0xffff88);
    case 'scroll_freeze':   return _groundScroll(0x88ccff, 0xccf0ff);
    default:                return _fallback(color);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mat(color, emissive = 0, ei = 0) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei });
}
function mesh(geo, m) { return new THREE.Mesh(geo, m); }

// ── Ground builders ───────────────────────────────────────────────────────

function _groundSword(blade, guard, glow) {
  const g = new THREE.Group();
  const bladeM = mat(blade, glow ? blade : 0, glow ? 0.6 : 0);

  // Blade body
  const body = mesh(new THREE.BoxGeometry(0.058, 0.52, 0.013), bladeM);
  body.position.y = 0.12; g.add(body);

  // Fuller (central ridge — very thin, slightly emissive)
  const fuller = mesh(new THREE.BoxGeometry(0.016, 0.48, 0.015), mat(blade, blade, glow ? 0.9 : 0.18));
  fuller.position.y = 0.12; g.add(fuller);

  // Tapered tip (3 stepped boxes)
  const tip1 = mesh(new THREE.BoxGeometry(0.042, 0.14, 0.011), bladeM);
  tip1.position.y = 0.42; g.add(tip1);
  const tip2 = mesh(new THREE.BoxGeometry(0.024, 0.09, 0.009), bladeM);
  tip2.position.y = 0.51; g.add(tip2);

  // I-shaped crossguard
  const bar = mesh(new THREE.BoxGeometry(0.26, 0.033, 0.018), mat(guard));
  bar.position.y = -0.14; g.add(bar);
  const capL = mesh(new THREE.BoxGeometry(0.034, 0.058, 0.016), mat(guard));
  capL.position.set(-0.12, -0.14, 0); g.add(capL);
  const capR = capL.clone(); capR.position.x = 0.12; g.add(capR);

  // Leather hilt
  const hilt = mesh(new THREE.CylinderGeometry(0.025, 0.030, 0.22, 7), mat(0x5c3318));
  hilt.position.y = -0.29; g.add(hilt);
  // Wrapping rings on hilt
  for (const y of [-0.22, -0.28, -0.34]) {
    const w = mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.013, 7), mat(0x2e1408));
    w.position.y = y; g.add(w);
  }

  // Pommel
  const pommel = mesh(new THREE.SphereGeometry(0.038, 7, 6), mat(guard));
  pommel.position.y = -0.42; g.add(pommel);

  g.rotation.z = 0.38;
  return g;
}

function _groundDagger(blade, guard) {
  const g = new THREE.Group();
  const bladeM = mat(blade);

  const body = mesh(new THREE.BoxGeometry(0.038, 0.30, 0.009), bladeM);
  body.position.y = 0.08; g.add(body);
  const fuller = mesh(new THREE.BoxGeometry(0.010, 0.27, 0.011), mat(blade, blade, 0.12));
  fuller.position.y = 0.08; g.add(fuller);
  const tip = mesh(new THREE.BoxGeometry(0.022, 0.08, 0.007), bladeM);
  tip.position.y = 0.31; g.add(tip);

  const bar = mesh(new THREE.BoxGeometry(0.17, 0.026, 0.013), mat(guard));
  bar.position.y = -0.07; g.add(bar);
  const capL = mesh(new THREE.BoxGeometry(0.024, 0.040, 0.011), mat(guard));
  capL.position.set(-0.076, -0.07, 0); g.add(capL);
  const capR = capL.clone(); capR.position.x = 0.076; g.add(capR);

  const hilt = mesh(new THREE.CylinderGeometry(0.020, 0.024, 0.17, 6), mat(0x5c3318));
  hilt.position.y = -0.19; g.add(hilt);
  const pommel = mesh(new THREE.SphereGeometry(0.028, 6, 5), mat(guard));
  pommel.position.y = -0.30; g.add(pommel);

  g.rotation.z = 0.28;
  return g;
}

function _groundClub(color) {
  const g = new THREE.Group();

  // Shaft with bone-like joint segments
  const shaft = mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.44, 6), mat(color));
  shaft.position.y = -0.05; g.add(shaft);
  for (const y of [-0.10, 0.08]) {
    const knob = mesh(new THREE.SphereGeometry(0.037, 6, 5), mat(color));
    knob.position.y = y; g.add(knob);
  }

  // Knobby head using dodecahedron (12-faced, naturally lumpy)
  const head = mesh(new THREE.DodecahedronGeometry(0.10, 0), mat(color));
  head.position.y = 0.27; g.add(head);

  // Extra protruding spikes (flattened spheres at head surface)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sp = mesh(new THREE.SphereGeometry(0.028, 5, 4), mat(color));
    sp.position.set(Math.cos(a) * 0.095, 0.27, Math.sin(a) * 0.095);
    g.add(sp);
  }

  g.rotation.z = 0.28;
  return g;
}

function _groundStaff(color, darkColor) {
  const g = new THREE.Group();

  const shaft = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.75, 6), mat(0x8B4513));
  g.add(shaft);

  // Metal binding rings on shaft
  for (const y of [0.22, 0, -0.22]) {
    const ring = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.016, 8), mat(0x887766));
    ring.position.y = y; g.add(ring);
  }

  // Orb (large glowing sphere)
  const orb = mesh(new THREE.SphereGeometry(0.10, 9, 7), mat(color, color, 0.70));
  orb.position.y = 0.45; g.add(orb);

  // Orbiting crystal facets (6 octahedra around the orb)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const gem = mesh(new THREE.OctahedronGeometry(0.026, 0), mat(darkColor ?? color, color, 0.55));
    gem.position.set(Math.cos(a) * 0.130, 0.45, Math.sin(a) * 0.130);
    g.add(gem);
  }

  // Crown ring holding orb
  const crown = mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.030, 8), mat(0x887766));
  crown.position.y = 0.35; g.add(crown);

  g.rotation.z = 0.18;
  return g;
}

function _groundLeatherVest(color) {
  const g = new THREE.Group();

  const chest = mesh(new THREE.BoxGeometry(0.44, 0.34, 0.07), mat(color));
  g.add(chest);

  // Center front strap
  const strap = mesh(new THREE.BoxGeometry(0.060, 0.32, 0.085), mat(0x6b3210));
  g.add(strap);
  // Buckles
  for (const y of [-0.07, 0.07]) {
    const buckle = mesh(new THREE.BoxGeometry(0.038, 0.022, 0.095), mat(0xbbaa44));
    buckle.position.y = y; g.add(buckle);
  }

  // Shoulder pauldrons
  const sL = mesh(new THREE.BoxGeometry(0.10, 0.12, 0.060), mat(color));
  sL.position.set(-0.22, 0.14, 0); g.add(sL);
  const sR = sL.clone(); sR.position.x = 0.22; g.add(sR);

  g.rotation.x = 0.28;
  return g;
}

function _groundShield(color) {
  const g = new THREE.Group();

  // Kite shape: three stacked boxes of decreasing width
  const top = mesh(new THREE.BoxGeometry(0.40, 0.28, 0.060), mat(color));
  top.position.y = 0.10; g.add(top);
  const mid = mesh(new THREE.BoxGeometry(0.34, 0.18, 0.060), mat(color));
  g.add(mid);
  const bot = mesh(new THREE.BoxGeometry(0.20, 0.14, 0.060), mat(color));
  bot.position.y = -0.18; g.add(bot);

  // Rim trim (4 thin borders)
  const rimTop = mesh(new THREE.BoxGeometry(0.42, 0.014, 0.075), mat(0xbbbbbb));
  rimTop.position.y = 0.24; g.add(rimTop);
  const rimL = mesh(new THREE.BoxGeometry(0.014, 0.36, 0.075), mat(0xbbbbbb));
  rimL.position.x = -0.19; g.add(rimL);
  const rimR = rimL.clone(); rimR.position.x = 0.19; g.add(rimR);

  // Cross decoration
  const crossV = mesh(new THREE.BoxGeometry(0.018, 0.30, 0.080), mat(0xaaaaaa));
  crossV.position.z = -0.005; g.add(crossV);
  const crossH = mesh(new THREE.BoxGeometry(0.28, 0.018, 0.080), mat(0xaaaaaa));
  crossH.position.set(0, 0.06, -0.005); g.add(crossH);

  // Center boss
  const boss = mesh(new THREE.SphereGeometry(0.068, 8, 6), mat(0xcccccc));
  boss.position.z = 0.050; g.add(boss);

  g.rotation.x = 0.22;
  return g;
}

function _groundChainmail(color) {
  const g = new THREE.Group();

  const chest = mesh(new THREE.BoxGeometry(0.46, 0.36, 0.065), mat(color));
  g.add(chest);

  // Chain rows (horizontal strips suggesting ring mail)
  for (let i = -2; i <= 2; i++) {
    const row = mesh(new THREE.BoxGeometry(0.46, 0.012, 0.080), mat(0x6677aa));
    row.position.y = i * 0.068; g.add(row);
  }

  // Curved shoulder guards
  const sL = mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.13, 8), mat(color));
  sL.position.set(-0.25, 0.17, 0); sL.rotation.z = 0.30; g.add(sL);
  const sR = sL.clone(); sR.position.x = 0.25; sR.rotation.z = -0.30; g.add(sR);

  // Standing collar
  const collar = mesh(new THREE.CylinderGeometry(0.115, 0.135, 0.075, 9), mat(0x99aacc));
  collar.position.y = 0.22; g.add(collar);

  g.rotation.x = 0.28;
  return g;
}

function _groundRobe(color) {
  const g = new THREE.Group();
  const em = mat(color, color, 0.10);

  // Upper torso
  const upper = mesh(new THREE.BoxGeometry(0.38, 0.26, 0.085), em);
  upper.position.y = 0.14; g.add(upper);

  // Flared skirt (wider)
  const skirt = mesh(new THREE.BoxGeometry(0.52, 0.36, 0.095), em);
  skirt.position.y = -0.18; g.add(skirt);

  // Sleeves
  const sL = mesh(new THREE.BoxGeometry(0.10, 0.24, 0.075), em);
  sL.position.set(-0.24, 0.08, 0); g.add(sL);
  const sR = sL.clone(); sR.position.x = 0.24; g.add(sR);

  // Hood (sphere)
  const hood = mesh(new THREE.SphereGeometry(0.125, 8, 7), mat(color, color, 0.12));
  hood.position.y = 0.40; g.add(hood);

  // Magic clasp gem
  const clasp = mesh(new THREE.OctahedronGeometry(0.030, 0), mat(0xaa44ff, 0xcc66ff, 0.9));
  clasp.position.y = 0.26; g.add(clasp);

  g.rotation.x = 0.20;
  return g;
}

function _groundPotion(color, large) {
  const g = new THREE.Group();
  const r = large ? 0.105 : 0.085;

  // Spherical flask
  const flask = mesh(new THREE.SphereGeometry(r, 9, 7), mat(color, color, 0.50));
  flask.position.y = 0; g.add(flask);

  // Narrow neck
  const neck = mesh(new THREE.CylinderGeometry(0.030, 0.050, 0.095, 7), mat(color, color, 0.40));
  neck.position.y = r + 0.042; g.add(neck);

  // Cork stopper
  const cork = mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.044, 7), mat(0x8B5A2B));
  cork.position.y = r + 0.106; g.add(cork);

  // Wax seal on top of cork
  const seal = mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 7), mat(large ? 0xddaa00 : 0x880022));
  seal.position.y = r + 0.134; g.add(seal);

  return g;
}

function _groundScroll(sealColor, runeColor) {
  const g = new THREE.Group();
  const PARCH = 0xd4b87a;
  const AGED  = 0xc4a860;

  // Parchment roll body
  const body = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.30, 9), mat(PARCH));
  g.add(body);

  // Rolled end caps with disc rims
  for (const y of [0.165, -0.165]) {
    const cap = mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.036, 9), mat(AGED));
    cap.position.y = y; g.add(cap);
    const rim = mesh(new THREE.CylinderGeometry(0.080, 0.080, 0.009, 9), mat(0xb89850));
    rim.position.y = y + Math.sign(y) * 0.022; g.add(rim);
  }

  // Wax seal band — colored per scroll type
  const band = mesh(new THREE.CylinderGeometry(0.059, 0.059, 0.030, 9), mat(sealColor, sealColor, 0.65));
  g.add(band);

  // 3 orbiting rune gems
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rune = mesh(
      new THREE.OctahedronGeometry(0.026, 0),
      mat(runeColor, runeColor, 2.8)
    );
    rune.position.set(Math.cos(a) * 0.135, Math.sin(a * 0.5) * 0.06, Math.sin(a) * 0.135);
    g.add(rune);
  }

  // Inner emissive glow core (visible through gaps)
  const core = mesh(new THREE.SphereGeometry(0.040, 7, 5), mat(sealColor, sealColor, 5.0));
  g.add(core);

  g.rotation.z = 0.22;
  return g;
}

function _fallback(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), mat(color, color, 0.3)));
  return g;
}

// ── First-person weapon viewmodels ────────────────────────────────────────

export function buildViewWeapon(itemId) {
  switch (itemId) {
    case 'iron_sword':   return _viewSword(0xaaaacc, 0xccaa55, false);
    case 'rusty_dagger': return _viewDagger(0x8a8a7a, 0x666655);
    case 'bone_club':    return _viewClub(0xddd4b8);
    case 'dread_blade':  return _viewSword(0xdd2211, 0x881100, true);
    case 'magic_staff':  return _viewStaff(0x9944ff, 0x5522aa);
    case 'bow':          return _viewBow();
    default:             return _viewFist();
  }
}

function _viewSword(bladeColor, guardColor, glow) {
  const g = new THREE.Group();
  const bladeM = mat(bladeColor, glow ? bladeColor : 0, glow ? 0.6 : 0);

  // Blade body
  const blade = mesh(new THREE.BoxGeometry(0.068, 0.78, 0.015), bladeM);
  blade.position.y = 0.22; g.add(blade);

  // Fuller
  const fuller = mesh(new THREE.BoxGeometry(0.018, 0.72, 0.017), mat(bladeColor, bladeColor, glow ? 0.9 : 0.18));
  fuller.position.y = 0.22; g.add(fuller);

  // Tapered tip
  const tip1 = mesh(new THREE.BoxGeometry(0.048, 0.17, 0.013), bladeM);
  tip1.position.y = 0.65; g.add(tip1);
  const tip2 = mesh(new THREE.BoxGeometry(0.026, 0.10, 0.010), bladeM);
  tip2.position.y = 0.74; g.add(tip2);

  // I-shaped guard
  const bar = mesh(new THREE.BoxGeometry(0.32, 0.042, 0.022), mat(guardColor));
  bar.position.y = -0.20; g.add(bar);
  const capL = mesh(new THREE.BoxGeometry(0.042, 0.072, 0.018), mat(guardColor));
  capL.position.set(-0.148, -0.20, 0); g.add(capL);
  const capR = capL.clone(); capR.position.x = 0.148; g.add(capR);

  // Hilt
  const hilt = mesh(new THREE.CylinderGeometry(0.030, 0.036, 0.28, 7), mat(0x5c3318));
  hilt.position.y = -0.40; g.add(hilt);
  for (const y of [-0.32, -0.39, -0.46]) {
    const w = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.016, 7), mat(0x2e1408));
    w.position.y = y; g.add(w);
  }

  // Pommel
  const pommel = mesh(new THREE.SphereGeometry(0.048, 7, 6), mat(guardColor));
  pommel.position.y = -0.57; g.add(pommel);

  return g;
}

function _viewDagger(color, guardColor) {
  const g = new THREE.Group();
  const bladeM = mat(color);

  const blade = mesh(new THREE.BoxGeometry(0.048, 0.46, 0.012), bladeM);
  blade.position.y = 0.10; g.add(blade);
  const fuller = mesh(new THREE.BoxGeometry(0.012, 0.42, 0.014), mat(color, color, 0.14));
  fuller.position.y = 0.10; g.add(fuller);
  const tip = mesh(new THREE.BoxGeometry(0.028, 0.10, 0.010), bladeM);
  tip.position.y = 0.36; g.add(tip);

  const bar = mesh(new THREE.BoxGeometry(0.22, 0.030, 0.016), mat(guardColor ?? 0x666655));
  bar.position.y = -0.12; g.add(bar);
  const capL = mesh(new THREE.BoxGeometry(0.028, 0.050, 0.014), mat(guardColor ?? 0x666655));
  capL.position.set(-0.098, -0.12, 0); g.add(capL);
  const capR = capL.clone(); capR.position.x = 0.098; g.add(capR);

  const hilt = mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.20, 6), mat(0x5c3318));
  hilt.position.y = -0.25; g.add(hilt);
  const pommel = mesh(new THREE.SphereGeometry(0.030, 6, 5), mat(guardColor ?? 0x666655));
  pommel.position.y = -0.37; g.add(pommel);

  return g;
}

function _viewClub(color) {
  const g = new THREE.Group();

  const shaft = mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.60, 7), mat(color));
  shaft.position.y = -0.12; g.add(shaft);
  for (const y of [-0.05, 0.09]) {
    const k = mesh(new THREE.SphereGeometry(0.048, 7, 5), mat(color));
    k.position.y = y; g.add(k);
  }

  const head = mesh(new THREE.DodecahedronGeometry(0.13, 0), mat(color));
  head.position.y = 0.24; g.add(head);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sp = mesh(new THREE.SphereGeometry(0.036, 5, 4), mat(color));
    sp.position.set(Math.cos(a) * 0.12, 0.24, Math.sin(a) * 0.12);
    g.add(sp);
  }

  return g;
}

function _viewStaff(color, darkColor) {
  const g = new THREE.Group();

  const shaft = mesh(new THREE.CylinderGeometry(0.034, 0.034, 1.08, 7), mat(0x8B4513));
  g.add(shaft);
  for (const y of [0.28, 0, -0.28]) {
    const ring = mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.018, 8), mat(0x887766));
    ring.position.y = y; g.add(ring);
  }

  const orb = mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(color, color, 0.95));
  orb.position.y = 0.62; g.add(orb);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const gem = mesh(new THREE.OctahedronGeometry(0.032, 0), mat(darkColor ?? color, color, 0.65));
    gem.position.set(Math.cos(a) * 0.16, 0.62, Math.sin(a) * 0.16);
    g.add(gem);
  }

  const crown = mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.035, 9), mat(0x887766));
  crown.position.y = 0.49; g.add(crown);

  return g;
}

function _groundBow() {
  const g = new THREE.Group();
  const arc = mesh(new THREE.TorusGeometry(0.22, 0.014, 5, 10, Math.PI), mat(0x7a5a1a));
  arc.rotation.z = Math.PI / 2; g.add(arc);
  const string = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.44, 3), mat(0xeeeeaa));
  g.add(string);
  const grip = mesh(new THREE.BoxGeometry(0.022, 0.18, 0.022), mat(0x5c3318));
  g.add(grip);
  g.rotation.z = 0.22;
  return g;
}

function _viewBow() {
  const g = new THREE.Group();
  // Bow limbs arc (torus segment facing forward)
  const stave = mesh(new THREE.TorusGeometry(0.30, 0.018, 5, 12, Math.PI * 0.92), mat(0x7a5a1a));
  stave.rotation.y =  Math.PI / 2;
  stave.rotation.x = -0.25;
  g.add(stave);
  // Grip wrap
  const grip = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 7), mat(0x5c3318));
  grip.rotation.x = Math.PI / 2; grip.position.z = 0.04;
  g.add(grip);
  // String
  const string = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.54, 3), mat(0xeeeebb));
  string.rotation.x = Math.PI / 2; string.position.z = 0.04;
  g.add(string);
  // Nocked arrow shaft
  const shaft = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.48, 4), mat(0x8B6914));
  shaft.rotation.x = Math.PI / 2; shaft.position.set(-0.018, 0.014, -0.04);
  g.add(shaft);
  // Arrowhead
  const head = mesh(new THREE.ConeGeometry(0.018, 0.065, 4), mat(0x888888));
  head.rotation.x = -Math.PI / 2; head.position.set(-0.018, 0.014, -0.28);
  g.add(head);
  // Fletching
  const fletch = mesh(new THREE.BoxGeometry(0.018, 0.042, 0.028), mat(0xcc3333));
  fletch.position.set(-0.018, 0.014, 0.20);
  g.add(fletch);
  return g;
}

function _viewFist() {
  const g = new THREE.Group();
  const SKIN  = 0xdda085;  // back-of-hand
  const CRSE  = 0xbb8060;  // darker crease / underside
  const NAIL  = 0xe8cdb0;  // nail highlight

  // ── Forearm (extends downward, partially visible at screen edge) ──────────
  const forearm = mesh(new THREE.CylinderGeometry(0.056, 0.064, 0.40, 8), mat(SKIN));
  forearm.position.set(0.018, -0.28, 0.10);
  forearm.rotation.set(0.28, 0, -0.10);
  g.add(forearm);

  // ── Wrist ──────────────────────────────────────────────────────────────────
  const wrist = mesh(new THREE.BoxGeometry(0.138, 0.096, 0.128), mat(SKIN));
  wrist.position.set(0, -0.10, 0.02);
  g.add(wrist);

  // ── Palm body ──────────────────────────────────────────────────────────────
  const palm = mesh(new THREE.BoxGeometry(0.164, 0.116, 0.155), mat(SKIN));
  palm.position.set(0, 0.022, -0.008);
  g.add(palm);

  // ── 4 Fingers (3 segments each, curled into closed fist) ──────────────────
  [-0.062, -0.021, 0.021, 0.062].forEach(fx => {
    // Knuckle bump on back of hand
    const knk = mesh(new THREE.SphereGeometry(0.022, 6, 4), mat(CRSE));
    knk.position.set(fx, 0.074, -0.074); knk.scale.set(1, 0.72, 0.88);
    g.add(knk);

    // Proximal segment — angles slightly outward-forward
    const f1 = mesh(new THREE.BoxGeometry(0.028, 0.034, 0.060), mat(SKIN));
    f1.position.set(fx, 0.070, -0.104); f1.rotation.x = 0.38;
    g.add(f1);

    // Middle segment — curls under
    const f2 = mesh(new THREE.BoxGeometry(0.024, 0.030, 0.052), mat(CRSE));
    f2.position.set(fx, 0.036, -0.144); f2.rotation.x = 1.12;
    g.add(f2);

    // Distal / fingertip — tucked back under palm
    const f3 = mesh(new THREE.BoxGeometry(0.020, 0.026, 0.042), mat(CRSE));
    f3.position.set(fx, 0.000, -0.152); f3.rotation.x = 1.82;
    g.add(f3);

    // Tiny nail on proximal knuckle
    const nail = mesh(new THREE.BoxGeometry(0.016, 0.006, 0.020), mat(NAIL));
    nail.position.set(fx, 0.076, -0.082);
    g.add(nail);
  });

  // ── Thumb ─────────────────────────────────────────────────────────────────
  const tBase = mesh(new THREE.BoxGeometry(0.040, 0.072, 0.044), mat(SKIN));
  tBase.position.set(-0.110, 0.012, -0.044); tBase.rotation.set(0.08, 0.10, -0.34);
  g.add(tBase);

  const tTip = mesh(new THREE.BoxGeometry(0.034, 0.058, 0.038), mat(CRSE));
  tTip.position.set(-0.130, 0.018, -0.100); tTip.rotation.set(0.56, 0.12, -0.38);
  g.add(tTip);

  const tKnk = mesh(new THREE.SphereGeometry(0.022, 5, 4), mat(CRSE));
  tKnk.position.set(-0.118, 0.022, -0.065);
  g.add(tKnk);

  return g;
}
