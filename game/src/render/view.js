// The renderer: reads state (never writes it), interpolates bodies, turns events into effects, and draws
// the world then the first-person gun. Low warm sun, cool sky fill, a sky environment map; at a round's
// end the camera rises over the Fuse Core.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures, skyTexture, glow } from './textures.js';
import { buildLevel } from './level.js';
import { createCharacters } from './characters.js';
import { createEffects } from './effects.js';
import { createViewModel } from './viewmodel.js';
import { createProps } from './props.js';
import { drain, EV } from '../sim/events.js';
import { eyeOf } from '../sim/actors.js';
import { WEAPONS } from '../sim/config.js';
import { wrapAngle, lerp } from '../sim/util.js';

const BASE_FOV = 74;

export function createView(state, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.haze, 35, 170);
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.1));
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
  const disc = new THREE.Sprite(glow(0xffd9a0)); // the sun itself, far off along the light
  disc.position.copy(sun.position).sub(sun.target.position).normalize().multiplyScalar(380).add(sun.target.position);
  disc.scale.setScalar(70);
  scene.add(disc);

  // Environment light (metal, brine pools, the gun): the sky plus a warm panel at the sun, PMREM-filtered once.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ color: 0xffc890, side: THREE.DoubleSide }));
  panel.position.copy(disc.position).multiplyScalar(0.9);
  panel.lookAt(0, 0, 0);
  envScene.add(panel);
  const env = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.03).texture;

  scene.add(buildLevel(map, createTextures()));
  const characters = createCharacters(scene, state);
  const effects = createEffects(scene);
  const props = createProps(scene, state);
  const vm = createViewModel();
  scene.environment = vm.scene.environment = env;
  scene.environmentIntensity = vm.scene.environmentIntensity = 0.6;
  let shake = 0;

  const muzzle = new THREE.Vector3(), overview = new THREE.Vector3();
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

  function viewer() { // the player, or a living teammate while dead
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
    const x = lerp(who.prev.x, who.pos.x, alpha), z = lerp(who.prev.z, who.pos.z, alpha);
    camera.position.set(x, lerp(who.prev.y, who.pos.y, alpha) + eyeOf(who), z);
    // The player's own view uses the freshest mouse look; recoil punch is drawn on top.
    let yaw = (who === state.player ? look.yaw : who.yaw) + who.punchYaw;
    let pitch = (who === state.player ? look.pitch : who.pitch) + who.punchPitch;
    shake = Math.max(0, shake - dt * 1.8);
    const jolt = shake * shake * 0.04 * Math.sin(performance.now() * 0.09);
    // Round over: rise and pull back over the Fuse Core (eased over 1.4 s).
    const round = state.round, ended = round.phase === 'over' || round.phase === 'matchover';
    const t = ended ? Math.min(1, Math.max(0, (state.time - round.endedAt - 0.6) / 1.4)) : 0;
    if (t > 0) {
      const k = t * t * (3 - 2 * t), c = state.core;
      const away = Math.atan2(x - c.x, z - c.z);
      overview.set(c.x + Math.sin(away) * 15, c.y + 13, c.z + Math.cos(away) * 15);
      camera.position.lerp(overview, k);
      const dx = c.x - camera.position.x, dz = c.z - camera.position.z;
      yaw += wrapAngle(Math.atan2(-dx, -dz) - yaw) * k;
      pitch += (Math.atan2(c.y - camera.position.y, Math.hypot(dx, dz)) - pitch) * k;
    }
    camera.rotation.set(pitch + jolt, yaw + jolt * 0.7, 0);
    const w = who.slots[who.active]; // a scoped marksman rifle narrows the view
    const fov = who.scoped && w ? BASE_FOV * WEAPONS[w.id].scope : BASE_FOV;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();

    characters.update(alpha, dt, who.id, state.time);
    props.update(alpha, dt, who.id);
    effects.update(dt);
    vm.setVisible(who === state.player && who.alive && !who.scoped && t === 0);
    vm.update(dt, who, look, state.core.worker === who.id && state.core.progress > 0);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(vm.scene, vm.camera);
  }

  return { render, camera, canvas: renderer.domElement };
}
