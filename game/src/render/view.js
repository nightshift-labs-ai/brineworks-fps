// The renderer: reads state (never writes it), interpolates bodies, turns events into effects.
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
import { wrapAngle } from '../sim/util.js';
import { raycast } from '../sim/collide.js';

const BASE_FOV = 74;

export function createView(state, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(PALETTE.haze, 28, 165);
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 600);
  camera.rotation.order = 'YXZ';

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  const sun = new THREE.DirectionalLight(PALETTE.sun, 5.2), map = state.map;
  sun.position.set(map.width / 2 - 60, 46, map.depth / 2 + 25); // 35 degrees up, west-south-west
  sun.target.position.set(map.width / 2, 0, map.depth / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 36, bottom: -36, near: 10, far: 170 });
  Object.assign(sun.shadow, { bias: -0.0004, normalBias: 0.03 });
  const disc = new THREE.Sprite(glow(0xffd9a0));
  disc.position.copy(sun.position).sub(sun.target.position).normalize().multiplyScalar(380).add(sun.target.position);
  disc.scale.setScalar(70);
  scene.add(sky, new THREE.HemisphereLight(PALETTE.skyLight, PALETTE.groundLight, 1.35), sun, sun.target, disc);
  const vm = createViewModel();
  scene.environment = vm.scene.environment = new THREE.PMREMGenerator(renderer).fromScene(scene, 0.03, 1, 1000).texture; // sky and sun, before the level
  scene.environmentIntensity = vm.scene.environmentIntensity = 0.8;

  scene.add(buildLevel(map, createTextures()));
  const characters = createCharacters(scene, state), effects = createEffects(scene), props = createProps(scene, state);
  const muzzle = new THREE.Vector3(), overview = new THREE.Vector3(), hit = {};
  let shake = 0, cursor = state.events.head;

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
    if (!p.alive) for (const a of state.actors) if (a.alive && a.team === p.team) return a;
    return p;
  }

  function onEvent(e) {
    const p = state.player, t = e.type;
    if (t === EV.SHOT) {
      const own = e.a === p.id && p.alive;
      if (own) {
        vm.muzzleWorld(camera, muzzle);
        vm.fired();
      } else {
        const yaw = state.actors[e.a].yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        muzzle.set(e.x + (fx * 0.75 - fz * 0.18), e.y - 0.38, e.z + (fz * 0.75 + fx * 0.18));
        effects.spawnFlash(muzzle.x, muzzle.y, muzzle.z);
      }
      effects.spawnTracer(muzzle, e.x2, e.y2, e.z2, camera.position, own);
    } else if (t === EV.IMPACT) {
      effects.spawnDecal(e.x, e.y, e.z, e.x2, e.y2, e.z2);
      effects.spawnParticles(e.x, e.y, e.z, e.x2, e.y2, e.z2, 6, 0.85, 0.78, 0.66, 2.2);
    } else if (t === EV.HIT) {
      const v = state.actors[e.b].pos;
      effects.spawnParticles(v.x, v.y + (e.w === 1 ? 1.6 : e.w === 2 ? 1.2 : 0.5), v.z, 0, 0.3, 0, e.w === 1 ? 10 : 6, 0.55, 0.08, 0.06, 1.6);
    } else if (t === EV.ROUND && e.v === 0) effects.clearDecals();
    else if (t === EV.BLAST) {
      effects.spawnBlast(e.x, e.y, e.z, e.v);
      shake = Math.max(shake, 1 - Math.hypot(e.x - camera.position.x, e.z - camera.position.z) / (e.v * 3));
    } else if (t === EV.CORE && e.v === 2) props.beep();
  }

  function render(alpha, dt, look) {
    const who = viewer(), cam = camera.position.copy(who.prev).lerp(who.pos, alpha);
    cam.y += eyeOf(who);
    // Own view: the freshest mouse look, recoil punch on top.
    const aim = who === state.player ? look : who;
    let yaw = aim.yaw + who.punchYaw, pitch = aim.pitch + who.punchPitch;
    shake = Math.max(0, shake - dt * 1.8);
    const jolt = shake * shake * 0.04 * Math.sin(performance.now() * 0.09);
    // Round over: a 3/4 view of the Fuse Core from the viewer's side, clear of any wall.
    const round = state.round, ended = round.phase === 'over' || round.phase === 'matchover';
    const t = ended ? Math.min(1, Math.max(0, (state.time - round.endedAt - 0.6) / 1.4)) : 0;
    if (t > 0) {
      const k = t * t * (3 - 2 * t), c = state.core, away = Math.atan2(cam.x - c.x, cam.z - c.z), sx = Math.sin(away) * 0.8, sz = Math.cos(away) * 0.8;
      raycast(map, c.x, c.y + 1.5, c.z, sx, 0.6, sz, 7, hit);
      const d = hit.t - 0.3;
      cam.lerp(overview.set(c.x + sx * d, c.y + 1.5 + 0.6 * d, c.z + sz * d), k);
      const dx = c.x - cam.x, dz = c.z - cam.z;
      yaw += wrapAngle(Math.atan2(-dx, -dz) - yaw) * k;
      pitch += (Math.atan2(c.y - cam.y, Math.hypot(dx, dz)) + 0.25 - pitch) * k; // the core below the scoreboard
    }
    camera.rotation.set(pitch + jolt, yaw + jolt * 0.7, 0);
    const w = who.slots[who.active], fov = who.scoped && w ? BASE_FOV * WEAPONS[w.id].scope : BASE_FOV;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    cursor = drain(state.events, cursor, onEvent); // after the camera moves: tracers clip against this eye

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
