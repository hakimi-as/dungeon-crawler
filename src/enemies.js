import * as THREE  from 'https://unpkg.com/three@0.164.1/build/three.module.js';
import { astar, hasLOS } from './pathfinding.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const DETECT_R  = 9;
const ATTACK_R  = 1.3;
const ATTACK_CD = 1.5;
const PATH_CD   = 0.42;
const LOST_T    = 3.8;
const FLEE_HP   = 0.28;

const S_IDLE   = 0;
const S_CHASE  = 1;
const S_ATTACK = 2;
const S_FLEE   = 3;
const S_CHARGE = 4;

// ── Primitive helper ──────────────────────────────────────────────────────────
function box(w, h, d, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color })
  );
}

function isolateMaterials(group) {
  group.traverse(m => { if (m.isMesh) m.material = m.material.clone(); });
  return group;
}

// ── Mesh builders ─────────────────────────────────────────────────────────────
function buildGoblin() {
  const g = new THREE.Group();

  // Legs - slightly bent outward
  const legL = box(0.13, 0.36, 0.13, 0x1a4f1a);
  legL.position.set(-0.12, 0.19, 0); legL.rotation.z =  0.15; g.add(legL);
  const legR = box(0.13, 0.36, 0.13, 0x1a4f1a);
  legR.position.set( 0.12, 0.19, 0); legR.rotation.z = -0.15; g.add(legR);

  // Body - hunched, dark green
  const body = box(0.44, 0.46, 0.26, 0x1a4f1a); body.position.set(0, 0.60, 0); g.add(body);

  // Arms - stubby
  const armL = box(0.11, 0.34, 0.11, 0x1a4f1a); armL.position.set(-0.30, 0.60, 0); g.add(armL);
  const armR = box(0.11, 0.34, 0.11, 0x1a4f1a); armR.position.set( 0.30, 0.60, 0); g.add(armR);

  // Claw fists at end of arms
  const clawMat = new THREE.MeshLambertMaterial({ color: 0x143d14 });
  const clawL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), clawMat);
  clawL.position.set(-0.30, 0.41, 0); g.add(clawL);
  const clawR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), clawMat.clone());
  clawR.position.set( 0.30, 0.41, 0); g.add(clawR);

  // Oversized head - proportionally bigger
  const head = box(0.40, 0.37, 0.36, 0x2a6a2a); head.position.set(0, 1.02, 0); g.add(head);

  // Pointed ears (ConeGeometry)
  const earMat = new THREE.MeshLambertMaterial({ color: 0x2a6a2a });
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), earMat);
  earL.position.set(-0.24, 1.18, 0); earL.rotation.z =  0.45; g.add(earL);
  const earR = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), earMat.clone());
  earR.position.set( 0.24, 1.18, 0); earR.rotation.z = -0.45; g.add(earR);

  // Bulbous nose
  const noseMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 5, 4),
    new THREE.MeshLambertMaterial({ color: 0x1a4020 })
  );
  noseMesh.position.set(0, 1.02, 0.19); g.add(noseMesh);

  // Beady glowing red eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 3), eyeMat);
  eyeL.position.set(-0.09, 1.06, 0.19); g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 3), eyeMat.clone());
  eyeR.position.set( 0.09, 1.06, 0.19); g.add(eyeR);

  // Small jagged dagger in right hand
  const dagger = box(0.04, 0.18, 0.02, 0x8a7a5a);
  dagger.position.set(0.30, 0.52, 0.06); dagger.rotation.z = 0.3; g.add(dagger);

  g.userData.limbs = { legL, legR, armL, armR };
  return isolateMaterials(g);
}

function buildSkeleton() {
  const g = new THREE.Group();
  const B = 0xddd0a8;

  // Legs - thin bony
  const legL = box(0.09, 0.48, 0.09, B); legL.position.set(-0.11, 0.24, 0); g.add(legL);
  const legR = box(0.09, 0.48, 0.09, B); legR.position.set( 0.11, 0.24, 0); g.add(legR);

  // Knee joint spheres
  const kneeMat = new THREE.MeshLambertMaterial({ color: B });
  const kneeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), kneeMat);
  kneeL.position.set(-0.11, 0.24, 0); g.add(kneeL);
  const kneeR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), kneeMat.clone());
  kneeR.position.set( 0.11, 0.24, 0); g.add(kneeR);

  // Body - slim torso
  const body = box(0.38, 0.42, 0.16, B); body.position.set(0, 0.70, 0); g.add(body);

  // Ribcage detail - 4 thin ribs with alternating tilt
  for (let i = 0; i < 4; i++) {
    const rib = box(0.30, 0.025, 0.025, 0xaaa090);
    rib.position.set(0, 0.52 + i * 0.10, 0.08);
    rib.rotation.z = (i % 2 === 0) ? 0.08 : -0.08;
    g.add(rib);
  }

  // Arms
  const armL = box(0.07, 0.44, 0.07, B); armL.position.set(-0.26, 0.70, 0); g.add(armL);
  const armR = box(0.07, 0.44, 0.07, B); armR.position.set( 0.26, 0.70, 0); g.add(armR);

  // Shoulder joint spheres
  const shoulderMat = new THREE.MeshLambertMaterial({ color: B });
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.060, 5, 4), shoulderMat);
  shoulderL.position.set(-0.26, 0.94, 0); g.add(shoulderL);
  const shoulderR = new THREE.Mesh(new THREE.SphereGeometry(0.060, 5, 4), shoulderMat.clone());
  shoulderR.position.set( 0.26, 0.94, 0); g.add(shoulderR);

  // Skull - sphere for rounder head
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.20, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8e0c8 })
  );
  skull.position.set(0, 1.18, 0); g.add(skull);

  // Hollow eye sockets - dark spheres inset into skull face
  const socketMat = new THREE.MeshLambertMaterial({ color: 0x0a0808 });
  const sokL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), socketMat);
  sokL.position.set(-0.08, 1.20, 0.16); g.add(sokL);
  const sokR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 5, 4), socketMat.clone());
  sokR.position.set( 0.08, 1.20, 0.16); g.add(sokR);

  // Jaw
  const jaw = box(0.28, 0.08, 0.20, 0xe8e0c8); jaw.position.set(0, 0.98, 0.02); g.add(jaw);

  // Rusted sword in right hand
  const sword = box(0.03, 0.35, 0.01, 0x6a5a4a);
  sword.position.set(0.36, 0.60, 0.06); sword.rotation.z = -0.18; g.add(sword);

  g.userData.limbs = { legL, legR, armL, armR };
  return isolateMaterials(g);
}

