// The visible level, built from the same grid the sim collides with: greedy-merged boxes, one merged
// geometry per material, world-space UVs. Signs, lamps, pools and the skyline are decoration only.
import * as THREE from 'three';
import { PALETTE, std } from './palette.js';
import { siteDecal, signTexture } from './textures.js';

// Per face: normal axis and sign, then the u and v tangent axes and signs, with u x v = normal (CCW).
const FACES = [[0, 1, 2, -1, 1, 1], [0, -1, 2, 1, 1, 1], [1, 1, 0, 1, 2, -1], [1, -1, 0, 1, 2, 1], [2, 1, 0, 1, 1, 1], [2, -1, 0, -1, 1, 1]];

// Boxes pushed into one geometry; `scale` metres per texture repeat, or `fit` one texture per face.
class BoxBatch {
  pos = []; nor = []; uv = []; idx = [];
  add(x0, y0, z0, x1, y1, z1, scale, fit = false) {
    const lo = [x0, y0, z0], hi = [x1, y1, z1], p = [0, 0, 0];
    for (const [n, ns, u, us, v, vs] of FACES) {
      const base = this.pos.length / 3;
      for (let k = 0; k < 4; k++) {
        const iu = k === 1 || k === 2, iv = k >= 2;
        p[n] = ns > 0 ? hi[n] : lo[n];
        p[u] = iu === us > 0 ? hi[u] : lo[u];
        p[v] = iv === vs > 0 ? hi[v] : lo[v];
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(n === 0 ? ns : 0, n === 1 ? ns : 0, n === 2 ? ns : 0);
        this.uv.push(fit ? +iu : (us * p[u]) / scale, fit ? +iv : (vs * p[v]) / scale);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, material);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

// Greedy rectangles of equal cells: fewer, larger boxes.
function rectangles(map, code) {
  const seen = new Uint8Array(map.w * map.h), out = [];
  for (let r = 0; r < map.h; r++) for (let c = 0; c < map.w; c++) {
    const i = r * map.w + c;
    if (seen[i] || map.kind[i] !== code) continue;
    let w = 1, h = 1;
    while (c + w < map.w && !seen[i + w] && map.kind[i + w] === code) w++;
    grow: for (; r + h < map.h; h++) for (let k = 0; k < w; k++) if (seen[(r + h) * map.w + c + k] || map.kind[(r + h) * map.w + c + k] !== code) break grow;
    for (let rr = r; rr < r + h; rr++) for (let k = 0; k < w; k++) seen[rr * map.w + c + k] = 1;
    out.push({ c, r, w, h });
  }
  return out;
}

// Which lane a building block belongs to: its cladding tint gives each lane its own colour.
function laneOf(c, r) {
  if (c >= 26 && c <= 29 && r >= 19 && r <= 22) return 'tanks'; // the conveyor tower
  if (c < 21) return r < 18 ? 'hall' : 'channel';
  if (c >= 35 && r >= 18) return 'quay';
  return c >= 30 && r < 13 ? 'tanks' : 'court';
}

// Wall signs: [lines, column, row, face of that cell (n s e w)].
const SIGNS = [
  [['A  >', 'DOCK GATE'], 47, 18, 's'], [['A', 'TANK GATE'], 43, 6, 'n'], [['A  >', 'BRINE BRIDGE'], 36, 13, 's'],
  [['B', 'HALL GATE'], 13, 6, 'n'], [['B  ^', 'EVAPORATOR HALL'], 8, 18, 's'], [['< B', 'PAN HOUSE'], 17, 19, 's'],
  [['CONVEYOR', 'COURT  BAY 03'], 27, 22, 's'], [['PUMP GATE'], 31, 10, 'w'], [['QUAY', 'BAY 07'], 53, 28, 'w'], [['BRINE', 'CHANNEL'], 2, 26, 'e'],
];
const LAMPS = [[16, 20, 'n'], [52, 24, 'w'], [3, 29, 'e'], [22, 26, 'e']]; // warm wall lamps: column, row, wall face
const POOLS = [[22, 25, 23, 27], [32, 23, 33, 26], [51, 26, 52, 28], [3, 23, 4, 25]]; // brine pans: c0 r0 c1 r1

export function buildLevel(map, tex) {
  const group = new THREE.Group(), S = map.cell, H = (code) => map.height[map.kind.indexOf(code)];
  const clad = (lane) => std({ map: tex.clad, color: PALETTE.lanes[lane], roughness: 0.6, metalness: 0.3 });
  const mats = {
    wall: std({ map: tex.wall }), crate: std({ map: tex.crate, roughness: 0.6, metalness: 0.3 }), trim: std({ color: 0x3a4248 }),
    grating: std({ map: tex.grating, roughness: 0.5, metalness: 0.5 }), hazard: std({ map: tex.hazard }),
    hall: clad('hall'), tanks: clad('tanks'), channel: clad('channel'), quay: clad('quay'), court: clad('court'),
    box0: std({ map: tex.clad, color: PALETTE.boxes[0], metalness: 0.3 }), box1: std({ map: tex.clad, color: PALETTE.boxes[1], metalness: 0.3 }), box2: std({ map: tex.clad, color: PALETTE.boxes[2], metalness: 0.3 }),
  };
  const batch = {};
  for (const k in mats) batch[k] = new BoxBatch();
  const cells = (b, fn) => { for (let c = b.c; c < b.c + b.w; c++) for (let r = b.r; r < b.r + b.h; r++) fn(c * S, r * S, c, r); };

  for (const b of rectangles(map, 35)) { // '#': perimeter concrete (one texture tile per wall height) with a cap
    const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = H(35);
    batch.wall.add(x0, 0, z0, x1, top, z1, top);
    batch.trim.add(x0 - 0.05, top, z0 - 0.05, x1 + 0.05, top + 0.18, z1 + 0.05, 3);
  }
  for (const b of rectangles(map, 72)) { // 'H': clad buildings on a concrete plinth, tinted by lane
    const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = H(72);
    batch[laneOf(b.c, b.r)].add(x0, 0.9, z0, x1, top, z1, 4);
    batch.wall.add(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.9, z1 + 0.06, 4.8);
    batch.trim.add(x0 - 0.12, top, z0 - 0.12, x1 + 0.12, top + 0.35, z1 + 0.12, 3);
  }
  for (const b of rectangles(map, 88)) cells(b, (x, z, c, r) => { // 'X': two stacked steel containers
    const k = `box${(c * 7 + r * 3) % 3}`;
    batch[k].add(x + 0.02, 0, z + 0.02, x + S - 0.02, 1.3, z + S - 0.02, 1.5, true);
    batch[k].add(x + 0.08, 1.3, z + 0.08, x + S - 0.08, H(88), z + S - 0.08, 1.5, true);
  });
  for (const b of rectangles(map, 120)) cells(b, (x, z) => batch.crate.add(x + 0.03, 0, z + 0.03, x + S - 0.03, H(120), z + S - 0.03, 1, true));
  for (const b of rectangles(map, 45)) { // '-': low barrier with a painted top
    const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = H(45);
    batch.wall.add(x0, 0, z0, x1, top - 0.12, z1, 3);
    batch.hazard.add(x0, top - 0.12, z0, x1, top, z1, 1.2);
  }
  for (const code of [49, 50, 51]) for (const b of rectangles(map, code)) { // '1' '2' '3': steel deck and stairs
    const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = H(code);
    batch.trim.add(x0, 0, z0, x1, top - 0.08, z1, 2);
    batch.grating.add(x0, top - 0.08, z0, x1, top, z1, 1.5);
  }
  for (const site of map.siteList) { // hazard edging round each plant zone
    let c0 = 99, r0 = 99, c1 = 0, r1 = 0;
    for (const p of site.cells) { c0 = Math.min(c0, p.c); r0 = Math.min(r0, p.r); c1 = Math.max(c1, p.c + 1); r1 = Math.max(r1, p.r + 1); }
    const [x0, z0, x1, z1] = [c0 * S - 0.6, r0 * S - 0.6, c1 * S + 0.6, r1 * S + 0.6];
    for (const [a, b, c, d] of [[x0, z0, x1, z0 + 0.3], [x0, z1 - 0.3, x1, z1], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1]]) batch.hazard.add(a, 0, b, c, 0.02, d, 1.2);
    group.add(flat(Math.sqrt(site.cells.length) * S + 1.2, Math.sqrt(site.cells.length) * S + 1.2, std({ map: siteDecal(site.name), transparent: true, depthWrite: false }), site.x, 0.025, site.z));
  }
  for (const k in mats) if (batch[k].pos.length) group.add(batch[k].mesh(mats[k]));

  tex.ground.repeat.set(map.width / 6, map.depth / 6);
  group.add(flat(map.width, map.depth, std({ map: tex.ground, roughness: 0.95 }), map.width / 2, 0, map.depth / 2));
  const brine = std({ color: PALETTE.brine, roughness: 0.08, metalness: 0.25 });
  for (const [c0, r0, c1, r1] of POOLS) group.add(flat((c1 - c0 + 1) * S - 0.3, (r1 - r0 + 1) * S - 0.3, brine, (c0 + c1 + 1) * S / 2, 0.015, (r0 + r1 + 1) * S / 2));

  const place = (obj, c, r, face, y, off) => { // stand obj against a face of cell (c, r)
    const n = { n: [0, -1, Math.PI], s: [0, 1, 0], e: [1, 0, Math.PI / 2], w: [-1, 0, -Math.PI / 2] }[face];
    obj.position.set((c + 0.5 + n[0] * 0.5) * S + n[0] * off, y, (r + 0.5 + n[1] * 0.5) * S + n[1] * off);
    obj.rotation.y = n[2];
    group.add(obj);
  };
  for (const [lines, c, r, face] of SIGNS) place(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), std({ map: signTexture(lines), roughness: 0.6 })), c, r, face, 2.6, 0.02);
  const lampMat = std({ color: 0x222222, emissive: PALETTE.lamp, emissiveIntensity: 2.5 });
  for (const [c, r, face] of LAMPS) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), lampMat), c, r, face, 3.4, 0.15);
    const light = new THREE.PointLight(PALETTE.lamp, 14, 10);
    place(light, c, r, face, 3.1, 0.6);
  }
  group.add(skyline(map));
  return group;
}

