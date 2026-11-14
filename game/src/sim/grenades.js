// Thrown grenades: a pool of bouncing projectiles; the frag bursts, the smoke blocks sight (smokeBlocks).
import { DT, GRENADES } from './config.js';
import { heightAt } from './collide.js';
import { eyeOf, blast } from './actors.js';
import { emit, EV } from './events.js';
import { noiseAt } from './senses.js';

const SPEED = 17, NADE_GRAVITY = 15, RADIUS = 0.08;
const SMOKE = GRENADES.smoke;
export const LOB = 0.6; // bots' throw pitch: they solve the launch speed for the range instead

export function createNades() {
  return Array.from({ length: 8 }, () => ({ live: false, kind: 'frag', owner: -1, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, fuse: 0 }));
}
export function createSmokes() { return Array.from({ length: 4 }, () => ({ live: false, x: 0, y: 0, z: 0, age: 0 })); }

// Throw `kind` along the actor's aim (weapons.js, on the throw command).
export function throwNade(state, a, kind) {
  const n = state.nades.find((g) => !g.live);
  if (a.grenades[kind] <= 0 || !n) return false;
  a.grenades[kind]--;
  const cp = Math.cos(a.pitch), fx = -Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch), fz = -Math.cos(a.yaw) * cp;
  n.live = true; n.kind = kind; n.owner = a.id; n.fuse = GRENADES[kind].fuse;
  n.x = n.px = a.pos.x + fx * 0.4; n.y = n.py = a.pos.y + eyeOf(a) - 0.1; n.z = n.pz = a.pos.z + fz * 0.4;
  const v = a.cmd.tossRange > 0 ? lobSpeed(a.cmd.tossRange) : SPEED;
  n.vx = fx * v + a.vel.x * 0.5; n.vy = fy * v + 2.5; n.vz = fz * v + a.vel.z * 0.5;
  emit(state.events, EV.THROW, a.id, -1, kind === 'frag' ? 0 : 1);
  return true;
}

// Launch speed for a lob to land about d metres away: bisect the ballistic range (released at eye
// height with the throw's upward boost), aiming a little before the bounce.
function lobSpeed(d) {
  let lo = 2, hi = SPEED;
  for (let i = 0; i < 16; i++) {
    const v = (lo + hi) / 2, up = Math.sin(LOB) * v + 2.5;
    const range = Math.cos(LOB) * v * (up + Math.sqrt(up * up + 2 * NADE_GRAVITY * 1.5)) / NADE_GRAVITY;
    if (range < d * 0.85) lo = v; else hi = v;
  }
  return lo;
}

const solid = (map, x, y, z) => heightAt(map, Math.floor(x / map.cell), Math.floor(z / map.cell)) > y - RADIUS;

export function updateNades(state) {
  const map = state.map;
  for (const n of state.nades) {
    if (!n.live) continue;
    n.px = n.x; n.py = n.y; n.pz = n.z;
    n.vy -= NADE_GRAVITY * DT;
    const nx = n.x + n.vx * DT;
    if (solid(map, nx, n.y, n.z)) { n.vx *= -0.45; n.vz *= 0.8; } else n.x = nx;
    const nz = n.z + n.vz * DT;
    if (solid(map, n.x, n.y, nz)) { n.vz *= -0.45; n.vx *= 0.8; } else n.z = nz;
    const floor = Math.max(0, heightAt(map, Math.floor(n.x / map.cell), Math.floor(n.z / map.cell))) + RADIUS;
    n.y += n.vy * DT;
    if (n.y < floor) {
      n.y = floor;
      if (n.vy < -2) {
        emit(state.events, EV.BOUNCE, n.owner).x = n.x;
        noiseAt(state, state.actors[n.owner].team, n.x, n.y, n.z, 'bounce');
      }
      n.vy = Math.abs(n.vy) < 1.5 ? 0 : -n.vy * 0.35;
      n.vx *= 0.75; n.vz *= 0.75;
    }
    if (n.y <= floor + 0.001) { n.vx *= 0.93; n.vz *= 0.93; } // rolling friction
    if ((n.fuse -= DT) <= 0) burst(state, n);
  }
  for (const s of state.smokes) if (s.live && (s.age += DT) > SMOKE.duration) s.live = false;
}

function burst(state, n) {
  n.live = false;
  const owner = state.actors[n.owner];
  if (n.kind === 'smoke') {
    const s = state.smokes.find((c) => !c.live) ?? state.smokes[0];
    s.live = true; s.x = n.x; s.y = n.y; s.z = n.z; s.age = 0;
    const e = emit(state.events, EV.SMOKE, n.owner);
    e.x = n.x; e.y = n.y; e.z = n.z;
    return;
  }
  const g = GRENADES.frag, e = emit(state.events, EV.BLAST, n.owner, -1, g.radius);
  e.x = n.x; e.y = n.y; e.z = n.z;
  noiseAt(state, owner.team, n.x, n.y, n.z, 'shot');
  blast(state, n.x, n.y, n.z, g.radius, g.damage, 0.6, owner, g);
}

// A cloud's radius now: it grows over 1.2 s and shrinks over its last 2 s (the view draws the same).
export function smokeRadius(s) {
  return SMOKE.radius * Math.min(1, s.age / 1.2) * Math.min(1, (SMOKE.duration - s.age) / 2);
}

// Does a live cloud (centred 1.2 m up) cut the segment between two points?
export function smokeBlocks(state, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dy * dy + dz * dz;
  for (const s of state.smokes) {
    if (!s.live) continue;
    const r = smokeRadius(s), cy = s.y + 1.2;
    const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (cy - ay) * dy + (s.z - az) * dz) / len2));
    if ((ax + dx * t - s.x) ** 2 + (ay + dy * t - cy) ** 2 + (az + dz * t - s.z) ** 2 < r * r) return true;
  }
  return false;
}
