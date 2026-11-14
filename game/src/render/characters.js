// Character models: blocky soldiers built from boxes, one rig per actor made once at load.
// Proportions come from sim/config.js BODY so the head you see is the head hitbox; team colour
// is on the vest, helmet and visor. Animation (stride, crouch, aim pitch, falling) is view-only.
import * as THREE from 'three';
import { TEAMS, BODY, MOVE } from '../sim/config.js';
import { heightOf } from '../sim/actors.js';
import { wrapAngle } from '../sim/util.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GEO = {
  leg: box(0.17, 1, 0.21).translate(0, -0.5, 0), // unit length, hangs from the hip
  boot: box(0.19, 0.12, 0.3).translate(0, -0.06, 0.04),
  torso: box(0.46, 1, 0.27).translate(0, 0.5, 0),
  vest: box(0.5, 0.62, 0.31).translate(0, 0.42, 0),
  pack: box(0.34, 0.4, 0.14),
  head: box(0.25, 0.27, 0.27),
  helmet: box(0.31, 0.15, 0.33),
  visor: box(0.27, 0.07, 0.04),
  arm: box(0.12, 0.12, 0.5).translate(0, 0, -0.25),
  gun: box(0.07, 0.11, 0.72).translate(0, 0, -0.36),
};

function teamMaterials(team) {
  const color = TEAMS[team].color;
  return {
    suit: new THREE.MeshStandardMaterial({ color: team ? 0x2b3236 : 0x3a302b, roughness: 0.9 }),
    vest: new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    helmet: new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.5, metalness: 0.2 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 1.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.6, metalness: 0.3 }),
  };
}

function part(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildRig(mats) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // tipped over when dead
  root.add(body);
  const hipL = new THREE.Group(), hipR = new THREE.Group();
  hipL.position.x = -0.11; hipR.position.x = 0.11;
  body.add(hipL, hipR);
  const legL = part(GEO.leg, mats.suit, hipL), legR = part(GEO.leg, mats.suit, hipR);
  const bootL = part(GEO.boot, mats.dark, legL, 0, -1, 0), bootR = part(GEO.boot, mats.dark, legR, 0, -1, 0);
  bootL.scale.y = bootR.scale.y = 1; // boots are re-scaled against the leg length each frame
  const chest = new THREE.Group();
  body.add(chest);
  const torso = part(GEO.torso, mats.suit, chest);
  part(GEO.vest, mats.vest, chest);
  part(GEO.pack, mats.dark, chest, 0, 0.38, 0.2);
  const neck = new THREE.Group();
  chest.add(neck);
  part(GEO.head, mats.suit, neck);
  part(GEO.helmet, mats.helmet, neck, 0, 0.12, 0.01);
  part(GEO.visor, mats.visor, neck, 0, 0.03, -0.14);
  const arms = new THREE.Group(); // shoulders: pitched with the aim
  chest.add(arms);
  part(GEO.arm, mats.suit, arms, -0.2, 0, 0).rotation.y = -0.35;
  part(GEO.arm, mats.suit, arms, 0.2, 0, 0).rotation.y = 0.25;
  part(GEO.gun, mats.dark, arms, 0.06, -0.02, -0.25);
  return { root, body, hipL, hipR, legL, legR, bootL, bootR, chest, torso, neck, arms, stride: 0, fall: 0 };
}

export function createCharacters(scene, state) {
  const mats = [teamMaterials(0), teamMaterials(1)];
  const rigs = state.actors.map((a) => {
    const rig = buildRig(mats[a.team]);
    scene.add(rig.root);
    return rig;
  });

  // Pose every rig from interpolated sim state. `hideId` is the actor whose eyes we look through.
  function update(alpha, dt, hideId, time) {
    for (const a of state.actors) {
      const rig = rigs[a.id];
      rig.root.visible = a.id !== hideId;
      if (!rig.root.visible) continue;
      const x = a.prev.x + (a.pos.x - a.prev.x) * alpha;
      const y = a.prev.y + (a.pos.y - a.prev.y) * alpha;
      const z = a.prev.z + (a.pos.z - a.prev.z) * alpha;
      rig.root.position.set(x, y, z);
      rig.root.rotation.y = a.prevYaw + wrapAngle(a.yaw - a.prevYaw) * alpha;

      const h = heightOf(a);
      const legLen = h * BODY.legTop;
      const speed = Math.hypot(a.vel.x, a.vel.z);
      rig.stride += speed * dt * 2.6;
      const swing = a.grounded ? Math.sin(rig.stride) * Math.min(1, speed / MOVE.runSpeed) * 0.7 : 0.35;
      const bend = a.crouch * 0.9;
      rig.hipL.position.y = rig.hipR.position.y = legLen;
      rig.legL.scale.y = rig.legR.scale.y = legLen / Math.cos(bend * 0.5);
      rig.bootL.scale.y = rig.bootR.scale.y = 1 / rig.legL.scale.y;
      rig.hipL.rotation.x = swing - bend * 0.5;
      rig.hipR.rotation.x = -swing - bend * 0.5;
      rig.chest.position.y = legLen;
      const torsoLen = h - legLen - BODY.headRadius * 2;
      rig.torso.scale.y = torsoLen;
      rig.neck.position.y = torsoLen + BODY.headRadius;
      rig.arms.position.y = torsoLen - 0.12;
      rig.arms.rotation.x = a.pitch;
      rig.chest.rotation.x = a.crouch * 0.15;

      // Dying: tip over backwards over a third of a second after the moment of death.
      rig.fall = a.alive ? 0 : Math.min(1, (time - a.diedAt) * 3);
      rig.body.rotation.x = rig.fall * rig.fall * 1.45;
      rig.body.position.y = -rig.fall * 0.1;
    }
  }
  return { update, rigs };
}