function flat(w, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

// Beyond the walls: salt mounds, silos, a gantry crane over the dock, land and the sea. Never collided.
function skyline(map) {
  const g = new THREE.Group(), W = map.width, D = map.depth;
  const salt = std({ color: 0xf2f4f3, roughness: 1 }), steel = std({ color: PALETTE.steel, metalness: 0.4, roughness: 0.6 }), oxide = std({ color: 0x8c4c3a });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); };
  for (const [x, z, r, h] of [[-14, 18, 13, 10], [-10, 50, 10, 8], [W + 16, 30, 15, 11], [W + 12, 70, 11, 8], [24, -18, 12, 9], [62, -16, 14, 10]]) add(new THREE.ConeGeometry(r, h, 28), salt, x, h / 2 - 0.3, z);
  for (const [x, z] of [[58, 34], [65, 34], [58, 42], [65, 42]]) { add(new THREE.CylinderGeometry(3.2, 3.2, 17, 24), steel, x, 8.5, z); add(new THREE.ConeGeometry(3.3, 1.6, 24), oxide, x, 17.8, z); }
  for (const [x, z] of [[W + 6, 8], [W + 6, 22], [W + 22, 8], [W + 22, 22]]) add(new THREE.BoxGeometry(0.8, 22, 0.8), oxide, x, 11, z);
  add(new THREE.BoxGeometry(34, 1.6, 2), oxide, W + 10, 22, 15);
  g.add(flat(W + 64, D + 120, std({ color: 0xb8bcb9, roughness: 1 }), (W - 56) / 2, -0.05, D / 2));
  g.add(flat(1200, 1200, std({ color: 0x2f4a58, roughness: 0.3, metalness: 0.2 }), W / 2, -0.6, D / 2));
  return g;
}