function buildTroll() {
  const g = new THREE.Group();

  const BODY_COL = 0x3a4a2a;
  const DARK_COL = 0x2a3a1a;

  // Massive legs
  const legL = box(0.26, 0.52, 0.24, BODY_COL); legL.position.set(-0.20, 0.26, 0); g.add(legL);
  const legR = box(0.26, 0.52, 0.24, BODY_COL); legR.position.set( 0.20, 0.26, 0); g.add(legR);

  // Very wide body
  const body = box(0.90, 0.66, 0.44, BODY_COL); body.position.set(0, 0.87, 0); g.add(body);

  // Rocky bumps along back
  const bumpMat = new THREE.MeshLambertMaterial({ color: DARK_COL });
  for (let i = 0; i < 5; i++) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), bumpMat.clone());
    bump.position.set((i % 2 === 0 ? 0.05 : -0.05), 0.70 + i * 0.10, -0.22);
    g.add(bump);
  }

  // Long hanging arms - primary striking surface
  const armL = box(0.22, 0.64, 0.22, BODY_COL); armL.position.set(-0.60, 0.80, 0); g.add(armL);
  const armR = box(0.22, 0.64, 0.22, BODY_COL); armR.position.set( 0.60, 0.80, 0); g.add(armR);

  // Oversized fists
  const fistMat = new THREE.MeshLambertMaterial({ color: DARK_COL });
  const fistL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), fistMat);
  fistL.position.set(-0.60, 0.47, 0); g.add(fistL);
  const fistR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), fistMat.clone());
  fistR.position.set( 0.60, 0.47, 0); g.add(fistR);

  // Head - barely above body, short neck
  const head = box(0.54, 0.46, 0.48, 0x3a4a2a); head.position.set(0, 1.44, 0); g.add(head);

  // Tiny angry eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xcc2200, emissive: 0xcc2200, emissiveIntensity: 1.0 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), eyeMat);
  eyeL.position.set(-0.13, 1.50, 0.25); g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), eyeMat.clone());
  eyeR.position.set( 0.13, 1.50, 0.25); g.add(eyeR);

  // Massive hanging jaw
  const jaw = box(0.40, 0.14, 0.22, 0x323c22); jaw.position.set(0, 1.26, 0.06); g.add(jaw);

  // Two large irregular tusks from jaw
  const tuskMat = new THREE.MeshLambertMaterial({ color: 0xddddbb });
  const tuskL = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 4), tuskMat);
  tuskL.position.set(-0.12, 1.20, 0.18); tuskL.rotation.x = -0.60; tuskL.rotation.z =  0.28; g.add(tuskL);
  const tuskR = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 4), tuskMat.clone());
  tuskR.position.set( 0.12, 1.20, 0.18); tuskR.rotation.x = -0.60; tuskR.rotation.z = -0.28; g.add(tuskR);

  g.userData.limbs = { legL, legR, armL, armR };
  return isolateMaterials(g);
}

function buildWarden() {
  const g = new THREE.Group();
  const METAL  = 0x222233;
  const ARMOR  = 0x334466;
  const GLOW   = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2.5 });

  const legL = box(0.24, 0.56, 0.24, METAL); legL.position.set(-0.20, 0.28, 0); g.add(legL);
  const legR = box(0.24, 0.56, 0.24, METAL); legR.position.set( 0.20, 0.28, 0); g.add(legR);

  const body  = box(0.70, 0.68, 0.38, ARMOR); body.position.set(0, 0.90, 0); g.add(body);
  const plate = box(0.54, 0.54, 0.44, METAL); plate.position.set(0, 0.90, 0); g.add(plate);

  // Glowing rune lines on chest plate
  const runeMat = new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 0.8 });
  for (let i = 0; i < 3; i++) {
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.018, 0.45), runeMat.clone());
    rune.position.set(0, 0.72 + i * 0.14, 0); g.add(rune);
  }

  // Cape behind body
  const cape = box(0.62, 0.72, 0.04, 0x111118);
  cape.position.set(0, 0.86, -0.22); cape.rotation.x = 0.10; g.add(cape);

  // Layered shoulder pauldrons
  const paulL_base = box(0.34, 0.14, 0.34, METAL); paulL_base.position.set(-0.52, 1.14, 0); g.add(paulL_base);
  const paulL_top  = box(0.22, 0.10, 0.22, ARMOR);  paulL_top.position.set(-0.52, 1.26, 0);  g.add(paulL_top);
  const paulR_base = box(0.34, 0.14, 0.34, METAL); paulR_base.position.set( 0.52, 1.14, 0); g.add(paulR_base);
  const paulR_top  = box(0.22, 0.10, 0.22, ARMOR);  paulR_top.position.set( 0.52, 1.26, 0);  g.add(paulR_top);

  const armL = box(0.22, 0.58, 0.22, ARMOR); armL.position.set(-0.50, 0.82, 0); g.add(armL);
  const armR = box(0.22, 0.58, 0.22, ARMOR); armR.position.set( 0.50, 0.82, 0); g.add(armR);

  const helm  = box(0.52, 0.44, 0.48, METAL); helm.position.set(0, 1.50, 0); g.add(helm);
  const visor = box(0.42, 0.09, 0.50, 0x000000); visor.position.set(0, 1.52, 0); g.add(visor);

  // Glowing red eyes (existing)
  const eyeMatL = GLOW.clone(); const eyeMatR = GLOW.clone();
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.02), eyeMatL);
  eyeL.position.set(-0.10, 1.52, 0.25); g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.02), eyeMatR);
  eyeR.position.set( 0.10, 1.52, 0.25); g.add(eyeR);

  // Horns (existing)
  const hornGeo = new THREE.ConeGeometry(0.060, 0.34, 6);
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x110011 });
  const hornL = new THREE.Mesh(hornGeo, hornMat);
  hornL.position.set(-0.18, 1.84, 0); hornL.rotation.z =  0.32; g.add(hornL);
  const hornR = new THREE.Mesh(hornGeo, hornMat.clone());
  hornR.position.set( 0.18, 1.84, 0); hornR.rotation.z = -0.32; g.add(hornR);

  // Haft
  const haft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.040, 0.040, 1.0, 6),
    new THREE.MeshLambertMaterial({ color: 0x5c3318 })
  );
  haft.position.set(0.64, 0.64, 0.10); haft.rotation.z = -0.25; g.add(haft);

  // Larger, more dramatic axe head
  const axeHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.48, 0.08),
    new THREE.MeshLambertMaterial({ color: METAL })
  );
  axeHead.position.set(0.84, 1.18, 0.10); g.add(axeHead);

  // Glowing blade edge
  const axeEdge = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.44, 0.10),
    new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 1.8 })
  );
  axeEdge.position.set(0.99, 1.18, 0.10); g.add(axeEdge);

  // Top spike on haft
  const axeSpike = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.20, 4),
    new THREE.MeshLambertMaterial({ color: METAL })
  );
  axeSpike.position.set(0.52, 1.18, 0.10); axeSpike.rotation.z = -0.25; g.add(axeSpike);

  g.userData.limbs = { legL, legR, armL, armR };
  return isolateMaterials(g);
}

