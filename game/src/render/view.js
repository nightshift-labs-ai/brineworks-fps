// The renderer: reads the game state (never writes it), interpolates bodies between the last two
// sim ticks, turns sim events into effects, and draws the world then the first-person gun.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures, skyTexture } from './textures.js';
import { buildLevel } from './level.js';
import { createCharacters } from './characters.js';
import { createEffects } from './effects.js';
import { createViewModel } from './viewmodel.js';
import { createProps } from './props.js';
import { drain, EV } from '../sim/events.js';
import { eyeOf } from '../sim/actors.js';
import { WEAPONS } from '../sim/config.js';

export function createView(state, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.haze, 35, 170);
  const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 600); // fov: BASE_FOV below
  camera.rotation.order = 'YXZ';

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.25));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.2);
  const map = state.map;
  sun.position.set(map.width / 2 - 60, 38, map.depth / 2 + 25); // low in the south-west
  sun.target.position.set(map.width / 2, 0, map.depth / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 170;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  scene.add(buildLevel(map, createTextures()));
  const characters = createCharacters(scene, state);
  const effects = createEffects(scene);
  const props = createProps(scene, state);
  const vm = createViewModel();
  const BASE_FOV = 74;
  let shake = 0;

  const muzzle = new THREE.Vector3();
  let cursor = state.events.head;

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    vm.resize(w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  // Whose eyes we see through: the player, or a living teammate while dead.
  function viewer() {
    const p = state.player;
    if (p.alive) return p;
    for (const a of state.actors) if (a.alive && a.team === p.team) return a;
    return p;
  }

  function onEvent(e) {
    const p = state.player;
    switch (e.type) {
      case EV.SHOT: {
        let x = e.x, y = e.y - 0.12, z = e.z;
        if (e.a === p.id && p.alive) {
          vm.muzzleWorld(camera, muzzle);
          x = muzzle.x; y = muzzle.y; z = muzzle.z;
          vm.fired();
        } else {
          const shooter = state.actors[e.a];
          const fx = -Math.sin(shooter.yaw), fz = -Math.cos(shooter.yaw);
          x += fx * 0.75 - fz * 0.08; z += fz * 0.75 + fx * 0.08; y -= 0.1;
          effects.spawnFlash(x, y, z);
        }
        effects.spawnTracer(x, y, z, e.x2, e.y2, e.z2);
        break;
      }
      case EV.IMPACT:
        effects.spawnDecal(e.x, e.y, e.z, e.x2, e.y2, e.z2);
        effects.spawnParticles(e.x, e.y, e.z, e.x2, e.y2, e.z2, 6, 0.85, 0.78, 0.66, 2.2);
        break;
      case EV.HIT: {
        const v = state.actors[e.b];
        effects.spawnParticles(v.pos.x, v.pos.y + (e.w === 1 ? 1.6 : e.w === 2 ? 1.2 : 0.5), v.pos.z, 0, 0.3, 0, e.w === 1 ? 10 : 6, 0.55, 0.08, 0.06, 1.6);
        break;
      }
      case EV.ROUND:
        if (e.v === 0) effects.clearDecals();
        break;
      case EV.BLAST: {
        effects.spawnBlast(e.x, e.y, e.z, e.v);
        const d = Math.hypot(e.x - camera.position.x, e.z - camera.position.z);
        shake = Math.max(shake, Math.max(0, 1 - d / (e.v * 3)));
        break;
      }
      case EV.CORE:
        if (e.v === 4) props.beep();
        break;
    }
  }

  function render(alpha, dt, look) {
    cursor = drain(state.events, cursor, onEvent);
    const who = viewer();
    const x = who.prev.x + (who.pos.x - who.prev.x) * alpha;
    const y = who.prev.y + (who.pos.y - who.prev.y) * alpha + eyeOf(who);
    const z = who.prev.z + (who.pos.z - who.prev.z) * alpha;
    camera.position.set(x, y, z);
    // The player's own view uses the freshest mouse look; recoil punch is drawn on top.
    const yaw = who === state.player ? look.yaw : who.yaw;
    const pitch = who === state.player ? look.pitch : who.pitch;
    shake = Math.max(0, shake - dt * 1.8);
    const jolt = shake * shake * 0.04 * Math.sin(performance.now() * 0.09);
    camera.rotation.set(pitch + who.punchPitch + jolt, yaw + who.punchYaw + jolt * 0.7, 0);
    // A scoped marksman rifle narrows the view; the HUD draws the scope ring.
    const w = who.slots[who.active];
    const fov = who.scoped && w ? BASE_FOV * WEAPONS[w.id].scope : BASE_FOV;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    characters.update(alpha, dt, who.id);
    props.update(alpha, dt, who.id);
    effects.update(dt);
    vm.setVisible(who === state.player && who.alive && !who.scoped);
    vm.update(dt, who, look);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(vm.scene, vm.camera);
  }

  return { render, renderer, camera, canvas: renderer.domElement };
}
