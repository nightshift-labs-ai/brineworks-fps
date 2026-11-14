// World objects mirroring sim state: the Fuse Core (hero prop), grenades in flight, smoke clouds.
import * as THREE from 'three';
import { std } from './palette.js';
import { puffTexture } from './textures.js';
import { smokeRadius } from '../sim/grenades.js';
import { lerp } from '../sim/util.js';

const PUFFS = 24;
const add = (parent, geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; parent.add(m); return m; };

export function createProps(scene, state) {
  // The Fuse Core: a light steel canister with amber bands and an LED that flash on every beep; armed,
  // a pale light column and a ground ring pulse over it; disarmed, its bands go dim teal.
  const core = new THREE.Group(), steel = std({ color: 0xb9c2c8, roughness: 0.4, metalness: 0.5 });
  const band = std({ color: 0x3a2400, emissive: 0xffa31a }), led = std({ color: 0x220000, emissive: 0xff4020 });
  add(core, new THREE.CylinderGeometry(0.24, 0.28, 0.48, 16), steel, 0.24);
  add(core, new THREE.CylinderGeometry(0.29, 0.29, 0.06, 16), band, 0.12);
  add(core, new THREE.CylinderGeometry(0.26, 0.26, 0.06, 16), band, 0.38);
  add(core, new THREE.BoxGeometry(0.2, 0.08, 0.34), steel, 0.52);
  add(core, new THREE.SphereGeometry(0.035, 8, 6), led, 0.58);
  const beam = { color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
  const column = add(core, new THREE.CylinderGeometry(0.32, 0.32, 3, 16, 1, true), new THREE.MeshBasicMaterial(beam), 1.5);
  const ring = add(core, new THREE.RingGeometry(0.7, 0.85, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(beam), 0.03);
  const light = new THREE.PointLight(0xffa31a, 0, 7);
  light.position.y = 0.8;
  core.add(light);
  scene.add(core);
  let pulse = 0;

  const nadeGeo = new THREE.SphereGeometry(0.08, 10, 8);
  const nadeMats = { frag: std({ color: 0x4d5a3a }), smoke: std({ color: 0x9aa0a6 }) };
  const nades = state.nades.map(() => { const m = add(scene, nadeGeo, nadeMats.frag); m.visible = false; return m; });

  // Smoke: camera-facing puffs on a fixed spiral filling the cloud's sphere, grey below, lighter on top.
  const tex = puffTexture();
  const clouds = state.smokes.map(() => Array.from({ length: PUFFS }, (_, i) => {
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / PUFFS), up = ((i * 7) % 6) / 6;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0x868c90).lerp(new THREE.Color(0xd6d9d9), up), transparent: true, depthWrite: false, rotation: i * 1.7 }));
    sp.userData = { x: Math.cos(a) * r * 0.85, y: 0.15 + up * 1.15, z: Math.sin(a) * r * 0.85, size: 0.75 + ((i * 5) % 4) * 0.18 };
    sp.visible = false;
    scene.add(sp);
    return sp;
  }));

  function update(alpha, dt, viewerId) {
    const c = state.core, armed = c.state === 'planted', carrier = c.state === 'carried' ? state.actors[c.carrier] : null;
    core.visible = c.state !== 'detonated' && !(carrier && carrier.id === viewerId && c.progress === 0);
    if (carrier) { // on the back, or set down in front while being armed
      const x = lerp(carrier.prev.x, carrier.pos.x, alpha), z = lerp(carrier.prev.z, carrier.pos.z, alpha), placing = c.worker === carrier.id;
      const k = placing ? -1.2 : 0.3;
      core.position.set(x + Math.sin(carrier.yaw) * k, carrier.pos.y + (placing ? 0 : 0.95), z + Math.cos(carrier.yaw) * k);
      core.rotation.set(placing ? 0 : Math.PI / 2, carrier.yaw, 0);
    } else {
      core.position.set(c.x, c.y, c.z);
      core.rotation.set(0, 0, 0);
    }
    pulse = Math.max(0, pulse - dt * 5);
    const t = state.time * 4;
    band.emissive.setHex(c.state === 'defused' ? 0x1a8a80 : 0xffa31a);
    band.emissiveIntensity = c.state === 'defused' ? 0.3 : 0.8 + pulse * 3;
    led.emissiveIntensity = armed ? pulse * 6 : (t % 2 < 1 ? 2 : 0);
    column.visible = ring.visible = armed;
    column.material.opacity = 0.1 + pulse * 0.25;
    ring.material.opacity = 0.35 + pulse * 0.5;
    ring.scale.setScalar(1 + (1 - pulse) * 0.6);
    light.intensity = armed ? 1 + pulse * 7 : c.state === 'dropped' ? 1.5 : 0;

    for (let i = 0; i < nades.length; i++) {
      const n = state.nades[i], m = nades[i];
      m.visible = n.live;
      if (!n.live) continue;
      m.material = nadeMats[n.kind];
      m.position.set(lerp(n.px, n.x, alpha), lerp(n.py, n.y, alpha), lerp(n.pz, n.z, alpha));
    }
    for (let i = 0; i < clouds.length; i++) {
      const s = state.smokes[i], R = s.live ? smokeRadius(s) : 0;
      for (const sp of clouds[i]) {
        sp.visible = R > 0.05;
        if (!sp.visible) continue;
        const o = sp.userData;
        sp.position.set(s.x + o.x * R, s.y + o.y * R, s.z + o.z * R);
        sp.scale.setScalar(R * o.size * 1.25);
        sp.material.opacity = 0.85 * Math.min(1, s.age * 2.5, R / 2);
      }
    }
  }
  return { update, beep: () => { pulse = 1; } };
}
