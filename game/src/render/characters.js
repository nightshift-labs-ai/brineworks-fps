// Soldiers: one low-poly rig per actor, built once, sized by BODY so the head is the head hitbox.
import * as THREE from 'three';
import { TEAMS, BODY, MOVE } from '../sim/config.js';
import { heightOf } from '../sim/actors.js';
import { wrapAngle } from '../sim/util.js';
import { MATS, GUNS, build } from './viewmodel.js';

const LEG = 't 19 45 25 0 -23,d 19.5 7 26 0 -33', SHIN = 'c 17 39 22 0 -23,v 18 13 10 0 -5 -12,d 21 11 32 0 -47 -3', ARM = 'c 17 15 43 0 0 -22,d 16 15 15 0 0 -48,c 13 12 36 0 0 -72,d 15 12 16 0 0 -96';
const NODES = [
  ['body root'], ['hipL body -11', LEG], ['hipR body 11', LEG], ['chest body'], ['neck chest'],
  ['trunk chest', 'c 49 96 30 0 49,v 43 67 36 0 55,d 42 12 34 0 9,v 10 32 7 -18 82 -16,v 10 32 7 18 82 -16,d 8 23 10 -12 43 -22,d 8 23 10 0 43 -22,d 8 23 10 12 43 -22,l 26 5 2 0 73 -20,d 32 46 17 0 56 24'],
  ['arms chest', 'c 18 19 23 -25 -3,c 18 19 23 25 -3,l 3 9 18 -34 -3,l 3 9 18 34 -3'], ['armL arms -21 -2', ARM], ['armR arms 21 -2', ARM],
];
const HEADS = [ // Hooded salvage respirators / enclosed refinery hardhats.
  'c 27 28 28,h -15 13 15 0 7,d 23 9 4 0 1 -14,l 23 2 1 0 4 -16,d 15 11 11 0 -9 -13,s -4 6 4 -9 -9 -14 157,s -4 6 4 9 -9 -14 157',
  'c 26 26 26,h -15 14 15 0 9,h 35 3 36 0 8,d 23 10 6 0 0 -14,l 24 2 1 0 3 -18,s 15 10 9 0 -10 -14,d -3 6 3 -11 -10 -14 157,d -3 6 3 11 -10 -14 157',
];

function teamMaterials(team) {
  const c = new THREE.Color(TEAMS[team].color), m = (color, o) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  return {
    v: m(c), l: m(c, { emissive: c, emissiveIntensity: 1.5 }), t: m(c.clone().lerp(new THREE.Color(0x56606a), 0.55).multiplyScalar(0.65)),
    h: m(team ? 0x8897a2 : 0xd9c7a3), c: m(team ? 0x596b7a : 0x82705c), d: m(0x293138), s: m(0x7a838b, { metalness: 0.3 }),
  };
}

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
  rig.knees = rig.hips.map((hip) => { const knee = build(SHIN, mats); knee.position.y = -0.48; hip.add(knee); return knee; });
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
      for (let i = 0; i < 2; i++) {
        const hip = rig.hips[i], knee = rig.knees[i];
        hip.position.y = legLen;
        hip.scale.y = legLen / Math.cos(bend);
        knee.rotation.x = bend * 1.8 - Math.max(0, swing * (i ? -1 : 1)) * 0.45;
        knee.children[2].scale.y = 1 / hip.scale.y;
      }
      rig.hipL.rotation.x = swing - bend;
      rig.hipR.rotation.x = -swing - bend;
      rig.chest.position.y = legLen;
      rig.chest.rotation.x = a.crouch * 0.15;
      rig.chest.rotation.z = Math.sin(rig.stride) * Math.min(1, speed / MOVE.runSpeed) * 0.025;
      rig.trunk.scale.y = torsoLen;
      rig.neck.position.y = torsoLen + BODY.headRadius;
      rig.arms.position.y = torsoLen - 0.12;
      rig.arms.rotation.x = a.alive ? a.pitch : 1.5; // the dead lay the gun flat

      const fall = a.alive ? 0 : Math.min(1, (time - a.diedAt) * 3);
      rig.body.rotation.x = fall * fall * 1.45;
      rig.body.position.y = -fall * 0.1;
    }
  }
  return { update };
}
