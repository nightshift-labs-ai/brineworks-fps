// The first-person gun and arms, drawn in a pass of their own so they never clip into walls.
import * as THREE from 'three';
import { WEAPONS, TEAMS } from '../sim/config.js';
import { wrapAngle } from '../sim/util.js';
import { glow, starTexture } from './textures.js';

const mat = (color, roughness, metalness = 0.1, emissive = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive });
// k dark steel, e sand polymer, b olive polymer, m gunmetal, p signal band, r reticle, g gloves, s sleeves, c team cuff
export const MATS = {
  k: mat(0x41474d, 0.45, 0.3), e: mat(0xbcab80, 0.75), b: mat(0x6f6c48, 0.75), m: mat(0x5c636a, 0.35, 0.5), p: mat(0xefc94c, 0.5),
  r: mat(0x0c3a34, 0.3, 0, 0x3fe0c0), g: mat(0x2f3236, 0.85), s: mat(0x3c4147, 0.95), c: mat(0xffffff, 0.8),
};

// Parts "material w h d x y z pitch yaw" (cm, centiradians, missing 0); negative w: 8-sided cylinder, radii -w, d.
export function build(parts, mats = MATS, group = new THREE.Group()) {
  for (const part of parts.split(',')) {
    const [m, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0] = part.split(' ').map((v, i) => (i ? v / 100 : v));
    const mesh = new THREE.Mesh(w < 0 ? new THREE.CylinderGeometry(d, -w, h, 8) : new THREE.BoxGeometry(w, h, d), mats[m]);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0);
    group.add(mesh);
  }
  return group;
}

// Grip at the origin, barrel along -z; muzzle [y, z] m; hand: support hand z (0: two-handed pistol).
export const GUNS = {
  rivet: { muzzle: [0.08, -0.2], hand: 0, parts: 'b 5 5 22 0 8 -8,k 4.6 3.6 18 0 4 -10,k 4.6 15 6.5 0 -4 1.5 -25,k 3 1.2 7 0 0 -7,m 2.4 2.4 1 0 8.5 -19.3,p 5.2 1.2 2 0 10.9 1.5' },
  skiff: { muzzle: [0.04, -0.43], hand: -0.2, parts: 'b 8 11 34 0 3 -8,k 8.2 3 34 0 -3.5 -8,m 6 6 14 0 4 -31,m 2.8 2.8 6 0 4 -40,k 4.5 20 6 0 -12 -15,k 5 12 6 0 -7 2 -25,m 1.6 1.6 24 3 5 20,m 1.6 1.6 24 -3 5 20,k 8 10 2 0 3 32,k 3 3.5 4 0 10 4,p 8.4 11.4 2.5 0 3 -22' },
  // a bullpup: magazine behind the grip
  ballast: { muzzle: [0.04, -0.64], hand: -0.36, parts: 'e 9 12 54 0 2 3,k 9.4 15 6 0 1 29,k 9.2 4 30 0 9.5 11,b 7.5 8.5 24 0 3.5 -36,m 3 3 12 0 4 -54,m 4.5 4.5 5 0 4 -61,m 3 1.6 44 0 8.8 -20,k 6 6.5 11 0 13 -10,r 1.4 1.4 .5 0 13.5 -4.2,k 5 13 6 0 -8 -2 -25,k 5.5 17 8.5 0 -10 16,p 9.6 12.6 3 0 2 -20' },
  bollard: { muzzle: [0.065, -0.67], hand: -0.42, parts: 'e 9 12 34 0 3 -6,m 5 5 44 0 6.5 -45,k 5 5 36 0 0 -40,b 8.5 8.5 20 0 1.5 -42,m 2 1.2 44 0 9.6 -45,k 5.5 13 6.5 0 -7 3 -30,k 7.5 12 26 0 -1 24 8,p 8.8 8.8 3 0 1.5 -48' },
  capstan: { muzzle: [0.04, -1.01], hand: -0.42, parts: 'k 8 10 42 0 3 -8,e 7 7.5 36 0 3.5 -47,m 3 3 30 0 4 -80,m 5 5 8 0 4 -97,k -2.8 42 2.8 0 14 -12 157,k -3.8 8 3.8 0 14 -35 157,k -3.3 6 3.3 0 14 10 157,m 3 3 3 0 9.5 -22,m 3 3 3 0 9.5,k 5 12 6.5 0 -7 2 -30,k 5 11 7 0 -6 -15,e 6 4 30 0 6 28,e 6 4 26 0 -6 27,k 7 17 4 0 0 42,p 7.4 8 3 0 3.5 -60' },
};
const ARMS = 'g 7 9 10 0 -5 3,c 11.5 11.5 5 1.5 -7 9 15,s 11 11 40 3 -10 30 15';
const SUPPORT = 'g 8 8 11 -1 -2,c 10.5 10.5 5 -4 -4 6 10 -45,s 10 10 45 -13 -8 22 10 -45'; // at hand z, or beside the pistol grip

