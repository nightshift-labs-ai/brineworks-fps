// Pooled combat effects, allocated once: tracers, decals, particles, flashes, blasts.
import * as THREE from 'three';
import { holeTexture, softDot, glow } from './textures.js';

const TRACERS = 48, DECALS = 160, PARTICLES = 400, FLASHES = 10, TRACER_SPEED = 260, STREAK = 5, NEAR_MISS = 2, CUT_BACK = 2.5, OWN_GAP = 1.5;
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0), HOT = new THREE.Color(0xf29e40), PALE = new THREE.Color(0xccb393); // pale at 0.6 (additive)

function instanced(scene, geo, mat, n) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  for (let i = 0; i < n; i++) m.setMatrixAt(i, HIDE);
  scene.add(m);
  return m;
}

export function createEffects(scene) {
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  // Tracers: a unit box along +z, stretched into a streak.
  const tracerMesh = instanced(scene, new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), TRACERS);
  tracerMesh.setColorAt(0, HOT); // colours from the start: no shader rebuild at the first shot
  const tracers = Array.from({ length: TRACERS }, () => ({ live: false, o: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0 }));
  const decalMesh = instanced(scene, new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), DECALS);
  const pPos = new Float32Array(PARTICLES * 3), pCol = new Float32Array(PARTICLES * 4), pVel = new Float32Array(PARTICLES * 3);
  const pLife = new Float32Array(PARTICLES), pMax = new Float32Array(PARTICLES);
  const pGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 4));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.12, map: softDot(), vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false;
  scene.add(points);
  const flashMat = glow(0xd99a4c);
  const flashes = Array.from({ length: FLASHES }, () => { const sp = new THREE.Sprite(flashMat); sp.visible = false; sp.scale.setScalar(0.3); scene.add(sp); return { sprite: sp, life: 0 }; });
  const blastSprite = new THREE.Sprite(glow(0xffc070)), blastLight = new THREE.PointLight(0xff9a40, 0, 30);
  blastSprite.visible = false;
  scene.add(blastSprite, blastLight);
  let nextTracer = 0, nextDecal = 0, nextParticle = 0, nextFlash = 0, blastLife = 0, blastSize = 0;

  // Off the lens: one passing within NEAR_MISS m of the eye ends CUT_BACK m before that point (k); the viewer's own starts OWN_GAP m out.
  function spawnTracer(o, x1, y1, z1, eye, own) {
    const from = own ? OWN_GAP : 0;
    let len = s.set(x1 - o.x, y1 - o.y, z1 - o.z).length();
    const k = Math.min(len, v.subVectors(eye, o).dot(s.divideScalar(len)));
    if (!own && k > 0 && v.addScaledVector(s, -k).length() < NEAR_MISS) len = k - CUT_BACK;
    if ((len -= from) < 0.5) return;
    const t = tracers[nextTracer];
    t.o.copy(o).addScaledVector(t.dir.copy(s), from); t.len = len; t.t = 0; t.live = true;
    tracerMesh.setColorAt(nextTracer, own ? PALE : HOT);
    nextTracer = (nextTracer + 1) % TRACERS;
  }

  // A bullet hole on the struck face, or (size ~25) a blast scorch.
  function spawnDecal(x, y, z, nx, ny, nz, size = 1) {
    q.setFromUnitVectors(zAxis, v.set(nx, ny, nz));
    s.setScalar(size * (0.7 + ((nextDecal * 7919) % 100) / 160));
    mat4.compose(v.set(x + nx * 0.004, y + ny * 0.004 + (size > 1 ? 0.01 : 0), z + nz * 0.004), q, s);
    decalMesh.setMatrixAt(nextDecal, mat4);
    decalMesh.instanceMatrix.needsUpdate = true;
    nextDecal = (nextDecal + 1) % DECALS;
  }

  function spawnParticles(x, y, z, nx, ny, nz, count, r, g, b, speed) {
    for (let k = 0; k < count; k++) {
      const i = nextParticle, p = i * 3, c = i * 4, j = (k * 0.618 + i * 0.137) % 1, h = ((k + 1) * 0.381 + i * 0.071) % 1;
      nextParticle = (nextParticle + 1) % PARTICLES;
      pPos[p] = x; pPos[p + 1] = y; pPos[p + 2] = z;
      pVel[p] = (nx + (j - 0.5) * 1.4) * speed; pVel[p + 1] = (ny + h * 0.9) * speed; pVel[p + 2] = (nz + (h - j) * 1.4) * speed;
      pCol[c] = r; pCol[c + 1] = g; pCol[c + 2] = b; pCol[c + 3] = 1;
      pLife[i] = pMax[i] = 0.35 + j * 0.5;
    }
  }

  function spawnFlash(x, y, z) {
    const f = flashes[nextFlash];
    nextFlash = (nextFlash + 1) % FLASHES;
    f.sprite.position.set(x, y, z);
    f.sprite.visible = true;
    f.life = 0.05;
  }

  function spawnBlast(x, y, z, radius) {
    blastSprite.position.set(x, y + 0.6, z);
    blastLight.position.set(x, y + 1.5, z);
    blastLife = 0.45; blastSize = radius * 0.9;
    spawnParticles(x, y + 0.3, z, 0, 1, 0, 50, 1, 0.6, 0.2, 7);
    spawnParticles(x, y + 0.2, z, 0, 0.6, 0, 40, 0.18, 0.17, 0.16, 5);
    spawnDecal(x, 0, z, 0, 1, 0, 25);
  }

  function update(dt) {
    if (blastLife > 0) {
      const k = Math.max(0, (blastLife -= dt) / 0.45);
      blastSprite.visible = k > 0;
      blastSprite.scale.setScalar(blastSize * (1.4 - k * 0.6));
      blastSprite.material.opacity = k;
      blastLight.intensity = k * 60;
    }
    for (let i = 0; i < TRACERS; i++) {
      const t = tracers[i];
      if (!t.live) continue;
      t.t += dt * TRACER_SPEED;
      const head = Math.min(t.len, t.t), tail = Math.max(0, t.t - STREAK);
      if (tail >= t.len) { t.live = false; tracerMesh.setMatrixAt(i, HIDE); continue; }
      q.setFromUnitVectors(zAxis, t.dir);
      mat4.compose(v.copy(t.o).addScaledVector(t.dir, tail), q, s.set(0.014, 0.014, Math.max(0.01, head - tail)));
      tracerMesh.setMatrixAt(i, mat4);
    }
    tracerMesh.instanceMatrix.needsUpdate = tracerMesh.instanceColor.needsUpdate = true;
    for (let i = 0; i < PARTICLES; i++) {
      if (pLife[i] <= 0) continue;
      const p = i * 3;
      pLife[i] -= dt;
      pVel[p + 1] -= 6 * dt;
      pPos[p] += pVel[p] * dt;
      pPos[p + 1] = Math.max(0.02, pPos[p + 1] + pVel[p + 1] * dt);
      pPos[p + 2] += pVel[p + 2] * dt;
      pCol[i * 4 + 3] = Math.max(0, pLife[i] / pMax[i]);
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = true;
    for (const f of flashes) if (f.life > 0) f.sprite.visible = (f.life -= dt) > 0;
  }

  function clearDecals() {
    for (let i = 0; i < DECALS; i++) decalMesh.setMatrixAt(i, HIDE);
    decalMesh.instanceMatrix.needsUpdate = true;
  }

  return { spawnTracer, spawnDecal, spawnParticles, spawnFlash, spawnBlast, update, clearDecals };
}
