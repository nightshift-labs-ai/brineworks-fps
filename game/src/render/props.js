// World objects that mirror sim state: the Fuse Core (on its carrier's back, on the ground, or armed
// and blinking faster as the fuse burns), grenades in flight, and smoke clouds made of a fixed set
// of soft sprites per cloud slot.
import * as THREE from 'three';
import { GRENADES } from '../sim/config.js';
import { puffTexture } from './textures.js';

const PUFFS = 14;

export function createProps(scene, state) {
  // The core: a squat canister with a glowing band and a light that pulses with the beeps.
  const core = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffa31a, emissiveIntensity: 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.34, 14), shell);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.07, 14), glow);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.24), shell);
  body.position.y = 0.17; band.position.y = 0.2; cap.position.y = 0.37;
  body.castShadow = true;
  core.add(body, band, cap);
  const light = new THREE.PointLight(0xffa31a, 0, 6);
  light.position.y = 0.5;
  core.add(light);
  scene.add(core);
  let pulse = 0;

  const nadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
  const nadeMats = { frag: new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.6 }), smoke: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5 }) };
  const nades = state.nades.map(() => { const m = new THREE.Mesh(nadeGeo, nadeMats.frag); m.visible = false; scene.add(m); return m; });

  const puffTex = puffTexture();
  const clouds = state.smokes.map(() => Array.from({ length: PUFFS }, (_, i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xcfd0cc, transparent: true, depthWrite: false, opacity: 0, rotation: i * 1.7 }));
    // puffs on a squashed golden-angle spiral, fixed per slot
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / PUFFS);
    sp.userData.offset = new THREE.Vector3(Math.cos(a) * r, 0.35 + ((i * 7) % 5) * 0.32, Math.sin(a) * r);
    sp.visible = false;
    scene.add(sp);
    return sp;
  }));

  function update(alpha, dt, viewerId) {
    const c = state.core;
    core.visible = c.state !== 'detonated' && !(c.state === 'carried' && c.carrier === viewerId);
    if (c.state === 'carried') {
      const a = state.actors[c.carrier];
      const yaw = a.yaw;
      const x = a.prev.x + (a.pos.x - a.prev.x) * alpha, z = a.prev.z + (a.pos.z - a.prev.z) * alpha;
      core.position.set(x + Math.sin(yaw) * 0.27, a.pos.y + 0.95, z + Math.cos(yaw) * 0.27);
      core.rotation.set(Math.PI / 2, yaw, 0);
    } else {
      core.position.set(c.x, c.y, c.z);
      core.rotation.set(0, 0, 0);
    }
    // Armed: each beep (see beep()) flashes the band and the light; disarmed: dark.
    pulse = Math.max(0, pulse - dt * 6);
    const armed = c.state === 'planted';
    glow.emissiveIntensity = c.state === 'defused' ? 0.05 : armed ? 0.6 + pulse * 4 : 0.8;
    light.intensity = armed ? pulse * 6 : c.state === 'dropped' ? 1.2 : 0;

    for (let i = 0; i < nades.length; i++) {
      const n = state.nades[i], m = nades[i];
      m.visible = n.live;
      if (!n.live) continue;
      m.material = nadeMats[n.kind];
      m.position.set(n.px + (n.x - n.px) * alpha, n.py + (n.y - n.py) * alpha, n.pz + (n.z - n.pz) * alpha);
    }

    const dur = GRENADES.smoke.duration, R = GRENADES.smoke.radius;
    for (let i = 0; i < clouds.length; i++) {
      const s = state.smokes[i];
      const grow = Math.min(1, s.age / 1.2);
      const fade = s.age > dur - 2 ? Math.max(0, (dur - s.age) / 2) : 1;
      for (const sp of clouds[i]) {
        sp.visible = s.live;
        if (!s.live) continue;
        const o = sp.userData.offset;
        sp.position.set(s.x + o.x * R * grow, s.y + o.y * grow * 1.6, s.z + o.z * R * grow);
        sp.scale.setScalar(R * (0.9 + grow * 0.9));
        sp.material.opacity = 0.92 * fade * Math.min(1, s.age * 3);
      }
    }
  }
  return { update, beep: () => { pulse = 1; } };
}
