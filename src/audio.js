// Procedural Web Audio API sounds — no external files required

let _ctx = null;

function ac() {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function osc(type, freq, vol, dur, freqEnd = null) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd !== null)
    o.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(c.destination);
  o.start(); o.stop(c.currentTime + dur);
}

function oscAt(type, freq, vol, dur, startAt) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, startAt);
  g.gain.setValueAtTime(vol, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
  o.connect(g); g.connect(c.destination);
  o.start(startAt); o.stop(startAt + dur);
}

// Sword/impact hit on enemy
export function playHit() {
  osc('sawtooth', 200, 0.28, 0.10, 70);
}

// Player takes damage
export function playHurt() {
  osc('triangle', 240, 0.32, 0.22, 58);
}

// Item pickup chime
export function playPickup() {
  const c = ac();
  [440, 600, 800].forEach((f, i) => oscAt('sine', f, 0.14, 0.20, c.currentTime + i * 0.06));
}

// Player death
export function playDeath() {
  osc('sawtooth', 110, 0.4, 1.4, 35);
  const c = ac();
  oscAt('triangle', 80, 0.2, 1.0, c.currentTime + 0.3);
}

// Soft footstep thud
export function playStep(sprinting) {
  const freq = 55 + Math.random() * 18;
  osc('sine', freq, sprinting ? 0.09 : 0.06, 0.07);
}

// Floor-descent staircase chime
export function playStairs() {
  const c = ac();
  [330, 440, 550, 660, 880].forEach((f, i) =>
    oscAt('sine', f, 0.13, 0.24, c.currentTime + i * 0.10)
  );
}

// Enemy death grunt
export function playEnemyDeath() {
  osc('sawtooth', 160, 0.18, 0.18, 40);
}

// Arrow thwack
export function playArrowHit() {
  osc('square', 320, 0.14, 0.08, 120);
}

// Magic bolt zap
export function playMagicShot() {
  const c = ac();
  osc('sine', 900, 0.20, 0.12, 300);
  oscAt('sawtooth', 600, 0.10, 0.18, c.currentTime + 0.04);
}

// Barrel splinter
export function playBarrelBreak() {
  osc('sawtooth', 80, 0.30, 0.18, 35);
  const c = ac();
  oscAt('square', 140, 0.12, 0.12, c.currentTime + 0.06);
}

// Poison tick hiss
export function playPoisonTick() {
  osc('sine', 420, 0.08, 0.14, 180);
}

// Elite enemy roar (low growl)
export function playEliteRoar() {
  osc('sawtooth', 90, 0.22, 0.40, 45);
}

// Boss encounter sting
export function playBossEncounter() {
  const c = ac();
  [55, 58, 62].forEach((f, i) =>
    oscAt('sawtooth', f, 0.25, 0.60, c.currentTime + i * 0.12)
  );
}

// Whoosh/swipe sound during melee swing — varies per weapon
export function playSwing(weaponId) {
  const c = ac();
  const t = c.currentTime;

  if (weaponId === 'rusty_dagger') {
    // Quick high-pitched swish via white noise + bandpass
    const buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(1200, t);
    flt.Q.setValueAtTime(0.5, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(flt); flt.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + 0.08);

  } else if (weaponId === 'bone_club') {
    // Heavy whoosh — triangle dropping in pitch
    osc('triangle', 180, 0.22, 0.15, 80);

  } else if (weaponId === 'iron_sword') {
    // Metallic swish: sawtooth through highpass filter
    const o = c.createOscillator();
    const flt = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, t);
    flt.type = 'highpass';
    flt.frequency.setValueAtTime(400, t);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(flt); flt.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.12);

  } else if (weaponId === 'dread_blade') {
    // Deep dramatic swoosh
    osc('triangle', 100, 0.28, 0.22, 60);

  } else if (weaponId === 'magic_staff') {
    // Soft hum rise — sine sweeping up
    osc('sine', 200, 0.12, 0.10, 400);

  } else {
    // Default / fist — short soft thud with sharp decay
    osc('sine', 90, 0.18, 0.06);
  }
}

