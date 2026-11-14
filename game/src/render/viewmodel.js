// The first-person gun: one box-built model per weapon (parts listed as data), drawn in its own
// pass over the world so it never clips into walls. Kick, bob, look sway, draw, reload and the
// arm/disarm crouch are animated from the player's state.
import * as THREE from 'three';
import { WEAPONS } from '../sim/config.js';
import { wrapAngle } from '../sim/util.js';
import { softDot } from './textures.js';

const MATS = {
  m: new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.45, metalness: 0.25 }), // gunmetal
  f: new THREE.MeshStandardMaterial({ color: 0xa88a62, roughness: 0.75 }), // sand furniture
  p: new THREE.MeshStandardMaterial({ color: 0xefc94c, roughness: 0.6 }), // paint mark
  g: new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9 }), // gloves
  s: new THREE.MeshStandardMaterial({ color: 0x4a4b40, roughness: 0.95 }), // sleeves
};

// [material, width, height, depth, x, y, z, pitch]; origin at the grip, barrel along -z.
const MODELS = {
  kestrel: { muzzle: -0.84, parts: [['m', 0.075, 0.1, 0.44, 0, 0.04, -0.12], ['f', 0.08, 0.085, 0.26, 0, 0.035, -0.45], ['m', 0.03, 0.03, 0.22, 0, 0.05, -0.68], ['m', 0.045, 0.045, 0.06, 0, 0.05, -0.8], ['m', 0.05, 0.2, 0.085, 0, -0.08, -0.2, 0.25], ['f', 0.06, 0.13, 0.07, 0, -0.06, 0.02, -0.3], ['f', 0.065, 0.1, 0.24, 0, 0.02, 0.2], ['m', 0.05, 0.05, 0.12, 0, 0.12, -0.1], ['p', 0.081, 0.02, 0.05, 0, 0.06, -0.52]] },
  wasp: { muzzle: -0.41, parts: [['m', 0.07, 0.1, 0.34, 0, 0.04, -0.1], ['m', 0.035, 0.035, 0.14, 0, 0.05, -0.33], ['m', 0.045, 0.26, 0.06, 0, -0.12, -0.12], ['f', 0.06, 0.12, 0.07, 0, -0.06, 0.04, -0.25], ['m', 0.02, 0.02, 0.22, 0.025, 0.06, 0.18], ['m', 0.02, 0.02, 0.22, -0.025, 0.06, 0.18], ['p', 0.071, 0.02, 0.04, 0, 0.07, -0.2]] },
  brute: { muzzle: -0.7, parts: [['m', 0.08, 0.1, 0.36, 0, 0.04, -0.1], ['m', 0.045, 0.045, 0.42, 0, 0.07, -0.48], ['f', 0.07, 0.07, 0.24, 0, 0, -0.42], ['f', 0.065, 0.13, 0.07, 0, -0.06, 0.04, -0.3], ['f', 0.07, 0.11, 0.26, 0, 0, 0.22], ['p', 0.071, 0.02, 0.24, 0, 0.036, -0.42]] },
  heron: { muzzle: -0.9, parts: [['m', 0.075, 0.1, 0.46, 0, 0.04, -0.12], ['m', 0.032, 0.032, 0.5, 0, 0.05, -0.58], ['m', 0.05, 0.05, 0.08, 0, 0.05, -0.86], ['m', 0.06, 0.07, 0.3, 0, 0.14, -0.12], ['m', 0.075, 0.08, 0.05, 0, 0.14, -0.28], ['m', 0.05, 0.12, 0.07, 0, -0.06, -0.14, 0.15], ['f', 0.065, 0.13, 0.07, 0, -0.06, 0.03, -0.3], ['f', 0.07, 0.13, 0.28, 0, 0, 0.24]] },
  pike: { muzzle: -0.18, parts: [['m', 0.06, 0.07, 0.22, 0, 0.06, -0.06], ['f', 0.055, 0.15, 0.07, 0, -0.04, 0.02, -0.2], ['p', 0.061, 0.015, 0.03, 0, 0.09, 0.03]] },
};
const ARMS = [['g', 0.07, 0.09, 0.1, 0, -0.05, 0.03], ['s', 0.11, 0.11, 0.4, 0.03, -0.09, 0.25, 0.15]];
const SUPPORT = [['g', 0.08, 0.08, 0.11, -0.01, -0.01, -0.42], ['s', 0.1, 0.1, 0.45, -0.13, -0.08, -0.2, 0.1, -0.45]];
const PISTOL_HAND = [['g', 0.07, 0.08, 0.09, -0.04, -0.06, 0.04]];

