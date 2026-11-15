// Soldiers: one low-poly rig per actor, built once, sized by BODY so the head is the head hitbox.
import * as THREE from 'three';
import { TEAMS, BODY, MOVE } from '../sim/config.js';
import { heightOf } from '../sim/actors.js';
import { wrapAngle } from '../sim/util.js';
import { MATS, GUNS, build } from './viewmodel.js';

// Rig nodes "name parent x y" (cm) with build() parts; hips, trunk, arms are unit-sized, scaled per frame.
// v vest, l team glow, t dark team tint, h helmet, c cloth, d dark, s steel
const LEG = 't 17 93 21 0 -46.5,d 19 12 30 0 -95 4', ARM = 'c 11 11 100 0 0 -50,d 9 9 10 0 0 -100';
const NODES = [
  ['body root'], ['hipL body -11', LEG], ['hipR body 11', LEG], ['chest body'], ['neck chest'],
  ['trunk chest', 'c 44 100 26 0 50,v 50 72 32 0 48,d 32 50 14 0 55 20'],
  ['arms chest', 'l 3 10 14 -27.5 2 -2,l 3 10 14 27.5 2 -2'], ['armL arms -21 -2', ARM], ['armR arms 21 -2', ARM],
];
const HEADS = [ // Harrow: hood, respirator; Saltreeves: brimmed helmet, antenna
  'c 22 20 22 0 -3,t 30 24 12 0 -10 9,h -18 9 16 0 3.5,h -16 7 9 0 11.5,l -18.5 4 18.5 0 1,s 17 11 6 0 -5 -12,s -5 9 5 4 -7 -16 157',
  'c 24 26 26,h 28 8 30 0 13 1,h 40 2.5 42 0 9,l 28.5 3 30.5 0 11 1,d 22 6 3 0 1 -13.5,d 1.4 26 1.4 10 28 10,l 3 3 3 10 41 10',
];

function teamMaterials(team) {
  const c = new THREE.Color(TEAMS[team].color), m = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  return {
    v: m(c), l: m(c, { emissive: c, emissiveIntensity: 1.5 }), t: m(c.clone().lerp(new THREE.Color(0x56606a), 0.6).multiplyScalar(0.45)),
    h: m(team ? 0x56616b : 0xc9c4b8), c: m(0x4d555c), d: m(0x30353a), s: m(0x7a838b, { metalness: 0.3 }),
  };
}

// Point a unit-length arm at a hand (arms-group space).
function reach(arm, x, y, z) {
  const p = arm.position, dx = x - p.x, dy = y - p.y, dz = z - p.z, len = Math.hypot(dx, dy, dz);
  arm.rotation.set(Math.asin(dy / len), Math.atan2(-dx, -dz), 0, 'YXZ');
  arm.scale.z = len;
  arm.children[1].scale.z = 1 / len;
}

function hold(rig, id) {
  if (rig.held) rig.guns[rig.held].visible = false;
  rig.held = id;
  if (!id) return;
  const gun = rig.guns[id], p = gun.position, hand = GUNS[id].hand * 0.75;
  gun.visible = true;
  reach(rig.armR, p.x, p.y - 0.04, p.z);
  reach(rig.armL, hand ? p.x : p.x - 0.05, p.y - 0.03, p.z + hand);
}

function buildRig(scene, team, mats, gunMats) {
  const rig = { root: new THREE.Group(), guns: {}, held: '', stride: 0 };
  for (const [node, parts] of NODES) {
    const [k, parent, x = 0, y = 0] = node.split(' ');
    rig[parent].add(rig[k] = parts ? build(parts, mats) : new THREE.Group());
    rig[k].position.set(x / 100, y / 100, 0);
  }
  build(HEADS[team], mats, rig.neck);
  rig.root.traverse((m) => (m.castShadow = true));
  rig.hips = [rig.hipL, rig.hipR];
  for (const id in GUNS) {
    const gun = rig.guns[id] = build(GUNS[id].parts, gunMats), pistol = !GUNS[id].hand;
    gun.scale.setScalar(0.75);
    gun.position.set(pistol ? 0.03 : 0.1, -0.1, pistol ? -0.45 : -0.32);
    gun.visible = false;
    rig.arms.add(gun);
  }
  scene.add(rig.root);
  return rig;
}

export function createCharacters(scene, state) {
  const mats = [teamMaterials(0), teamMaterials(1)], gunMats = {};
  for (const k in MATS) gunMats[k] = MATS[k].clone(); // own copies: the world pass has fog, the gun pass not
  const rigs = state.actors.map((a) => buildRig(scene, a.team, mats[a.team], gunMats));

  // `hideId`: the actor we look through.
  function update(alpha, dt, hideId, time) {
    for (const a of state.actors) {
      const rig = rigs[a.id];
      rig.root.visible = a.id !== hideId;
      if (!rig.root.visible) continue;
      rig.root.position.copy(a.prev).lerp(a.pos, alpha);
      rig.root.rotation.y = a.prevYaw + wrapAngle(a.yaw - a.prevYaw) * alpha;
      const w = a.slots[a.active], id = w ? w.id : '';
      if (rig.held !== id) hold(rig, id);

      const h = heightOf(a), legLen = h * BODY.legTop, torsoLen = h - legLen - BODY.headRadius * 2;
      const speed = Math.hypot(a.vel.x, a.vel.z), bend = a.crouch * 0.45;
      rig.stride += speed * dt * 2.6;
      const swing = a.grounded ? Math.sin(rig.stride) * Math.min(1, speed / MOVE.runSpeed) * 0.7 : 0.35;
      for (const hip of rig.hips) {
        hip.position.y = legLen;
        hip.scale.y = legLen / Math.cos(bend); // legs fold to the crouch but still reach the ground
        hip.children[1].scale.y = 1 / hip.scale.y;
      }
      rig.hipL.rotation.x = swing - bend;
      rig.hipR.rotation.x = -swing - bend;
      rig.chest.position.y = legLen;
      rig.chest.rotation.x = a.crouch * 0.15;
      rig.trunk.scale.y = torsoLen;
      rig.neck.position.y = torsoLen + BODY.headRadius;
      rig.arms.position.y = torsoLen - 0.12;
      rig.arms.rotation.x = a.pitch;

      const fall = a.alive ? 0 : Math.min(1, (time - a.diedAt) * 3);
      rig.body.rotation.x = fall * fall * 1.45;
      rig.body.position.y = -fall * 0.1;
    }
  }
  return { update };
}
