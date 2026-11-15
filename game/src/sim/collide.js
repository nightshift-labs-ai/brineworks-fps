// Collision and sight on the map grid: solids are columns on cells; bodies sweep axis by axis, rays walk the grid.
import { MOVE } from './config.js';

const OUTSIDE = 99;

export function heightAt(map, c, r) {
  return c < 0 || r < 0 || c >= map.w || r >= map.h ? OUTSIDE : map.height[r * map.w + c];
}

function groundUnder(map, x, z, half) {
  const inv = 1 / map.cell;
  const c0 = Math.floor((x - half) * inv), c1 = Math.floor((x + half) * inv);
  const r0 = Math.floor((z - half) * inv), r1 = Math.floor((z + half) * inv);
  let top = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) top = Math.max(top, heightAt(map, c, r));
  return top;
}

// Move along x or z, stopping at columns over `climb` above the feet; returns the top to step onto (-1: none).
function sweepAxis(map, body, alongX, delta, climb) {
  const r = MOVE.radius, inv = 1 / map.cell, p = body.pos, next = (alongX ? p.x : p.z) + delta;
  const x = alongX ? next : p.x, z = alongX ? p.z : next;
  const c0 = Math.floor((x - r) * inv), c1 = Math.floor((x + r) * inv);
  const r0 = Math.floor((z - r) * inv), r1 = Math.floor((z + r) * inv);
  let limit = next, step = -1;
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const top = heightAt(map, col, row);
      if (top <= p.y + 0.001) continue;
      if (top <= p.y + climb) { step = Math.max(step, top); continue; }
      const lo = (alongX ? col : row) * map.cell;
      if (delta > 0) limit = Math.min(limit, lo - r - 0.001);
      else if (delta < 0) limit = Math.max(limit, lo + map.cell + r + 0.001);
    }
  }
  if (alongX) p.x = limit; else p.z = limit;
  if (limit !== next) { if (alongX) body.vel.x = 0; else body.vel.z = 0; }
  return step;
}

export function moveBody(map, body, dt) {
  const climb = body.grounded ? MOVE.stepHeight : 0;
  const step = Math.max(sweepAxis(map, body, true, body.vel.x * dt, climb), sweepAxis(map, body, false, body.vel.z * dt, climb));
  if (step > body.pos.y) body.pos.y = step;
  body.pos.y += body.vel.y * dt;
  const ground = groundUnder(map, body.pos.x, body.pos.z, MOVE.radius);
  const snap = body.grounded && body.vel.y <= 0 ? MOVE.stepHeight : 0; // follow stairs down
  body.grounded = body.pos.y <= ground + snap;
  if (body.grounded) {
    body.pos.y = ground;
    if (body.vel.y < 0) body.vel.y = 0;
  }
}

export function nudgeBody(map, body, dx, dz) {
  sweepAxis(map, body, true, dx, 0);
  sweepAxis(map, body, false, dz, 0);
}

// Amanatides & Woo grid walk: fills `hit` (t, point, normal); true on a hit within maxT.
export function raycast(map, ox, oy, oz, dx, dy, dz, maxT, hit) {
  const size = map.cell;
  let c = Math.floor(ox / size), r = Math.floor(oz / size);
  const stepC = dx > 0 ? 1 : -1, stepR = dz > 0 ? 1 : -1, deltaC = Math.abs(size / dx), deltaR = Math.abs(size / dz);
  let nextC = dx !== 0 ? ((dx > 0 ? (c + 1) * size - ox : ox - c * size) / Math.abs(dx)) : Infinity;
  let nextR = dz !== 0 ? ((dz > 0 ? (r + 1) * size - oz : oz - r * size) / Math.abs(dz)) : Infinity;
  const tFloor = dy < 0 ? -oy / dy : Infinity, limit = Math.min(maxT, tFloor);
  let t = 0, nx = 0, nz = 0;
  while (t <= limit) {
    const top = heightAt(map, c, r);
    if (top > 0) {
      if (oy + dy * t < top) return fillHit(hit, t, ox, oy, oz, dx, dy, dz, nx, 0, nz);
      if (oy + dy * Math.min(nextC, nextR, limit) < top) return fillHit(hit, (top - oy) / dy, ox, oy, oz, dx, dy, dz, 0, 1, 0);
    }
    if (nextC < nextR) { t = nextC; nextC += deltaC; c += stepC; nx = -stepC; nz = 0; }
    else { t = nextR; nextR += deltaR; r += stepR; nz = -stepR; nx = 0; }
  }
  if (tFloor <= maxT) return fillHit(hit, tFloor, ox, oy, oz, dx, dy, dz, 0, 1, 0);
  hit.t = maxT;
  return false;
}

function fillHit(hit, t, ox, oy, oz, dx, dy, dz, nx, ny, nz) {
  hit.t = t; hit.x = ox + dx * t; hit.y = oy + dy * t; hit.z = oz + dz * t;
  hit.nx = nx; hit.ny = ny; hit.nz = nz;
  return true;
}

const losHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
export function clearLine(map, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  return len < 1e-4 || !raycast(map, ax, ay, az, dx / len, dy / len, dz / len, len, losHit);
}

// Ray vs finite vertical cylinder: side interval clipped by the y slab (caps count); distance or -1.
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, radius, y0, y1) {
  const px = ox - cx, pz = oz - cz, a = dx * dx + dz * dz;
  let tIn = -Infinity, tOut = Infinity;
  if (a > 1e-12) {
    const b = px * dx + pz * dz, disc = b * b - a * (px * px + pz * pz - radius * radius);
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    tIn = (-b - s) / a; tOut = (-b + s) / a;
  } else if (px * px + pz * pz > radius * radius) return -1;
  if (dy !== 0) {
    const ta = (y0 - oy) / dy, tb = (y1 - oy) / dy;
    tIn = Math.max(tIn, Math.min(ta, tb)); tOut = Math.min(tOut, Math.max(ta, tb));
  } else if (oy < y0 || oy > y1) return -1;
  return tIn > tOut || tOut < 0 ? -1 : Math.max(0, tIn);
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const px = ox - cx, py = oy - cy, pz = oz - cz, b = px * dx + py * dy + pz * dz;
  const disc = b * b - (px * px + py * py + pz * pz - radius * radius);
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}