function build(parts, group) {
  for (const [mat, w, h, d, x, y, z, rx = 0, ry = 0] of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MATS[mat]);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, 0);
    group.add(mesh);
  }
  return group;
}

export function createViewModel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(64, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xd6e0f2, 0x7a604c, 2.2));
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.6);
  sun.position.set(-1, 3, 2);
  scene.add(sun);
  const holder = new THREE.Group();
  scene.add(holder);
  const models = {};
  for (const [id, spec] of Object.entries(MODELS)) {
    const group = build(spec.parts, new THREE.Group());
    build(ARMS, group);
    build(WEAPONS[id].kind === 'pistol' ? PISTOL_HAND : SUPPORT, group);
    group.visible = false;
    group.scale.setScalar(0.5);
    holder.add(group);
    models[id] = { group, muzzle: new THREE.Vector3(0, 0.05, spec.muzzle) };
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false }));
  const light = new THREE.PointLight(0xffb060, 0, 4);
  let current = null, kick = 0, flashTime = 0, bob = 0, swayX = 0, swayY = 0, lastYaw = 0, lastPitch = 0, low = 0;

  function fired() {
    kick = Math.min(1.6, kick + 1);
    flashTime = 0.05;
    flash.material.rotation += 2.4; // a different star each shot
  }

  // `working`: the player is arming or disarming the core, so the gun is lowered.
  function update(dt, a, look, working) {
    const w = a.slots[a.active];
    if (!w) return;
    const def = WEAPONS[w.id];
    if (current !== models[w.id]) {
      if (current) current.group.visible = false;
      current = models[w.id];
      current.group.visible = true;
      current.group.add(flash, light);
      flash.position.copy(current.muzzle);
      light.position.copy(current.muzzle);
    }
    kick *= Math.exp(-dt * 14);
    low += ((working ? 1 : 0) - low) * Math.min(1, dt * 8);
    const speed = Math.hypot(a.vel.x, a.vel.z);
    bob += dt * speed * 1.9;
    const bobAmt = a.grounded ? Math.min(1, speed / 5) : 0;
    // Look sway: the gun lags a little behind fast turns.
    swayX += (wrapAngle(look.yaw - lastYaw) * 0.6 - swayX) * Math.min(1, dt * 10);
    swayY += ((look.pitch - lastPitch) * 0.6 - swayY) * Math.min(1, dt * 10);
    lastYaw = look.yaw; lastPitch = look.pitch;
    const reload = a.reloadTimer > 0 ? Math.sin((1 - a.reloadTimer / def.reload) * Math.PI) : 0;
    const draw = a.drawTimer > 0 ? Math.min(1, a.drawTimer / def.draw) : 0;
    const dip = reload * 0.08 + draw * 0.18 + low * 0.16;
    current.group.position.set(
      0.16 + Math.sin(bob) * 0.008 * bobAmt + swayX * 0.25,
      -0.14 - Math.abs(Math.cos(bob)) * 0.007 * bobAmt - dip - a.crouch * 0.008 - swayY * 0.18,
      -0.34 + kick * 0.02,
    );
    current.group.rotation.set(kick * 0.07 - reload * 0.6 + draw * 0.9 - low * 0.5, swayX, reload * 0.4);
    flashTime -= dt;
    flash.visible = flashTime > 0;
    flash.scale.setScalar(0.16 + kick * 0.05);
    light.intensity = flashTime > 0 ? 3 : 0;
  }

  function resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }

  // World-space muzzle of the player's gun, for tracers: viewmodel space -> camera space -> world.
  const tmp = new THREE.Vector3();
  function muzzleWorld(worldCamera, out) {
    if (!current) return out.copy(worldCamera.position);
    tmp.copy(current.muzzle).applyMatrix4(current.group.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    return out.copy(tmp).applyMatrix4(worldCamera.matrixWorld);
  }
  return { scene, camera, update, fired, resize, muzzleWorld, setVisible: (v) => { holder.visible = v; } };
}
