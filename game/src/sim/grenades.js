// Thrown grenades: a pool of bouncing projectiles; the frag bursts, the smoke blocks sight (smokeBlocks).
import { DT, GRENADES, MOVE } from './config.js';
import { heightAt } from './collide.js';
import { eyeOf, blast } from './actors.js';
import { emit, EV } from './events.js';
import { noiseAt } from './senses.js';
import { yawTo } from './util.js';

const SPEED = 17, NADE_GRAVITY = 15, RADIUS = 0.08, BOOST = 2.5; // BOOST: the arm's lift
const HAND = MOVE.radius - 0.06; // within the body: a throw never starts in a wall
const SMOKE = GRENADES.smoke;
export const LOB = 0.6; // bots' throw pitch: they solve the launch speed for the range instead

const nade = () => ({ live: false, kind: 'frag', owner: -1, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, fuse: 0 });
const ghost = nade();
export function createNades() { return Array.from({ length: 8 }, nade); }
export function createSmokes() { return Array.from({ length: 4 }, () => ({ live: false, x: 0, y: 0, z: 0, age: 0 })); }

function launch(n, a, yaw, pitch, range) {
  const cp = Math.cos(pitch), fx = -Math.sin(yaw) * cp, fz = -Math.cos(yaw) * cp, v = range > 0 ? lobSpeed(range) : SPEED;
  n.x = n.px = a.pos.x + fx * HAND; n.y = n.py = a.pos.y + eyeOf(a) - 0.1; n.z = n.pz = a.pos.z + fz * HAND;
  n.vx = fx * v + a.vel.x * 0.5; n.vy = Math.sin(pitch) * v + BOOST; n.vz = fz * v + a.vel.z * 0.5;
}

export function throwNade(state, a, kind) {
  const n = state.nades.find((g) => !g.live);
  if (a.grenades[kind] <= 0 || !n) return false;
  a.grenades[kind]--;
  n.live = true; n.kind = kind; n.owner = a.id; n.fuse = GRENADES[kind].fuse;
  launch(n, a, a.yaw, a.pitch, a.cmd.tossRange);
  return true;
}

// Where a bot's frag lobbed at (x, z) bursts, bounces included: the same flight, run ahead.
export function predictBurst(state, a, x, z) {
  launch(ghost, a, yawTo(a.pos.x, a.pos.z, x, z), LOB, Math.hypot(x - a.pos.x, z - a.pos.z));
  for (let t = GRENADES.frag.fuse; t > 0; t -= DT) fly(state.map, ghost);
  return ghost;
}

// Launch speed for a lob to land a little before d metres (then it bounces on): bisect the ballistic range.
function lobSpeed(d) {
  let lo = 2, hi = SPEED;
  for (let i = 0; i < 16; i++) {
    const v = (lo + hi) / 2, up = Math.sin(LOB) * v + BOOST;
    const range = Math.cos(LOB) * v * (up + Math.sqrt(up * up + 2 * NADE_GRAVITY * 1.5)) / NADE_GRAVITY;
    if (range < d * 0.85) lo = v; else hi = v;
  }
  return lo;
}

const topAt = (map, x, z) => heightAt(map, Math.floor(x / map.cell), Math.floor(z / map.cell));

// One tick of flight; true on a landing hard enough to hear.
function fly(map, n) {
  n.px = n.x; n.py = n.y; n.pz = n.z;
  n.vy -= NADE_GRAVITY * DT;
  const nx = n.x + n.vx * DT;
  if (topAt(map, nx, n.z) > n.y - RADIUS) { n.vx *= -0.45; n.vz *= 0.8; } else n.x = nx;
  const nz = n.z + n.vz * DT;
  if (topAt(map, n.x, nz) > n.y - RADIUS) { n.vz *= -0.45; n.vx *= 0.8; } else n.z = nz;
  const floor = Math.max(0, topAt(map, n.x, n.z)) + RADIUS;
  n.y += n.vy * DT;
  const hard = n.y < floor && n.vy < -2;
  if (n.y < floor) {
    n.y = floor;
    n.vy = Math.abs(n.vy) < 1.5 ? 0 : -n.vy * 0.35;
    n.vx *= 0.75; n.vz *= 0.75;
  }
  if (n.y <= floor + 0.001) { n.vx *= 0.93; n.vz *= 0.93; } // rolling friction
  return hard;
}

export function updateNades(state) {
  for (const n of state.nades) {
    if (!n.live) continue;
    if (fly(state.map, n)) {
      emit(state.events, EV.BOUNCE, n.owner, -1, 0, 0, n.x, n.y, n.z);
      noiseAt(state, state.actors[n.owner].team, n.x, n.y, n.z, 'bounce');
    }
    if ((n.fuse -= DT) <= 0) burst(state, n);
  }
  for (const s of state.smokes) if (s.live && (s.age += DT) > SMOKE.duration) s.live = false;
}

function burst(state, n) {
  n.live = false;
  if (n.kind === 'smoke') {
    const s = state.smokes.find((c) => !c.live) ?? state.smokes[0];
    s.live = true; s.x = n.x; s.y = n.y; s.z = n.z; s.age = 0;
    return;
  }
  const g = GRENADES.frag, owner = state.actors[n.owner];
  emit(state.events, EV.BLAST, n.owner, -1, g.radius, 0, n.x, n.y, n.z);
  noiseAt(state, owner.team, n.x, n.y, n.z, 'shot');
  blast(state, n.x, n.y, n.z, g.radius, g.damage, g.armorPen, owner, g);
}

// A cloud's radius now (sight and the view's puffs): it grows over 1.2 s and shrinks over its last 2 s.
export function smokeRadius(s) {
  return SMOKE.radius * Math.min(1, s.age / 1.2) * Math.min(1, (SMOKE.duration - s.age) / 2);
}

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