function buildArcher() {
  const g = buildSkeleton(); // userData.limbs already set inside buildSkeleton

  // Curved bow arc using TorusGeometry
  const bowArc = new THREE.Mesh(
    new THREE.TorusGeometry(0.22, 0.012, 4, 8, Math.PI),
    new THREE.MeshLambertMaterial({ color: 0x8B6914 })
  );
  bowArc.position.set(-0.40, 0.82, 0.12);
  bowArc.rotation.y = Math.PI / 2; // face forward
  bowArc.rotation.z = Math.PI / 2; // arc opens sideways
  g.add(bowArc);

  // Bowstring
  const bowString = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 0.52, 3),
    new THREE.MeshLambertMaterial({ color: 0xccccaa })
  );
  bowString.position.set(-0.40, 0.82, 0.12); g.add(bowString);

  // Nocked arrow across bow center
  const arrow = box(0.006, 0.24, 0.006, 0x8B6914);
  arrow.position.set(-0.40, 0.82, 0.12); g.add(arrow);

  // Quiver on back
  const quiver = new THREE.Mesh(
    new THREE.CylinderGeometry(0.040, 0.040, 0.30, 7),
    new THREE.MeshLambertMaterial({ color: 0x7a4a1a })
  );
  quiver.position.set(0.18, 0.90, -0.14); quiver.rotation.z = 0.22; g.add(quiver);

  // Arrow stubs poking from quiver
  const arrowMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  [-0.03, 0.0, 0.03].forEach((offset, i) => {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.12, 0.006), arrowMat.clone());
    stub.position.set(0.17 + offset, 1.06, -0.14 - i * 0.01);
    stub.rotation.z = 0.22;
    g.add(stub);
  });

  return isolateMaterials(g);
}

function buildWraith() {
  const g = new THREE.Group();

  // Wispy shroud skirt at bottom (inverted cone)
  const shroudMat = new THREE.MeshLambertMaterial({ color: 0x220033, transparent: true, opacity: 0.7 });
  const shroud = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.50, 8), shroudMat);
  shroud.position.set(0, 0.25, 0); shroud.rotation.x = Math.PI; g.add(shroud);

  // Wispy tendrils pointing downward
  const tendrilMat = new THREE.MeshLambertMaterial({ color: 0x220033, transparent: true, opacity: 0.7 });
  [[-0.14, -0.20], [0.0, -0.28], [0.14, -0.20]].forEach(([tx, tz], i) => {
    const tendril = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.35, 4), tendrilMat.clone());
    tendril.position.set(tx, 0.04, tz);
    tendril.rotation.x = Math.PI; tendril.rotation.z = (i - 1) * 0.18;
    g.add(tendril);
  });

  // Torso
  const torso = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x2a0040, transparent: true, opacity: 0.75 })
  );
  torso.position.set(0, 0.68, 0); g.add(torso);

  // Flowing arm tendrils (taper to point)
  const armLMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.01, 0.44, 5),
    new THREE.MeshLambertMaterial({ color: 0x2a0040, transparent: true, opacity: 0.75 })
  );
  armLMesh.position.set(-0.38, 0.68, 0); armLMesh.rotation.z =  1.1; g.add(armLMesh);
  const armRMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.01, 0.44, 5),
    new THREE.MeshLambertMaterial({ color: 0x2a0040, transparent: true, opacity: 0.75 })
  );
  armRMesh.position.set( 0.38, 0.68, 0); armRMesh.rotation.z = -1.1; g.add(armRMesh);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.20, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x1a0030, transparent: true, opacity: 0.8 })
  );
  head.position.set(0, 1.06, 0); g.add(head);

  // Hollow face void
  const voidMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 6, 4),
    new THREE.MeshLambertMaterial({ color: 0x000000 })
  );
  voidMesh.position.set(0, 1.06, 0.14); g.add(voidMesh);

  // Glowing cyan eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 4.0 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.040, 5, 4), eyeMat);
  eyeL.position.set(-0.07, 1.10, 0.16); g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.040, 5, 4), eyeMat.clone());
  eyeR.position.set( 0.07, 1.10, 0.16); g.add(eyeR);

  // Orbiting glowing particles at mid-body
  const particleMat = new THREE.MeshLambertMaterial({ color: 0xaa00ff, emissive: 0xaa00ff, emissiveIntensity: 3.0 });
  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2;
    const particle = new THREE.Mesh(new THREE.OctahedronGeometry(0.030, 0), particleMat.clone());
    particle.position.set(Math.cos(angle) * 0.30, 0.68, Math.sin(angle) * 0.30);
    g.add(particle);
  }

  // userData.limbs: use arm tendrils as armL/armR, shroud/first tendril as legL/legR (won't animate significantly)
  g.userData.limbs = { legL: shroud, legR: g.children[1], armL: armLMesh, armR: armRMesh };
  return isolateMaterials(g);
}

