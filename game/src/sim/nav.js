// Bot navigation: A* over map cells (8-way, no corner cutting, stairs yes, crates no), then string-pulling.
import { CELL } from './map.js';
import { MOVE } from './config.js';

const MAX_POINTS = 96;
const DIRS = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 1, 1, 1.4142, 1, -1, 1.4142, -1, 1, 1.4142, -1, -1, 1.4142]; // dc, dr, cost

// Search scratch, allocated once per map size (buffers, not game state).
const S = { w: 0, size: 0, gen: 0, gc: 0, gr: 0 };
function scratch(map) {
  if (S.w === map.w && S.size === map.w * map.h) return;
  const n = S.size = map.w * map.h;
  S.w = map.w;
  S.g = new Float32Array(n); S.f = new Float32Array(n); S.parent = new Int32Array(n);
  S.heap = new Int32Array(n); S.pos = new Int32Array(n); S.closed = new Uint8Array(n); S.stamp = new Uint32Array(n);
}

export function createPath() { return { xs: new Float32Array(MAX_POINTS), zs: new Float32Array(MAX_POINTS), length: 0, index: 0 }; }

function swap(i, j) { const h = S.heap, t = h[i]; h[i] = h[j]; h[j] = t; S.pos[h[i]] = i; S.pos[h[j]] = j; }
function heapUp(i) {
  for (let p = (i - 1) >> 1; i > 0 && S.f[S.heap[p]] > S.f[S.heap[i]]; i = p, p = (i - 1) >> 1) swap(i, p);
}
function heapPush(n, count) { S.heap[count] = n; S.pos[n] = count; heapUp(count); }
function heapPop(count) {
  const h = S.heap, f = S.f, top = h[0];
  h[0] = h[count - 1]; S.pos[h[0]] = 0;
  for (let i = 0; ;) {
    const l = i * 2 + 1, r = l + 1;
    let m = i;
    if (l < count - 1 && f[h[l]] < f[h[m]]) m = l;
    if (r < count - 1 && f[h[r]] < f[h[m]]) m = r;
    if (m === i) return top;
    swap(i, m); i = m;
  }
}

// Octile distance to the goal.
function estimate(n) {
  const dc = Math.abs(n % S.w - S.gc), dr = Math.abs(((n / S.w) | 0) - S.gr);
  return Math.max(dc, dr) + 0.4142 * Math.min(dc, dr);
}

const passable = (map, from, to) => map.walk[to] === 1 && map.height[to] - map.height[from] <= MOVE.stepHeight;
const inside = (map, c, r) => c >= 0 && r >= 0 && c < map.w && r < map.h;
const cellX = (n) => (n % S.w + 0.5) * CELL, cellZ = (n) => (((n / S.w) | 0) + 0.5) * CELL; // a cell's centre

// Index of the walkable cell nearest (x, z); -1: none within 3 cells.
export function nearestWalkable(map, x, z) {
  const c = Math.floor(x / CELL), r = Math.floor(z / CELL);
  for (let rad = 0; rad < 4; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
    const cc = c + dc, rr = r + dr;
    if (inside(map, cc, rr) && map.walk[rr * map.w + cc]) return rr * map.w + cc;
  }
  return -1;
}

// Fills `path` with points from (fx, fz) to (tx, tz); false when there is no route.
export function findPath(map, fx, fz, tx, tz, path) {
  scratch(map);
  const W = map.w, { g, f, parent, heap, pos, closed, stamp } = S;
  const start = nearestWalkable(map, fx, fz), goal = nearestWalkable(map, tx, tz);
  path.length = 0; path.index = 0;
  if (start < 0 || goal < 0) return false;
  const gen = ++S.gen;
  S.gc = goal % W; S.gr = (goal / W) | 0;
  stamp[start] = gen; g[start] = 0; f[start] = estimate(start); parent[start] = -1; closed[start] = 0;
  let count = 0, found = false;
  heapPush(start, count++);
  while (count > 0) {
    const n = heapPop(count--);
    if (n === goal) { found = true; break; }
    closed[n] = 1;
    const c = n % W, r = (n / W) | 0;
    for (let d = 0; d < DIRS.length; d += 3) {
      const dc = DIRS[d], dr = DIRS[d + 1], cc = c + dc, rr = r + dr, m = rr * W + cc;
      if (!inside(map, cc, rr) || !passable(map, n, m) || (dc && dr && (!passable(map, n, r * W + cc) || !passable(map, n, rr * W + c)))) continue;
      if (stamp[m] !== gen) { stamp[m] = gen; closed[m] = 0; g[m] = Infinity; pos[m] = -1; }
      const cost = g[n] + DIRS[d + 2];
      if (closed[m] || cost >= g[m]) continue;
      g[m] = cost; f[m] = cost + estimate(m); parent[m] = n;
      if (pos[m] >= 0 && pos[m] < count && heap[pos[m]] === m) heapUp(pos[m]);
      else heapPush(m, count++);
    }
  }
  if (!found) return false;
  // Parents into the (now free) heap buffer, then pull the string: jump to the farthest cell in a straight walkable line.
  let n = goal, k = 0;
  while (n >= 0 && k < S.size) { heap[k++] = n; n = parent[n]; }
  let x = fx, z = fz, i = k - 1;
  while (i >= 0 && path.length < MAX_POINTS) {
    let j = 0;
    for (; j < i; j++) if (walkableLine(map, x, z, cellX(heap[j]), cellZ(heap[j]))) break;
    x = cellX(heap[j]); z = cellZ(heap[j]);
    path.xs[path.length] = x; path.zs[path.length] = z; path.length++;
    i = j - 1;
  }
  const end = map.walk[Math.floor(tz / CELL) * W + Math.floor(tx / CELL)];
  path.xs[path.length - 1] = end ? tx : cellX(goal);
  path.zs[path.length - 1] = end ? tz : cellZ(goal);
  return true;
}

// A body-wide straight walkable line, never climbing over a step between samples (the deck only by the stairs).
function walkableLine(map, ax, az, bx, bz) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.35), r = MOVE.radius + 0.08;
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    let top = 0;
    for (let k = 0; k < 4; k++) {
      const c = Math.floor((x + (k & 1 ? r : -r)) / CELL), rr = Math.floor((z + (k & 2 ? r : -r)) / CELL);
      if (!inside(map, c, rr) || !map.walk[rr * map.w + c]) return false;
      top = Math.max(top, map.height[rr * map.w + c]);
    }
    if (last >= 0 && top - last > MOVE.stepHeight) return false;
    last = top;
  }
  return true;
}
