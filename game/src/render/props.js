// World objects mirroring sim state: the Fuse Core, grenades, smoke clouds.
import * as THREE from 'three';
import { std } from './palette.js';
import { puffTexture } from './textures.js';
import { smokeRadius } from '../sim/senses.js';
import { lerp } from '../sim/util.js';

const PUFFS = 28;
const add = (parent, geo, mat, y = 0) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; parent.add(m); return m; };

export function createProps(scene, state) {
  // The Fuse Core: a case whose window and seam flash on each beep; armed, a light column and ring pulse.
  const core = new THREE.Group(), steel = std({ color: 0x5b6258, roughness: 0.5, metalness: 0.5 });
  const band = std({ color: 0x3a2400, emissive: 0xffa31a });
  add(core, new THREE.BoxGeometry(0.46, 0.34, 0.32), steel, 0.17);
  add(core, new THREE.BoxGeometry(0.26, 0.11, 0.34), band, 0.21);
  add(core, new THREE.BoxGeometry(0.48, 0.03, 0.34), band, 0.05);
  add(core, new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI), steel, 0.34);
  const beam = { color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
  const column = add(core, new THREE.CylinderGeometry(0.32, 0.32, 3, 16, 1, true), new THREE.MeshBasicMaterial(beam), 1.5);
  const ring = add(core, new THREE.RingGeometry(0.7, 0.85, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial(beam), 0.03);
  const light = new THREE.PointLight(0xffa31a, 0, 7);
  light.position.y = 0.8;
  scene.add(core.add(light));
  let pulse = 0;

  const nadeGeo = new THREE.SphereGeometry(0.08, 10, 8), nadeMats = { frag: std({ color: 0x4d5a3a }), smoke: std({ color: 0x9aa0a6 }) };
  const nades = state.nades.map(() => { const m = add(scene, nadeGeo, nadeMats.frag); m.visible = false; return m; });

  // Smoke: a spiral of puffs filling a dome, big inside, small at the ragged rim; dark below, lit above.
  const tex = puffTexture(), clouds = state.smokes.map(() => Array.from({ length: PUFFS }, (_, i) => {
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / PUFFS), y = 0.15 + (i % 6) / 6 * Math.sqrt(1.1 - r * r);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0x353b41).lerp(new THREE.Color(0xf4ead8), y), transparent: true, depthWrite: false, rotation: Math.sin(i) * 0.5 }));
    sp.userData = { x: Math.cos(a) * r * 0.9, y, z: Math.sin(a) * r * 0.9, size: 0.9 - r * 0.5 + (i % 4) * 0.08 };
    sp.visible = false;
    scene.add(sp);
    return sp;
  }));

  function update(alpha, dt, viewerId) {
    const c = state.core, armed = c.state === 'planted', carrier = c.state === 'carried' ? state.actors[c.carrier] : null;
    core.visible = c.state !== 'detonated' && !(carrier && carrier.id === viewerId && c.progress === 0);
    if (carrier) { // on the back, or set down in front while being armed
      const placing = c.worker === carrier.id, k = placing ? -0.8 : 0.3, p = core.position.copy(carrier.prev).lerp(carrier.pos, alpha);
      p.set(p.x + Math.sin(carrier.yaw) * k, carrier.pos.y + (placing ? 0 : 0.95), p.z + Math.cos(carrier.yaw) * k);
      core.rotation.set(placing ? 0 : Math.PI / 2, carrier.yaw, 0);
    } else {
      core.position.set(c.x, c.y, c.z);
      core.rotation.set(0, 0, 0);
    }
    pulse = Math.max(0, pulse - dt * 5);
    band.emissive.setHex(c.state === 'defused' ? 0x1a8a80 : 0xffa31a);
    band.emissiveIntensity = c.state === 'defused' ? 0.3 : 0.8 + pulse * 3;
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
        sp.scale.setScalar(R * o.size);
        sp.material.opacity = Math.min(1, s.age * 2.5, R / 2);
      }
    }
  }
  return { update, beep: () => { pulse = 1; } };
}