function buildBrute() {
  const g = new THREE.Group();
  const BODY_COL = 0x1a1a1a;
  const SKIN_COL = 0x2a2a2a;

  // Massive legs
  const legL = box(0.26, 0.52, 0.24, BODY_COL); legL.position.set(-0.22, 0.26, 0); g.add(legL);
  const legR = box(0.26, 0.52, 0.24, BODY_COL); legR.position.set( 0.22, 0.26, 0); g.add(legR);

  // Extremely wide body
  const body = box(0.90, 0.60, 0.50, BODY_COL); body.position.set(0, 0.82, 0); g.add(body);

  // HUGE shoulder pads with spikes
  const shoulderMat = new THREE.MeshLambertMaterial({ color: SKIN_COL });
  const shoulderSpikeMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  [-1, 1].forEach(side => {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.36), shoulderMat.clone());
    sh.position.set(side * 0.60, 1.06, 0); g.add(sh);
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.20, 4), shoulderSpikeMat.clone());
    sp.position.set(side * 0.60, 1.26, 0); g.add(sp);
  });

  // Very thick long arms
  const armL = box(0.26, 0.60, 0.26, BODY_COL); armL.position.set(-0.62, 0.74, 0); g.add(armL);
  const armR = box(0.26, 0.60, 0.26, BODY_COL); armR.position.set( 0.62, 0.74, 0); g.add(armR);

  // Massive fists
  const fistMat = new THREE.MeshLambertMaterial({ color: SKIN_COL });
  const fistL = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), fistMat);
  fistL.position.set(-0.62, 0.43, 0); g.add(fistL);
  const fistR = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), fistMat.clone());
  fistR.position.set( 0.62, 0.43, 0); g.add(fistR);

  // Iron shackle rings around wrists
  const shackleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  [-0.62, 0.62].forEach(sx => {
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 5, 8), shackleMat.clone());
    shackle.position.set(sx, 0.44, 0); shackle.rotation.x = Math.PI / 2; g.add(shackle);
  });

  // Chain links hanging from each shackle
  const chainMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
  [-0.62, 0.62].forEach(sx => {
    for (let c = 0; c < 4; c++) {
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.06), chainMat.clone());
      chain.position.set(sx + (c % 2 === 0 ? 0.04 : -0.04), 0.34 - c * 0.06, 0.05);
      chain.rotation.z = (c % 2) * Math.PI / 2;
      g.add(chain);
    }
  });

  // Tiny head (no neck)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  head.position.set(0, 1.26, 0); g.add(head);

  // Deep-set red eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xcc2200, emissive: 0xcc2200, emissiveIntensity: 1.2 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), eyeMat);
  eyeL.position.set(-0.08, 1.30, 0.18); g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), eyeMat.clone());
  eyeR.position.set( 0.08, 1.30, 0.18); g.add(eyeR);

  // Rocky skin texture bumps on shoulders and back
  const bumpMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const bumpPositions = [
    [-0.55, 1.14, -0.14], [0.55, 1.14, -0.14],
    [-0.40, 0.96, -0.24], [0.40, 0.96, -0.24],
    [-0.20, 0.88, -0.26], [0.20, 0.88, -0.26],
    [0.0,  1.02, -0.27],  [0.0,  0.78, -0.26],
  ];
  bumpPositions.forEach(([bx, by, bz]) => {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), bumpMat.clone());
    bump.position.set(bx, by, bz); g.add(bump);
  });

  g.userData.limbs = { legL, legR, armL, armR };
  return isolateMaterials(g);
}

function buildMage() {
  const g = buildSkeleton();

  // Recolor skeleton parts to dark purple
  g.traverse(m => {
    if (!m.isMesh) return;
    m.material = m.material.clone();
    m.material.color.setHex(0x220033);
    m.material.emissive.setHex(0x440066);
    m.material.emissiveIntensity = 0.5;
  });

  // Robe skirt over lower body
  const robe = box(0.48, 0.60, 0.32, 0x220033);
  robe.position.set(0, 0.36, 0); g.add(robe);
  const robeHem = box(0.52, 0.06, 0.36, 0x1a0028);
  robeHem.position.set(0, 0.06, 0); g.add(robeHem);

  // Glowing arcane circle under feet
  const circleMat = new THREE.MeshLambertMaterial({ color: 0x00aaff, emissive: 0x00aaff, emissiveIntensity: 2.5 });
  const circle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 4, 12), circleMat);
  circle.position.set(0, 0.02, 0); circle.rotation.x = Math.PI / 2; g.add(circle);

  // Glowing magenta eyes (replace skeleton's dark eye sockets)
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff00cc, emissive: 0xff00cc, emissiveIntensity: 3.5 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.040, 5, 4), eyeMat);
  eyeL.position.set(-0.08, 1.20, 0.17); g.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.040, 5, 4), eyeMat.clone());
  eyeR.position.set( 0.08, 1.20, 0.17); g.add(eyeR);

  // Staff shaft - dark wood
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.020, 0.020, 0.70, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a2010 })
  );
  shaft.position.set(-0.34, 0.72, 0.10); shaft.rotation.z = 0.15; g.add(shaft);

  // Shaft rings
  const ringMat = new THREE.MeshLambertMaterial({ color: 0xb08030 });
  [0.44, 0.70, 0.96].forEach(ry => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.018, 7), ringMat.clone());
    ring.position.set(-0.36 + (ry - 0.70) * 0.038, ry, 0.10); ring.rotation.z = 0.15;
    g.add(ring);
  });

  // Crystal top - OctahedronGeometry
  const crystalMat = new THREE.MeshLambertMaterial({ color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 3.5 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 0), crystalMat);
  crystal.position.set(-0.27, 1.11, 0.10); g.add(crystal);

  // Crystal orbits (3 smaller octahedra)
  const orbitMat = new THREE.MeshLambertMaterial({ color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 3.5 });
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2;
    const oc = new THREE.Mesh(new THREE.OctahedronGeometry(0.040, 0), orbitMat.clone());
    oc.position.set(-0.27 + Math.cos(angle) * 0.14, 1.11, 0.10 + Math.sin(angle) * 0.14);
    g.add(oc);
  }

  // Floating runes around chest
  const runeMat = new THREE.MeshLambertMaterial({ color: 0xaa00ff, emissive: 0xaa00ff, emissiveIntensity: 2.0 });
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.008), runeMat.clone());
    rune.position.set(Math.cos(angle) * 0.30, 0.82, Math.sin(angle) * 0.30);
    rune.rotation.y = angle; rune.rotation.x = 0.20;
    g.add(rune);
  }

  return isolateMaterials(g);
}

