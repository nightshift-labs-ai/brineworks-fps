// The first-person gun: one box-built model per weapon, drawn in its own pass over the world so
// it never clips into walls. Kick, bob, sway, draw and reload animations read the player's state.
import * as THREE from 'three';
import { WEAPONS } from '../sim/config.js';
import { softDot } from './textures.js';

const METAL = new THREE.MeshStandardMaterial({ color: 0x50555c, roughness: 0.4, metalness: 0.55 });
const FURNITURE = new THREE.MeshStandardMaterial({ color: 0xb59670, roughness: 0.8 });
const GLOVE = new THREE.MeshStandardMaterial({ color: 0x3b332c, roughness: 0.9 });
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0xc8662f, roughness: 0.85 });

function add(group, mat, w, h, d, x, y, z, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  group.add(m);
  return m;
}

// Each model: a group whose origin is the grip, barrel along -z; muzzle = tip position.
function kestrel() {
  const g = new THREE.Group();
  add(g, METAL, 0.075, 0.1, 0.44, 0, 0.04, -0.12); // receiver
  add(g, FURNITURE, 0.08, 0.085, 0.26, 0, 0.035, -0.45); // handguard
  add(g, METAL, 0.03, 0.03, 0.22, 0, 0.05, -0.68); // barrel
  add(g, METAL, 0.045, 0.045, 0.06, 0, 0.05, -0.8); // muzzle brake
  add(g, METAL, 0.05, 0.2, 0.085, 0, -0.08, -0.2, 0.25); // magazine
  add(g, FURNITURE, 0.06, 0.13, 0.07, 0, -0.06, 0.02, -0.3); // grip
  add(g, FURNITURE, 0.065, 0.1, 0.24, 0, 0.02, 0.2); // stock
  add(g, METAL, 0.05, 0.05, 0.12, 0, 0.12, -0.1); // optic
  add(g, METAL, 0.012, 0.03, 0.01, 0, 0.1, -0.53); // front post
  return { group: g, muzzle: new THREE.Vector3(0, 0.05, -0.84) };
}

function wasp() {
  const g = new THREE.Group();
  add(g, METAL, 0.07, 0.1, 0.34, 0, 0.04, -0.1);
  add(g, METAL, 0.035, 0.035, 0.14, 0, 0.05, -0.33);
  add(g, METAL, 0.045, 0.26, 0.06, 0, -0.12, -0.12); // long straight magazine
  add(g, FURNITURE, 0.06, 0.12, 0.07, 0, -0.06, 0.04, -0.25);
  add(g, METAL, 0.02, 0.02, 0.22, 0.025, 0.06, 0.18); // wire stock
  add(g, METAL, 0.02, 0.02, 0.22, -0.025, 0.06, 0.18);
  add(g, METAL, 0.012, 0.03, 0.01, 0, 0.1, -0.25);
  return { group: g, muzzle: new THREE.Vector3(0, 0.05, -0.41) };
}

function pike() {
  const g = new THREE.Group();
  add(g, METAL, 0.06, 0.07, 0.22, 0, 0.06, -0.06); // slide
  add(g, FURNITURE, 0.055, 0.15, 0.07, 0, -0.04, 0.02, -0.2); // grip
  add(g, METAL, 0.012, 0.025, 0.01, 0, 0.105, -0.15);
  return { group: g, muzzle: new THREE.Vector3(0, 0.065, -0.18) };
}

function arms(group, twoHanded) {
  add(group, GLOVE, 0.07, 0.09, 0.1, 0.0, -0.05, 0.03); // trigger hand
  add(group, SLEEVE, 0.11, 0.11, 0.4, 0.03, -0.09, 0.25, 0.15);
  if (twoHanded) {
    add(group, GLOVE, 0.08, 0.08, 0.11, -0.01, -0.01, -0.42);
    add(group, SLEEVE, 0.1, 0.1, 0.45, -0.12, -0.08, -0.2, 0.1).rotation.y = -0.45;
  } else {
    add(group, GLOVE, 0.07, 0.08, 0.09, -0.04, -0.06, 0.04);
  }
}

export function createViewModel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
  scene.add(new THREE.HemisphereLight(0xc9d6ee, 0x6b5545, 1.6));
  const sun = new THREE.DirectionalLight(0xffc48a, 2.2);
  sun.position.set(-2, 3, 1);
  scene.add(sun);
  const holder = new THREE.Group();
  scene.add(holder);
  const models = { kestrel: kestrel(), wasp: wasp(), pike: pike() };
  for (const [id, m] of Object.entries(models)) {
    arms(m.group, WEAPONS[id].kind !== 'pistol');
    m.group.visible = false;
    holder.add(m.group);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.visible = false;
  const light = new THREE.PointLight(0xffb060, 0, 4);
  let current = null, kick = 0, flashTime = 0, bob = 0, swayX = 0, swayY = 0, lastYaw = 0, lastPitch = 0;

  function fired() {
    kick = Math.min(1.6, kick + 1);
    flashTime = 0.05;
    flash.material.rotation += 2.4; // a different star each shot
  }

  function update(dt, a, look) {
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
    const speed = Math.hypot(a.vel.x, a.vel.z);
    bob += dt * speed * 1.9;
    const bobAmt = a.grounded ? Math.min(1, speed / 5) : 0;
    // Look sway: the gun lags a little behind fast turns.
    swayX += (wrap(look.yaw - lastYaw) * 0.6 - swayX) * Math.min(1, dt * 10);
    swayY += ((look.pitch - lastPitch) * 0.6 - swayY) * Math.min(1, dt * 10);
    lastYaw = look.yaw; lastPitch = look.pitch;
    const reload = a.reloadTimer > 0 ? Math.sin((1 - a.reloadTimer / def.reload) * Math.PI) : 0;
    const draw = a.drawTimer > 0 ? a.drawTimer / def.draw : 0;
    const g = current.group;
    g.position.set(
      0.24 + Math.sin(bob) * 0.014 * bobAmt + swayX * 0.4,
      -0.25 - Math.abs(Math.cos(bob)) * 0.012 * bobAmt - reload * 0.14 - draw * 0.3 - a.crouch * 0.015 - swayY * 0.3,
      -0.56 + kick * 0.045,
    );
    g.rotation.set(kick * 0.07 - reload * 0.6 + draw * 0.9, swayX, reload * 0.4);
    flashTime -= dt;
    flash.visible = flashTime > 0;
    flash.scale.setScalar(0.18 + kick * 0.06);
    light.intensity = flashTime > 0 ? 3 : 0;
  }

  function resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); }

  // World-space muzzle position of the player's gun for tracers (camera = the world camera).
  const tmp = new THREE.Vector3();
  function muzzleWorld(worldCamera, out) {
    if (!current) return out.copy(worldCamera.position);
    tmp.copy(current.muzzle).applyMatrix4(current.group.matrixWorld); // in viewmodel camera space
    tmp.applyMatrix4(camera.matrixWorldInverse);
    return out.copy(tmp).applyMatrix4(worldCamera.matrixWorld);
  }
  return { scene, camera, update, fired, resize, muzzleWorld, setVisible: (v) => { holder.visible = v; } };
}

function wrap(x) {
  let y = x;
  while (y > Math.PI) y -= Math.PI * 2;
  while (y < -Math.PI) y += Math.PI * 2;
  return y;
}