// Looping ambient dungeon drone
let _ambientNodes = [];

export function startAmbient() {
  if (_ambientNodes.length > 0) return;
  const c = ac();
  [41, 55, 82].forEach(freq => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(0.025, c.currentTime);
    o.connect(g); g.connect(c.destination);
    o.start();
    _ambientNodes.push(o);
  });
}

export function stopAmbient() {
  _ambientNodes.forEach(node => node.stop());
  _ambientNodes = [];
}

// Projectile hitting a wall: short low thump
export function playImpactWall() {
  const c = ac();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.07);
}

// Critical hit — satisfying metallic ring
export function playCritical() {
  const c = ac();
  const t = c.currentTime;
  [[1100, 0.20], [1650, 0.10]].forEach(([freq, vol]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.35);
  });
}

// Burn status tick: short hiss
export function playBurn() {
  const c = ac();
  const t = c.currentTime;
  const dur = 0.08;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = 'bandpass';
  flt.frequency.setValueAtTime(3000, t);
  flt.Q.setValueAtTime(0.3, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.10, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur);
}

// Bleed tick: wet low pulse
export function playBleed() {
  const c = ac();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(80, t);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.05);
}

// Dodge/roll air rush: bandpass-filtered noise sweep
export function playDodge() {
  const c = ac();
  const t = c.currentTime;
  const dur = 0.12;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = 'bandpass';
  flt.frequency.setValueAtTime(800, t);
  flt.frequency.exponentialRampToValueAtTime(200, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(c.destination);
  src.start(t); src.stop(t + dur);
}

// Unpausing chime: 2 ascending soft tones
export function playResume() {
  const c = ac();
  const t = c.currentTime;
  oscAt('sine', 440, 0.08, 0.12, t);
  oscAt('sine', 660, 0.06, 0.12, t + 0.06);
}

// Level up — bright ascending arpeggio
export function playLevelUp() {
  const c = ac();
  const t = c.currentTime;
  [330, 440, 550, 660, 880, 1100].forEach((f, i) =>
    oscAt('sine', f, 0.16 - i * 0.015, 0.30, t + i * 0.07)
  );
}

// Floor cleared — short triumphant fanfare
export function playFloorClear() {
  const c = ac();
  const t = c.currentTime;
  [440, 550, 660, 880].forEach((f, i) =>
    oscAt('sine', f, 0.18, 0.32, t + i * 0.09)
  );
  oscAt('triangle', 660, 0.10, 0.45, t + 0.37);
}

// Champion kill — heavy power impact
export function playChampionKill() {
  const c = ac();
  osc('sawtooth', 110, 0.30, 0.30, 40);
  oscAt('sine', 440, 0.20, 0.25, c.currentTime + 0.08);
  oscAt('sine', 880, 0.12, 0.20, c.currentTime + 0.18);
}

// Potion drink — healing glug
export function playPotionDrink() {
  const c = ac();
  const t = c.currentTime;
  [600, 500, 420, 480].forEach((f, i) =>
    oscAt('sine', f, 0.14, 0.10, t + i * 0.06)
  );
}

// Heartbeat — low HP warning thud
export function playHeartbeat() {
  osc('sine', 52, 0.18, 0.10, 38);
}

// Status effect applied to player: eerie warble via LFO
export function playStatusApply() {
  const c = ac();
  const t = c.currentTime;
  const dur = 0.25;

  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(8, t);
  lfoGain.gain.setValueAtTime(40, t);
  lfo.connect(lfoGain);

  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(200, t);
  lfoGain.connect(o.frequency);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(c.destination);

  lfo.start(t); lfo.stop(t + dur);
  o.start(t); o.stop(t + dur);
}