function buildSpider() {
  const g = new THREE.Group();

  // THREE body segments
  // Rear abdomen - largest
  const abd = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x110811 })
  );
  abd.position.set(0, 0.26, -0.22); g.add(abd);

  // Mid section - connecting piece
  const mid = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x160d16 })
  );
  mid.position.set(0, 0.24, 0.02); g.add(mid);

  // Head / cephalothorax - forward
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 7, 5),
    new THREE.MeshLambertMaterial({ color: 0x1a0a1a })
  );
  head.position.set(0, 0.26, 0.20); g.add(head);

  // Eye cluster - 6 tiny glowing red eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 2.5 });
  const eyePositions = [
    [-0.06, 0.30, 0.33], [0.06, 0.30, 0.33],
    [-0.03, 0.27, 0.34], [0.03, 0.27, 0.34],
    [-0.08, 0.27, 0.32], [0.08, 0.27, 0.32],
  ];
  eyePositions.forEach(([ex, ey, ez]) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 4, 3), eyeMat.clone());
    eye.position.set(ex, ey, ez); g.add(eye);
  });

  // Fangs/chelicerae
  const fangMat = new THREE.MeshLambertMaterial({ color: 0x220011 });
  const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.10, 4), fangMat);
  fangL.position.set(-0.05, 0.18, 0.30); fangL.rotation.x = -0.80; g.add(fangL);
  const fangR = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.10, 4), fangMat.clone());
  fangR.position.set( 0.05, 0.18, 0.30); fangR.rotation.x = -0.80; g.add(fangR);

  // 8 legs with knee joints (4 per side)
  const spiderLegs = [];
  const legMat = new THREE.MeshLambertMaterial({ color: 0x0d060d });
  const kneeMat = new THREE.MeshLambertMaterial({ color: 0x150a15 });

  for (let i = 0; i < 4; i++) {
    [-1, 1].forEach(side => {
      const legGroup = new THREE.Group();
      const zOffset = (i - 1.5) * 0.10 - 0.02;
      legGroup.position.set(side * 0.16, 0.22, zOffset);
      g.add(legGroup);

      // Upper leg segment - angled outward and up
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.025, 0.16),
        legMat.clone()
      );
      upper.position.set(side * 0.10, 0.04, 0);
      upper.rotation.z = side * 0.80;
      upper.rotation.y = (i - 1.5) * 0.22;
      legGroup.add(upper);

      // Knee joint sphere
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.030, 4, 3), kneeMat.clone());
      knee.position.set(side * 0.20, 0.04, (i - 1.5) * 0.022);
      knee.rotation.z = side * 0.80;
      legGroup.add(knee);

      // Lower leg - angled outward and down
      const lower = new THREE.Mesh(
        new THREE.BoxGeometry(0.020, 0.020, 0.14),
        legMat.clone()
      );
      lower.position.set(side * 0.28, -0.06, (i - 1.5) * 0.022);
      lower.rotation.z = side * 0.60;
      lower.rotation.y = (i - 1.5) * 0.22;
      legGroup.add(lower);

      // Animate using lower segment, store with side/idx
      spiderLegs.push({ leg: lower, side, idx: i });
    });
  }

  g.userData.spiderLegs = spiderLegs;
  return isolateMaterials(g);
}

const BUILDERS = {
  goblin: buildGoblin, skeleton: buildSkeleton, troll: buildTroll,
  warden: buildWarden, archer: buildArcher,      spider: buildSpider,
  wraith: buildWraith, brute: buildBrute,        mage: buildMage,
};

// ── Stat definitions ──────────────────────────────────────────────────────────
const DEFS = {
  goblin:   { hp: 10,  attack: 3,  defense: 0, speed: 1.7,  xp: 8,   atkR: 1.3, ranged: false, poison: false },
  skeleton: { hp: 18,  attack: 5,  defense: 1, speed: 1.1,  xp: 15,  atkR: 1.3, ranged: false, poison: false },
  troll:    { hp: 35,  attack: 8,  defense: 2, speed: 0.8,  xp: 30,  atkR: 1.6, ranged: false, poison: false },
  archer:   { hp: 12,  attack: 6,  defense: 0, speed: 1.4,  xp: 20,  atkR: 8.0, ranged: true,  poison: false },
  spider:   { hp: 8,   attack: 4,  defense: 0, speed: 2.0,  xp: 12,  atkR: 1.1, ranged: false, poison: true  },
  warden:   { hp: 200, attack: 16, defense: 5, speed: 1.0,  xp: 300, atkR: 2.0, ranged: false, poison: false },
  wraith:   { hp: 14,  attack: 5,  defense: 0, speed: 2.4,  xp: 22,  atkR: 1.2, ranged: false, poison: false },
  brute:    { hp: 65,  attack: 13, defense: 4, speed: 0.62, xp: 55,  atkR: 1.9, ranged: false, poison: false },
  mage:     { hp: 18,  attack: 8,  defense: 0, speed: 0.95, xp: 28,  atkR: 7.5, ranged: true,  poison: false },
};

// ── Enemy class ───────────────────────────────────────────────────────────────
export class Enemy {
  constructor(scene, x, z, type = 'goblin', scale = 1) {
    const def    = DEFS[type] ?? DEFS.goblin;
    this.type    = (type in DEFS) ? type : 'goblin';
    this.x       = x;
    this.z       = z;
    this.hp      = Math.round(def.hp * scale);
    this.maxHp   = Math.round(def.hp * scale);
    this.atk     = Math.round(def.attack * scale);
    this.def     = def.defense;
    this.speed   = def.speed;
    this.xpValue = def.xp;
    this.atkRange = def.atkR;
    this.isRanged = def.ranged;
    this.isPoison = def.poison;
    this.dead    = false;
    this._pendingProj = null;

    this._atkT   = Math.random() * ATTACK_CD;
    this._bob    = Math.random() * Math.PI * 2;

    this._state  = S_IDLE;
    this._path   = [];
    this._pathT  = Math.random() * PATH_CD;
    this._lostT  = 0;

    this._scanT  = Math.random() * Math.PI * 2;

    // Animation state
    this._walkPhase = Math.random() * Math.PI * 2;
    this._isMoving  = false;
    this._hitTimer  = 0;   // counts down from 0.20 → stagger bump
    this._atkAnim   = 0;   // counts down from 0.35 → arm swing

    // Death animation
    this._deathTimer = 0;

    // Patrol behavior
    this._patrolTarget = null;
    this._patrolWait   = 0;

    // Wraith wall-phasing
    this.isPhasing = (type === 'wraith');

    // Brute charge ability
    this._chargeTarget   = null;
    this._chargeDur      = 0;
    this._chargeCooldown = 0;

    // Boss enrage (phase 2 at 40% HP)
    this._enraged      = false;
    this._justEnraged  = false;

    // Freeze status
    this._frozenTimer  = 0;

    // Champion flag (set externally by spawnEnemies)
    this.isChampion    = false;

    this.mesh = (BUILDERS[type] ?? buildGoblin)();
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);

