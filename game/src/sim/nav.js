// Bot navigation: A* over the map cells (8-way, no corner cutting, stairs allowed, crates not),
// then string-pulling so bots walk straight lines between corners. All buffers are allocated once.
import { CELL } from './map.js';
import { MOVE } from './config.js';

const MAX_POINTS = 96;
let gScore, fScore, parent, heap, heapPos, closed, stamp, size, W;
let generation = 0;

function setup(map) {
  if (W === map.w && size === map.w * map.h) return;
  W = map.w; size = map.w * map.h;
  gScore = new Float32Array(size); fScore = new Float32Array(size);
  parent = new Int32Array(size); heap = new Int32Array(size); heapPos = new Int32Array(size);
  closed = new Uint8Array(size); stamp = new Uint32Array(size);
}

export function createPath() { return { xs: new Float32Array(MAX_POINTS), zs: new Float32Array(MAX_POINTS), length: 0, index: 0 }; }

function heapPush(n, count) {
  let i = count;
  heap[i] = n; heapPos[n] = i;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[i]]) break;
    swap(i, p); i = p;
  }
}
function heapPop(count) {
  const top = heap[0];
  heap[0] = heap[count - 1]; heapPos[heap[0]] = 0;
  let i = 0;
  for (;;) {
    const l = i * 2 + 1, r = l + 1;
    let m = i;
    if (l < count - 1 && fScore[heap[l]] < fScore[heap[m]]) m = l;
    if (r < count - 1 && fScore[heap[r]] < fScore[heap[m]]) m = r;
    if (m === i) break;
    swap(i, m); i = m;
  }
  return top;
}
function heapUp(i) {
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[i]]) break;
    swap(i, p); i = p;
  }
}
function swap(i, j) { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; heapPos[heap[i]] = i; heapPos[heap[j]] = j; }

function passable(map, from, to) {
  return map.walk[to] === 1 && map.height[to] - map.height[from] <= MOVE.stepHeight;
}

function nearestWalkable(map, c, r) {
  for (let rad = 0; rad < 4; rad++) {
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < map.w && rr < map.h && map.walk[rr * map.w + cc]) return rr * map.w + cc;
    }
  }
  return -1;
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

// Fill `path` with world points from (fx, fz) to (tx, tz). Returns false when no route exists.
export function findPath(map, fx, fz, tx, tz, path) {
  setup(map);
  const start = nearestWalkable(map, Math.floor(fx / CELL), Math.floor(fz / CELL));
  const goal = nearestWalkable(map, Math.floor(tx / CELL), Math.floor(tz / CELL));
  path.length = 0; path.index = 0;
  if (start < 0 || goal < 0) return false;
  generation++;
  const gc = goal % W, gr = (goal / W) | 0;
  const h = (n) => { const dc = Math.abs(n % W - gc), dr = Math.abs(((n / W) | 0) - gr); return Math.max(dc, dr) + 0.4142 * Math.min(dc, dr); };
  stamp[start] = generation; gScore[start] = 0; fScore[start] = h(start); parent[start] = -1; closed[start] = 0;
  let count = 0;
  heapPush(start, count++);
  let found = false;
  while (count > 0) {
    const n = heapPop(count--);
    if (n === goal) { found = true; break; }
    closed[n] = 1;
    const c = n % W, r = (n / W) | 0;
    for (const [dc, dr, cost] of DIRS) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= map.w || rr >= map.h) continue;
      const m = rr * W + cc;
      if (!passable(map, n, m)) continue;
      if (dc && dr && (!passable(map, n, r * W + cc) || !passable(map, n, rr * W + c))) continue;
      if (stamp[m] !== generation) { stamp[m] = generation; closed[m] = 0; gScore[m] = Infinity; heapPos[m] = -1; }
      if (closed[m]) continue;
      const g = gScore[n] + cost;
      if (g >= gScore[m]) continue;
      gScore[m] = g; fScore[m] = g + h(m); parent[m] = n;
      if (heapPos[m] >= 0 && heapPos[m] < count && heap[heapPos[m]] === m) heapUp(heapPos[m]);
      else heapPush(m, count++);
    }
  }
  if (!found) return false;
  // Walk parents back into the buffer (reversed), then string-pull.
  let n = goal, k = 0;
  const cells = heap; // reuse as scratch: the search is over
  while (n >= 0 && k < size) { cells[k++] = n; n = parent[n]; }
  let x = fx, z = fz, i = k - 1;
  while (i >= 0 && path.length < MAX_POINTS) {
    let j = 0; // farthest cell in a straight walkable line from (x, z)
    for (j = 0; j < i; j++) {
      const cj = cells[j];
      if (walkableLine(map, x, z, (cj % W + 0.5) * CELL, (((cj / W) | 0) + 0.5) * CELL)) break;
    }
    const cell = cells[j];
    x = (cell % W + 0.5) * CELL; z = (((cell / W) | 0) + 0.5) * CELL;
    path.xs[path.length] = x; path.zs[path.length] = z; path.length++;
    i = j - 1;
  }
  path.xs[path.length - 1] = tx; path.zs[path.length - 1] = tz;
  if (!map.walk[Math.floor(tz / CELL) * W + Math.floor(tx / CELL)]) { path.xs[path.length - 1] = (goal % W + 0.5) * CELL; path.zs[path.length - 1] = ((goal / W | 0) + 0.5) * CELL; }
  return true;
}

// A body-wide straight line stays on walkable cells and never climbs more than a step between
// samples (so it cannot cut onto the deck except up the stairs). Samples the body square's corners.
function walkableLine(map, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / 0.35);
  const r = MOVE.radius + 0.08;
  let last = -1;
  for (let s = 0; s <= steps; s++) {
    const t = steps ? s / steps : 0;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
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
