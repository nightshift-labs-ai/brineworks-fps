// Pooled combat effects, all allocated once: travelling tracer streaks (one instanced mesh),
// bullet-hole decals (instanced, recycled oldest-first), dust and hit particles (one Points
// cloud) and third-person muzzle flashes (a few sprites). spawn* functions only rewrite slots.
import * as THREE from 'three';
import { holeTexture, softDot } from './textures.js';

const TRACERS = 48, DECALS = 160, PARTICLES = 360, FLASHES = 10;
const TRACER_SPEED = 260, STREAK = 5;

export function createEffects(scene) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1), color = new THREE.Color();

  // Tracers: a unit box along +z, scaled into a thin streak between two points along the shot.
  const tracerMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    TRACERS,
  );
  tracerMesh.frustumCulled = false;
  const tracers = Array.from({ length: TRACERS }, () => ({ live: false, ox: 0, oy: 0, oz: 0, dir: new THREE.Vector3(), len: 0, t: 0 }));
  let nextTracer = 0;
  const hideMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < TRACERS; i++) { tracerMesh.setMatrixAt(i, hideMatrix); tracerMesh.setColorAt(i, color.setRGB(0.95, 0.62, 0.25)); }
  scene.add(tracerMesh);

  // Decals: bullet holes laid flat on the struck face.
  const decalMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.13, 0.13),
    new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    DECALS,
  );
  decalMesh.frustumCulled = false;
  for (let i = 0; i < DECALS; i++) decalMesh.setMatrixAt(i, hideMatrix);
  let nextDecal = 0;
  scene.add(decalMesh);

  // Particles: dust off walls, dark spray off bodies. Colour alpha fades with life.
  const pPos = new Float32Array(PARTICLES * 3), pCol = new Float32Array(PARTICLES * 4);
  const pVel = new Float32Array(PARTICLES * 3), pLife = new Float32Array(PARTICLES), pMax = new Float32Array(PARTICLES);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 4));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.11, map: softDot(), vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  let nextParticle = 0;
  scene.add(points);

  // Third-person muzzle flashes.
  const flashMat = new THREE.SpriteMaterial({ map: softDot(), color: 0xffb860, blending: THREE.AdditiveBlending, depthWrite: false });
  const flashes = Array.from({ length: FLASHES }, () => {
    const sp = new THREE.Sprite(flashMat);
    sp.visible = false;
    sp.scale.setScalar(0.45);
    scene.add(sp);
    return { sprite: sp, life: 0 };
  });
  let nextFlash = 0;

  function spawnTracer(x0, y0, z0, x1, y1, z1) {
    const t = tracers[nextTracer];
    nextTracer = (nextTracer + 1) % TRACERS;
    t.ox = x0; t.oy = y0; t.oz = z0;
    t.dir.set(x1 - x0, y1 - y0, z1 - z0);
    t.len = t.dir.length();
    if (t.len < 0.5) return;
    t.dir.multiplyScalar(1 / t.len);
    t.t = 0;
    t.live = true;
  }

  function spawnDecal(x, y, z, nx, ny, nz) {
    v.set(nx, ny, nz);
    q.setFromUnitVectors(zAxis, v);
    s.setScalar(0.7 + ((nextDecal * 7919) % 100) / 160);
    m4.compose(v.set(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004), q, s);
    decalMesh.setMatrixAt(nextDecal, m4);
    decalMesh.instanceMatrix.needsUpdate = true;
    nextDecal = (nextDecal + 1) % DECALS;
  }

  function spawnParticles(x, y, z, nx, ny, nz, count, r, g, b, speed) {
    for (let k = 0; k < count; k++) {
      const i = nextParticle;
      nextParticle = (nextParticle + 1) % PARTICLES;
      const j = (k * 0.618 + i * 0.137) % 1, h = ((k + 1) * 0.381 + i * 0.071) % 1;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      pVel[i * 3] = (nx + (j - 0.5) * 1.4) * speed;
      pVel[i * 3 + 1] = (ny + h * 0.9) * speed;
      pVel[i * 3 + 2] = (nz + (h - j) * 1.4) * speed;
      pCol[i * 4] = r; pCol[i * 4 + 1] = g; pCol[i * 4 + 2] = b; pCol[i * 4 + 3] = 1;
      pLife[i] = pMax[i] = 0.35 + j * 0.4;
    }
  }

  function spawnFlash(x, y, z) {
    const f = flashes[nextFlash];
    nextFlash = (nextFlash + 1) % FLASHES;
    f.sprite.position.set(x, y, z);
    f.sprite.visible = true;
    f.life = 0.05;
  }

  function update(dt) {
    for (let i = 0; i < TRACERS; i++) {
      const t = tracers[i];
      if (!t.live) continue;
      t.t += dt * TRACER_SPEED;
      const head = Math.min(t.len, t.t), tail = Math.max(0, t.t - STREAK);
      if (tail >= t.len) { t.live = false; tracerMesh.setMatrixAt(i, hideMatrix); continue; }
      v.set(t.ox + t.dir.x * tail, t.oy + t.dir.y * tail, t.oz + t.dir.z * tail);
      q.setFromUnitVectors(zAxis, t.dir);
      s.set(0.014, 0.014, Math.max(0.01, head - tail));
      m4.compose(v, q, s);
      tracerMesh.setMatrixAt(i, m4);
    }
    tracerMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < PARTICLES; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      pVel[i * 3 + 1] -= 6 * dt;
      pPos[i * 3] += pVel[i * 3] * dt;
      pPos[i * 3 + 1] = Math.max(0.02, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt);
      pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pCol[i * 4 + 3] = Math.max(0, pLife[i] / pMax[i]);
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.sprite.visible = f.life > 0;
    }
  }

  function clearDecals() {
    for (let i = 0; i < DECALS; i++) decalMesh.setMatrixAt(i, hideMatrix);
    decalMesh.instanceMatrix.needsUpdate = true;
  }

  return { spawnTracer, spawnDecal, spawnParticles, spawnFlash, update, clearDecals };
}
