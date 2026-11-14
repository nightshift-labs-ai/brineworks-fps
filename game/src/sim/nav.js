// Bot navigation: A* over map cells (8-way, no corner cutting, stairs yes, crates no), then string-pulling.
import { CELL } from './map.js';
import { MOVE } from './config.js';

const MAX_POINTS = 96;
const DIRS = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 1, 1, 1.4142, 1, -1, 1.4142, -1, 1, 1.4142, -1, -1, 1.4142]; // dc, dr, cost

// Reusable search scratch, allocated once per map size (search buffers, not game state).
const S = { w: 0, size: 0, gen: 0, g: null, f: null, parent: null, heap: null, pos: null, closed: null, stamp: null, gc: 0, gr: 0 };
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

function nearestWalkable(map, c, r) {
  for (let rad = 0; rad < 4; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < map.w && rr < map.h && map.walk[rr * map.w + cc]) return rr * map.w + cc;
    }
  }
  return -1;
}

// Fill `path` with world points from (fx, fz) to (tx, tz); false when there is no route.
export function findPath(map, fx, fz, tx, tz, path) {
  scratch(map);
  const W = map.w, { g, f, parent, heap, pos, closed, stamp } = S;
  const start = nearestWalkable(map, Math.floor(fx / CELL), Math.floor(fz / CELL));
  const goal = nearestWalkable(map, Math.floor(tx / CELL), Math.floor(tz / CELL));
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
      const dc = DIRS[d], dr = DIRS[d + 1], cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= map.w || rr >= map.h) continue;
      const m = rr * W + cc;
      if (!passable(map, n, m) || (dc && dr && (!passable(map, n, r * W + cc) || !passable(map, n, rr * W + c)))) continue;
      if (stamp[m] !== gen) { stamp[m] = gen; closed[m] = 0; g[m] = Infinity; pos[m] = -1; }
      const cost = g[n] + DIRS[d + 2];
      if (closed[m] || cost >= g[m]) continue;
      g[m] = cost; f[m] = cost + estimate(m); parent[m] = n;
      if (pos[m] >= 0 && pos[m] < count && heap[pos[m]] === m) heapUp(pos[m]);
      else heapPush(m, count++);
    }
  }
  if (!found) return false;
  // Parents back into the heap buffer (the search is over), then pull the string: from each point
  // jump to the farthest cell reachable in a straight walkable line.
  let n = goal, k = 0;
  while (n >= 0 && k < S.size) { heap[k++] = n; n = parent[n]; }
  let x = fx, z = fz, i = k - 1;
  while (i >= 0 && path.length < MAX_POINTS) {
    let j = 0;
    for (; j < i; j++) if (walkableLine(map, x, z, (heap[j] % W + 0.5) * CELL, (((heap[j] / W) | 0) + 0.5) * CELL)) break;
    x = (heap[j] % W + 0.5) * CELL; z = (((heap[j] / W) | 0) + 0.5) * CELL;
    path.xs[path.length] = x; path.zs[path.length] = z; path.length++;
    i = j - 1;
  }
  const end = map.walk[Math.floor(tz / CELL) * W + Math.floor(tx / CELL)];
  path.xs[path.length - 1] = end ? tx : (S.gc + 0.5) * CELL;
  path.zs[path.length - 1] = end ? tz : (S.gr + 0.5) * CELL;
  return true;
}

// A body-wide straight line on walkable cells that never climbs more than a step between samples
// (so it cannot cut onto the deck except up the stairs).
function walkableLine(map, ax, az, bx, bz) {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.35), r = MOVE.radius + 0.08;
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    let top = 0;
    for (let k = 0; k < 4; k++) {
      const c = Math.floor((x + (k & 1 ? r : -r)) / CELL), rr = Math.floor((z + (k & 2 ? r : -r)) / CELL);
      if (c < 0 || rr < 0 || c >= map.w || rr >= map.h || !map.walk[rr * map.w + c]) return false;
      top = Math.max(top, map.height[rr * map.w + c]);
    }
    if (last >= 0 && top - last > MOVE.stepHeight) return false;
    last = top;
  }
  return true;
}
