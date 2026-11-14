// Thrown grenades: a small pool of bouncing projectiles. The frag bursts after its fuse and hurts
// everyone in the open within its radius; the smoke canister fills a sphere that blocks sight
// (senses.js asks smokeBlocks) for a while. Bounces use the same map columns as everything else.
import { DT, GRENADES } from './config.js';
import { heightAt, clearLine } from './collide.js';
import { eyeOf, hurt } from './actors.js';
import { emit, EV } from './events.js';
import { noiseAt } from './senses.js';

const SPEED = 17, NADE_GRAVITY = 15, RADIUS = 0.08;
export const NADE_SLOTS = ['frag', 'smoke'];

export function createNades() {
  return Array.from({ length: 8 }, () => ({ live: false, kind: 'frag', owner: -1, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, fuse: 0 }));
}
export function createSmokes() {
  return Array.from({ length: 4 }, () => ({ live: false, x: 0, y: 0, z: 0, age: 0 }));
}

// Throw `kind` along the actor's aim (called from weapons.js on the throw command).
export function throwNade(state, a, kind) {
  if (a.grenades[kind] <= 0) return false;
  const n = state.nades.find((g) => !g.live);
  if (!n) return false;
  a.grenades[kind]--;
  const cp = Math.cos(a.pitch);
  const fx = -Math.sin(a.yaw) * cp, fy = Math.sin(a.pitch), fz = -Math.cos(a.yaw) * cp;
  n.live = true; n.kind = kind; n.owner = a.id; n.fuse = GRENADES[kind].fuse;
  n.x = n.px = a.pos.x + fx * 0.4; n.y = n.py = a.pos.y + eyeOf(a) - 0.1; n.z = n.pz = a.pos.z + fz * 0.4;
  const v = a.cmd.tossRange > 0 ? lobSpeed(a.cmd.tossRange) : SPEED; // bots lob to a range
  n.vx = fx * v + a.vel.x * 0.5; n.vy = fy * v + 2.5; n.vz = fz * v + a.vel.z * 0.5;
  emit(state.events, EV.THROW, a.id, -1, NADE_SLOTS.indexOf(kind));
  return true;
}

// A lob's launch speed so it lands about d metres away: bisect the ballistic range at pitch LOB
// (released at eye height with the throw's upward boost), aiming a little short of the bounce.
export const LOB = 0.6;
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
    n.fuse -= DT;
    if (n.fuse <= 0) burst(state, n);
  }
  for (const s of state.smokes) if (s.live && (s.age += DT) > GRENADES.smoke.duration) s.live = false;
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
  const g = GRENADES.frag;
  const e = emit(state.events, EV.BLAST, n.owner, -1, g.radius);
  e.x = n.x; e.y = n.y; e.z = n.z;
  noiseAt(state, owner.team, n.x, n.y, n.z, 'shot');
  for (const a of state.actors) {
    const d = Math.hypot(a.pos.x - n.x, a.pos.y + 0.9 - n.y, a.pos.z - n.z);
    if (!a.alive || d > g.radius || !clearLine(state.map, n.x, n.y + 0.2, n.z, a.pos.x, a.pos.y + 0.9, a.pos.z)) continue;
    hurt(state, a, owner, g.damage * (1 - d / g.radius), 0.6, 2, g, n.x, n.z);
  }
}

// Does an active smoke cloud cut the segment between two points? (2D test at cloud height.)
export function smokeBlocks(state, ax, ay, az, bx, by, bz) {
  for (const s of state.smokes) {
    if (!s.live) continue;
    const r = GRENADES.smoke.radius * Math.min(1, s.age / 1.2) * (s.age > GRENADES.smoke.duration - 2 ? (GRENADES.smoke.duration - s.age) / 2 : 1);
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.y + 1.2 - ay) * dy + (s.z - az) * dz) / len2));
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y - 1.2, pz = az + dz * t - s.z;
    if (px * px + py * py + pz * pz < r * r) return true;
  }
  return false;
}