    this.isElite = false;
    if (type !== 'warden' && Math.random() < 0.10) this._makeElite();

    this._bar = document.createElement('div');
    this._bar.className = 'enemy-hpbar';
    this._bar.innerHTML = '<div class="enemy-hpbar-fill"></div>';
    document.getElementById('enemy-bars').appendChild(this._bar);
    this._fill = this._bar.querySelector('.enemy-hpbar-fill');
  }

  update(dt, player, world, blocked) {
    if (this.dead) {
      if (this._deathTimer > 0) {
        this._deathTimer -= dt;
        const t = Math.max(0, this._deathTimer / 0.4);
        this.mesh.scale.setScalar((this.isElite ? 1.22 : 1.0) * (0.2 + t * 0.8));
        this.mesh.traverse(m => {
          if (!m.isMesh) return;
          m.material.transparent = true;
          m.material.opacity = t;
        });
        if (this._deathTimer <= 0) {
          this.mesh.parent?.remove(this.mesh);
        }
      }
      return null;
    }

    // ── Freeze: enemy is immobilised but still visible ───────────────────────
    if (this._frozenTimer > 0) {
      this._frozenTimer -= dt;
      this._bob += dt * 2.2;
      const hitBump = this._hitTimer > 0 ? Math.sin((1 - this._hitTimer / 0.20) * Math.PI) * 0.12 : 0;
      this.mesh.position.set(this.x, Math.sin(this._bob) * 0.03 + hitBump, this.z);
      if (this._frozenTimer <= 0) {
        // Unfreeze: reset emissive back to normal
        this.mesh.traverse(m => {
          if (!m.isMesh) return;
          m.material.emissive.setHex(0x000000);
          m.material.emissiveIntensity = 0;
        });
      }
      return null;  // can't attack or move while frozen
    }

    // ── Boss enrage at 40% HP (phase 2) ──────────────────────────────────────
    if (this.type === 'warden' && !this._enraged && this.hp / this.maxHp < 0.40) {
      this._enraged     = true;
      this._justEnraged = true;
      this.speed       *= 1.45;
      this._chargeCooldown = 0;
      this.mesh.traverse(m => {
        if (!m.isMesh) return;
        m.material.emissive.setHex(0xff1100);
        m.material.emissiveIntensity = 1.0;
      });
    }

    this._atkT   = Math.max(0, this._atkT - dt);
    this._pathT  = Math.max(0, this._pathT - dt);
    this._bob   += dt * 2.2;
    if (this._chargeCooldown > 0) this._chargeCooldown -= dt;

    const dx   = player.x - this.x;
    const dz   = player.z - this.z;
    const dist = Math.hypot(dx, dz);

    const canSee = dist < DETECT_R && hasLOS(world, this.x, this.z, player.x, player.z);

    const shouldFlee = this.isRanged
      ? (dist < 2.5 && canSee)
      : (this.hp / this.maxHp < FLEE_HP);

    if (shouldFlee) {
      if (this._state !== S_FLEE) { this._state = S_FLEE; this._path = []; }
    } else if (dist <= this.atkRange && (canSee || !this.isRanged)) {
      // Ranged enemies must have LOS to enter attack state; melee don't need it at contact range
      this._state = S_ATTACK;
      this._lostT = 0;
    } else if (canSee) {
      this._state = S_CHASE;
      this._lostT = 0;
    } else if (this._state === S_CHASE || this._state === S_ATTACK) {
      this._lostT += dt;
      if (this._lostT > LOST_T) {
        this._state = S_IDLE;
        this._path  = [];
        this._lostT = 0;
        this._patrolTarget = null;
      }
    }

    // Save position to detect movement this frame
    const preX = this.x, preZ = this.z;

    switch (this._state) {

      case S_CHASE:
      case S_FLEE: {
        if (this._pathT <= 0) {
          this._pathT = PATH_CD;
          if (this._state === S_CHASE) {
            this._path = astar(world, this.x, this.z, player.x, player.z) ?? [];
          } else {
            const fNorm = dist > 0 ? 1 / dist : 0;
            const fleeX = this.x - dx * fNorm * 7;
            const fleeZ = this.z - dz * fNorm * 7;
            this._path = astar(world, this.x, this.z, fleeX, fleeZ) ?? [];
          }
        }

        const spd = this._state === S_FLEE ? this.speed * 1.45 : this.speed;

        if (this._path.length > 0) {
          const wp   = this._path[0];
          const wpDx = (wp.x + 0.5) - this.x;
          const wpDz = (wp.z + 0.5) - this.z;
          const wpD  = Math.hypot(wpDx, wpDz);

          if (wpD < 0.3) {
            this._path.shift();
          } else {
            const nx = this.x + (wpDx / wpD) * spd * dt;
            const nz = this.z + (wpDz / wpD) * spd * dt;
            if (this.isPhasing) {
              this.x += (wpDx / wpD) * spd * dt;
              this.z += (wpDz / wpD) * spd * dt;
            } else {
              if (!blocked(nx, this.z)) this.x = nx;
              if (!blocked(this.x, nz)) this.z = nz;
            }
            this.mesh.rotation.y = Math.atan2(wpDx, wpDz);
          }
        } else if (this._state === S_CHASE && dist > 0.1) {
          const nx = this.x + (dx / dist) * spd * dt;
          const nz = this.z + (dz / dist) * spd * dt;
          if (this.isPhasing) {
            this.x += (dx / dist) * spd * dt;
            this.z += (dz / dist) * spd * dt;
          } else {
            if (!blocked(nx, this.z)) this.x = nx;
            if (!blocked(this.x, nz)) this.z = nz;
          }
          this.mesh.rotation.y = Math.atan2(dx, dz);
        }
        break;
      }

      case S_ATTACK:
        this.mesh.rotation.y = Math.atan2(dx, dz);
        if (this.isRanged && this._atkT <= 0 && canSee) {
          this._atkT = ATTACK_CD * 1.6;
          const norm = Math.hypot(dx, dz);
          this._pendingProj = {
            x: this.x, z: this.z,
            dx: dx / norm, dz: dz / norm,
            dmg: this.atk,
            magic: this.type === 'mage',
          };
          return null;
        }
        if (this.type === 'brute' && this._chargeCooldown <= 0 && dist > 2.5) {
          this._chargeTarget  = { x: player.x, z: player.z };
          this._chargeDur     = 0.55;
          this._chargeCooldown = 5.0;
          this._state = S_CHARGE;
        }
        break;

      case S_IDLE: {
        this._scanT += dt * 0.6; // keep for fallback
        if (this._patrolWait > 0) {
          this._patrolWait -= dt;
          this.mesh.rotation.y = Math.sin(this._scanT) * 0.8; // gentle idle sway
          break;
        }
        if (!this._patrolTarget) {
          // Pick a new patrol point 2-5 tiles away
          const angle = Math.random() * Math.PI * 2;
          const dist  = 2 + Math.random() * 3;
          this._patrolTarget = { x: this.x + Math.cos(angle) * dist, z: this.z + Math.sin(angle) * dist };
        }
        const pdx  = this._patrolTarget.x - this.x;
        const pdz  = this._patrolTarget.z - this.z;
        const pdist = Math.hypot(pdx, pdz);
        if (pdist < 0.35) {
          this._patrolTarget = null;
          this._patrolWait   = 1.2 + Math.random() * 1.0;
        } else {
          const spd = this.speed * 0.38;
          const nx  = this.x + (pdx / pdist) * spd * dt;
          const nz  = this.z + (pdz / pdist) * spd * dt;
          if (!blocked(nx, this.z)) this.x = nx;
          if (!blocked(this.x, nz)) this.z = nz;
          this.mesh.rotation.y = Math.atan2(pdx, pdz);
        }
        break;
      }

      case S_CHARGE: {
        this._chargeDur -= dt;
        if (this._chargeTarget && this._chargeDur > 0) {
          const cdx = this._chargeTarget.x - this.x;
          const cdz = this._chargeTarget.z - this.z;
          const cd  = Math.hypot(cdx, cdz);
          if (cd > 0.25) {
            const nx = this.x + (cdx / cd) * this.speed * 4.5 * dt;
            const nz = this.z + (cdz / cd) * this.speed * 4.5 * dt;
            const movedX = !blocked(nx, this.z);
            const movedZ = !blocked(this.x, nz);
            if (movedX) this.x = nx;
            if (movedZ) this.z = nz;
            if (!movedX && !movedZ) { this._state = S_CHASE; this._chargeTarget = null; }
            this.mesh.rotation.y = Math.atan2(cdx, cdz);
          }
        }
        if (this._chargeDur <= 0 || Math.hypot(player.x - this.x, player.z - this.z) < 0.6) {
          this._state = S_CHASE;
          this._chargeTarget = null;
        }
        break;
      }
    }

    this._isMoving = (this.x !== preX || this.z !== preZ);

    // Decrement animation timers
    if (this._hitTimer > 0) this._hitTimer = Math.max(0, this._hitTimer - dt);
    if (this._atkAnim  > 0) this._atkAnim  = Math.max(0, this._atkAnim  - dt);

    // Position with hit-stagger bump (sine arc peaks midway through timer)
    const hitBump = this._hitTimer > 0
      ? Math.sin((1 - this._hitTimer / 0.20) * Math.PI) * 0.12
      : 0;
    this.mesh.position.set(this.x, Math.sin(this._bob) * 0.03 + hitBump, this.z);

    // ── Biped limb animation ─────────────────────────────────────────────────
    const limbs = this.mesh.userData.limbs;
    if (limbs) {
      if (this._isMoving) this._walkPhase += dt * this.speed * 5.5;

      // Arms: attack swing takes priority over walk swing
      if (this._atkAnim > 0) {
        const t    = 1 - this._atkAnim / 0.35;
        const aSw  = Math.sin(t * Math.PI) * -1.05;
        limbs.armL.rotation.x = aSw;
        limbs.armR.rotation.x = aSw;
      } else if (this._isMoving) {
        limbs.armL.rotation.x = -Math.sin(this._walkPhase) * 0.38;
        limbs.armR.rotation.x =  Math.sin(this._walkPhase) * 0.38;
      } else {
        limbs.armL.rotation.x *= 0.78;
        limbs.armR.rotation.x *= 0.78;
      }

      // Legs always follow walk or damp to rest
      if (this._isMoving) {
        limbs.legL.rotation.x =  Math.sin(this._walkPhase) * 0.42;
        limbs.legR.rotation.x = -Math.sin(this._walkPhase) * 0.42;
      } else {
        limbs.legL.rotation.x *= 0.78;
        limbs.legR.rotation.x *= 0.78;
      }
    }

    // ── Spider leg wave animation ─────────────────────────────────────────────
    const spiderLegs = this.mesh.userData.spiderLegs;
    if (spiderLegs) {
      if (this._isMoving) this._walkPhase += dt * this.speed * 9;
      spiderLegs.forEach(({ leg, side, idx }) => {
        const wave = Math.sin(this._walkPhase + idx * 1.4 + (side < 0 ? Math.PI : 0)) * 0.28;
        leg.rotation.z = side * (0.62 + wave);
      });
    }

    // ── Melee attack ──────────────────────────────────────────────────────────
    if ((this._state === S_ATTACK || this._state === S_CHARGE) && this._atkT <= 0) {
      this._atkT    = ATTACK_CD;
      this._atkAnim = 0.35;
      return Math.max(1, this.atk - player.defense + randInt(-1, 1));
    }
    return null;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._flash();
    this._hitTimer = 0.20;
    if (this.hp <= 0) this._die();
  }

  _flash() {
    this.mesh.traverse(m => {
      if (!m.isMesh) return;
      m.material.emissive.setHex(0xcc1111);
    });
    setTimeout(() => {
      // Always reset — if enemy died mid-flash the emissive would otherwise stay red
      this.mesh.traverse(m => {
        if (!m.isMesh) return;
        m.material.emissive.setHex(0x000000);
      });
    }, 140);
  }

  _die() {
    this.dead = true;
    this._bar.remove();
    this._deathTimer = 0.4;
  }

  _makeElite() {
    this.isElite  = true;
    this.hp       = Math.round(this.hp * 1.6);
    this.maxHp    = this.hp;
    this.atk      = Math.round(this.atk * 1.4);
    this.xpValue  = Math.round(this.xpValue * 2.2);
    this.mesh.scale.setScalar(1.22);
    this.mesh.traverse(m => {
      if (!m.isMesh) return;
      m.material.emissive.setHex(0x996600);
      m.material.emissiveIntensity = 0.35;
    });

    // Crown: 4 golden spike cones arranged in a circle at the top
    const crownY = { goblin: 1.30, skeleton: 1.45, troll: 1.75, warden: 1.95, archer: 1.45, spider: 0.50, wraith: 1.45, brute: 1.75, mage: 1.45 }[this.type] ?? 1.40;
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xffd060, emissive: 0xffd060, emissiveIntensity: 1.2 });
    for (let k = 0; k < 4; k++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 4), crownMat.clone());
      const angle = (k / 4) * Math.PI * 2;
      spike.position.set(Math.cos(angle) * 0.10, crownY / (this.isElite ? 1.22 : 1.0), Math.sin(angle) * 0.10);
      spike.rotation.z = Math.cos(angle) * 0.4;
      spike.rotation.x = Math.sin(angle) * 0.4;
      this.mesh.add(spike);
    }
  }

  freeze(seconds) {
    if (this.dead || seconds <= 0) return;
    this._frozenTimer = Math.max(this._frozenTimer, seconds);
    this.mesh.traverse(m => {
      if (!m.isMesh) return;
      m.material.emissive.setHex(0x2244ff);
      m.material.emissiveIntensity = 0.9;
    });
  }

  _makeChampion() {
    this.isChampion = true;
    this.hp      = Math.round(this.hp * 2.5);
    this.maxHp   = this.hp;
    this.atk     = Math.round(this.atk * 1.8);
    this.xpValue = Math.round(this.xpValue * 4);
    this.mesh.scale.setScalar(1.65);
    this.mesh.traverse(m => {
      if (!m.isMesh) return;
      m.material.emissive.setHex(0xaa0022);
      m.material.emissiveIntensity = 0.55;
    });
    // Red aura light
    const aura = new THREE.PointLight(0xff0022, 2.5, 6, 2);
    aura.position.y = 1.4;
    this.mesh.add(aura);
    // Champion crown (red spikes, taller than elite)
    const crownY = { goblin:1.30,skeleton:1.45,troll:1.75,warden:1.95,archer:1.45,
                     spider:0.50,wraith:1.45,brute:1.75,mage:1.45 }[this.type] ?? 1.40;
    const crownMat = new THREE.MeshLambertMaterial({ color:0xff2244, emissive:0xff0022, emissiveIntensity:1.8 });
    for (let k = 0; k < 6; k++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.040, 0.22, 4), crownMat.clone());
      const angle = (k / 6) * Math.PI * 2;
      spike.position.set(Math.cos(angle)*0.12, crownY/1.65, Math.sin(angle)*0.12);
      spike.rotation.z = Math.cos(angle) * 0.45;
      spike.rotation.x = Math.sin(angle) * 0.45;
      this.mesh.add(spike);
    }
  }

  dispose() {
    this.dead = true;
    this.mesh.parent?.remove(this.mesh);
    this._bar.remove();
  }

  syncHpBar(camera) {
    if (this.dead) { this._bar.style.display = 'none'; return; }

    const dist = Math.hypot(this.x - camera.position.x, this.z - camera.position.z);
    if (dist > 9) { this._bar.style.display = 'none'; return; }

    const v = new THREE.Vector3(this.x, 1.7, this.z).project(camera);
    if (v.z > 1)  { this._bar.style.display = 'none'; return; }

    const sx = ((v.x + 1) / 2) * innerWidth;
    const sy = ((-v.y + 1) / 2) * innerHeight;
    this._bar.style.display     = 'block';
    this._bar.style.left        = sx + 'px';
    this._bar.style.top         = sy + 'px';
    this._fill.style.width      = (this.hp / this.maxHp * 100) + '%';
    this._fill.style.background = this.hp / this.maxHp > 0.5 ? '#e04040' : '#e08020';
  }
}