export function createViewModel() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(64, 1, 0.01, 10), holder = new THREE.Group();
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.6);
  sun.position.set(-1, 3, 2);
  scene.add(new THREE.HemisphereLight(0xd6e0f2, 0x868d94, 2.2), sun, holder);
  const models = {};
  for (const id in GUNS) {
    const { muzzle, hand, parts } = GUNS[id], group = build(ARMS, MATS, build(parts));
    group.add(build(SUPPORT).translateZ(hand || 0.03).translateX(hand ? 0 : -0.035).translateY(hand ? 0 : -0.03));
    group.visible = false;
    group.scale.setScalar(0.5);
    holder.add(group);
    models[id] = { group, muzzle: new THREE.Vector3(0, ...muzzle) };
  }
  const flash = new THREE.Sprite(glow(0xffc070, starTexture()));
  flash.material.depthTest = false; // over the muzzle it sits in
  let current = null, kick = 0, flashTime = 0, bob = 0, swayX = 0, swayY = 0, lastYaw = 0, lastPitch = 0, low = 0;

  function fired() {
    kick = Math.min(1.6, kick + 1);
    flashTime = 0.05;
    flash.material.rotation += 2.4; // a different star each shot
  }

  // `working`: arming or disarming the core lowers the gun.
  function update(dt, a, look, working) {
    const w = a.slots[a.active];
    if (!w) return;
    const def = WEAPONS[w.id], pistol = def.kind === 'pistol'; // the pistol sits lower and closer
    if (current !== models[w.id]) {
      if (current) current.group.visible = false;
      current = models[w.id];
      current.group.visible = true;
      current.group.add(flash);
      flash.position.copy(current.muzzle);
    }
    MATS.c.color.setHex(TEAMS[a.team].color);
    kick *= Math.exp(-dt * 14);
    low += ((working ? 1 : 0) - low) * Math.min(1, dt * 8);
    const speed = Math.hypot(a.vel.x, a.vel.z), bobAmt = a.grounded ? Math.min(1, speed / 5) : 0, lag = Math.min(1, dt * 10);
    bob += dt * speed * 1.9;
    swayX += (wrapAngle(look.yaw - lastYaw) * 0.6 - swayX) * lag; // the gun lags behind fast turns
    swayY += ((look.pitch - lastPitch) * 0.6 - swayY) * lag;
    lastYaw = look.yaw; lastPitch = look.pitch;
    const reload = a.reloadTimer > 0 ? Math.sin((1 - a.reloadTimer / def.reload) * Math.PI) : 0;
    const draw = a.drawTimer > 0 ? Math.min(1, a.drawTimer / def.draw) : 0, dip = reload * 0.08 + draw * 0.18 + low * 0.16;
    current.group.position.set(
      (pistol ? 0.19 : 0.16) + Math.sin(bob) * 0.008 * bobAmt + swayX * 0.25,
      (pistol ? -0.165 : -0.105) - Math.abs(Math.cos(bob)) * 0.007 * bobAmt - dip - a.crouch * 0.008 - swayY * 0.18,
      (pistol ? -0.34 : -0.5) + kick * 0.02,
    );
    current.group.rotation.set((pistol ? 0 : 0.05) + kick * 0.07 - reload * 0.6 + draw * 0.9 - low * 0.5, swayX + (pistol ? 0.12 : 0.2), reload * 0.4);
    flashTime -= dt;
    flash.visible = flashTime > 0;
    flash.scale.setScalar(0.1 + kick * 0.03);
  }

  function resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }

  function muzzleWorld(worldCamera, out) {
    if (!current) return out.copy(worldCamera.position);
    return out.copy(current.muzzle).applyMatrix4(current.group.matrixWorld).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(worldCamera.matrixWorld);
  }
  return { scene, camera, update, fired, resize, muzzleWorld, setVisible: (v) => { holder.visible = v; } };
}