// ── Spawner ───────────────────────────────────────────────────────────────────
export function spawnEnemies(scene, world, rooms, startRoom, floorNum = 1) {
  const scale        = 1 + (floorNum - 1) * 0.25;
  const trollChance  = Math.min(0.04 + floorNum * 0.03, 0.25);
  const archerChance = Math.min(0.08 + floorNum * 0.02, 0.25);
  const spiderChance = Math.min(0.06 + floorNum * 0.02, 0.20);
  const wraithChance = floorNum >= 3 ? Math.min(0.04 + (floorNum - 3) * 0.02, 0.15) : 0;
  const bruteChance  = floorNum >= 2 ? Math.min(0.02 + (floorNum - 2) * 0.02, 0.10) : 0;
  const mageChance   = floorNum >= 2 ? Math.min(0.04 + (floorNum - 2) * 0.02, 0.12) : 0;

  const allEnemies = rooms.flatMap(room => {
    if (room === startRoom) return [];
    const count = 1 + Math.floor(Math.random() * 2);
    return Array.from({ length: count }, () => {
      const x    = room.x + 1.5 + Math.random() * (room.w - 3);
      const z    = room.y + 1.5 + Math.random() * (room.h - 3);
      const roll = Math.random();
      const type = roll < trollChance                                                                                    ? 'troll'
                 : roll < trollChance + archerChance                                                                    ? 'archer'
                 : roll < trollChance + archerChance + spiderChance                                                     ? 'spider'
                 : roll < trollChance + archerChance + spiderChance + wraithChance                                      ? 'wraith'
                 : roll < trollChance + archerChance + spiderChance + wraithChance + bruteChance                        ? 'brute'
                 : roll < trollChance + archerChance + spiderChance + wraithChance + bruteChance + mageChance           ? 'mage'
                 : roll < 0.60                                                                                          ? 'goblin'
                 : 'skeleton';
      return new Enemy(scene, x, z, type, scale);
    });
  });

  // One champion per floor from floor 2 onward
  if (floorNum >= 2 && allEnemies.length > 0) {
    const champIdx = Math.floor(Math.random() * allEnemies.length);
    allEnemies[champIdx]._makeChampion();
  }

  return allEnemies;
}

// ── Boss spawner ──────────────────────────────────────────────────────────────
export function spawnBoss(scene, rooms, startRoom, floorNum) {
  let best = null, bestDist = -1;
  for (const r of rooms) {
    if (r === startRoom) continue;
    const d = Math.hypot((r.x + r.w / 2) - (startRoom.x + startRoom.w / 2),
                         (r.y + r.h / 2) - (startRoom.y + startRoom.h / 2));
    if (d > bestDist) { bestDist = d; best = r; }
  }
  const room  = best ?? rooms[rooms.length - 1];
  const x     = room.x + room.w / 2;
  const z     = room.y + room.h / 2;
  const scale = 1 + (Math.floor(floorNum / 5) - 1) * 0.30;
  return new Enemy(scene, x, z, 'warden', Math.max(1, scale));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
