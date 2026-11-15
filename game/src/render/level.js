// The visible level from the sim's grid: greedy-merged boxes, one geometry per material.
import * as THREE from 'three';
import { PALETTE, std } from './palette.js';
import { siteDecal, signTexture, glow } from './textures.js';

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
    const g = new THREE.BufferGeometry().setIndex(this.idx), m = new THREE.Mesh(g, material);
    for (const [name, a, n] of [['position', this.pos, 3], ['normal', this.nor, 3], ['uv', this.uv, 2]]) {
      g.setAttribute(name, new THREE.Float32BufferAttribute(a, n));
    }
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

function rectangles(map, code) {
  const W = map.w, kind = map.kind, seen = new Uint8Array(W * map.h), out = [];
  for (let r = 0; r < map.h; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c;
    if (seen[i] || kind[i] !== code) continue;
    let w = 1, h = 1;
    while (c + w < W && !seen[i + w] && kind[i + w] === code) w++;
    grow: for (; r + h < map.h; h++) for (let k = 0; k < w; k++) if (seen[(r + h) * W + c + k] || kind[(r + h) * W + c + k] !== code) break grow;
    for (let rr = r; rr < r + h; rr++) for (let k = 0; k < w; k++) seen[rr * W + c + k] = 1;
    out.push({ c, r, w, h });
  }
  return out;
}

function laneOf(c, r) {
  if (c >= 26 && c <= 29 && r >= 19 && r <= 22) return 'tanks'; // the conveyor tower
  if (c < 21) return r < 18 ? 'hall' : 'channel';
  if (c >= 35 && r >= 18) return 'slip';
  return c >= 30 && r < 13 ? 'tanks' : 'court';
}

// Wall signs: [lines, column, row, cell face n s e w].
const SIGNS = [
  [['A  >', 'JETTY GATE'], 47, 18, 's'], [['A', 'TANK GATE'], 43, 6, 'n'], [['A  >', 'BRINE BRIDGE'], 36, 13, 's'],
  [['B', 'BOILER GATE'], 13, 6, 'n'], [['B  ^', 'BOILING HOUSE'], 8, 18, 's'], [['< B', 'PAN HOUSE'], 17, 19, 's'],
  [['CONVEYOR', 'COURT  BAY 03'], 27, 22, 's'], [['PUMP GATE'], 31, 10, 'w'], [['SLIPWAY', 'BAY 07'], 53, 28, 'w'], [['BRINE', 'CHANNEL'], 2, 26, 'e'],
];
const LAMPS = [[16, 20, 'n'], [52, 24, 'w'], [3, 29, 'e'], [22, 26, 'e']]; // warm wall lamps: column, row, wall face
const POOLS = [[22, 25, 23, 27], [32, 23, 33, 26], [51, 26, 52, 28], [3, 23, 4, 25]]; // brine pans: c0 r0 c1 r1

export function buildLevel(map, tex) {
  const group = new THREE.Group(), S = map.cell, W = map.width, D = map.depth, H = (code) => map.height[map.kind.indexOf(code)];
  const mats = {
    wall: std({ map: tex.wall }), crate: std({ map: tex.crate }), trim: std({ color: 0x3a4248 }),
    grating: std({ map: tex.grating, roughness: 0.5, metalness: 0.5 }), hazard: std({ map: tex.hazard }), roof: std({ map: tex.gravel }),
  };
  for (const k in PALETTE.lanes) [mats[k], mats[k + 'X']] = PALETTE.lanes[k].map((color) => std({ map: tex.clad, color, roughness: 0.6, metalness: 0.3 }));
  const batch = {};
  for (const k in mats) batch[k] = new BoxBatch();
  const each = (code, fn) => { for (const b of rectangles(map, code)) fn(b.c * S, b.r * S, (b.c + b.w) * S, (b.r + b.h) * S, H(code), b); };
  const cells = (code, fn) => {
    for (const b of rectangles(map, code)) for (let c = b.c; c < b.c + b.w; c++) for (let r = b.r; r < b.r + b.h; r++) fn(c * S, r * S, c, r);
  };
  const flat = (w, d, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
  };

  const roof = (x0, z0, x1, z1, y, e) => { // gravel inside a thin dark coping
    batch.trim.add(x0 - e, y, z0 - e, x1 + e, y += e * 3, z1 + e, 3);
    batch.roof.add(x0 + 0.25, y, z0 + 0.25, x1 - 0.25, y + 0.02, z1 - 0.25, 2);
  };
  each(35, (x0, z0, x1, z1, top) => { // '#': perimeter wall
    batch.wall.add(x0, 0, z0, x1, top, z1, top);
    roof(x0, z0, x1, z1, top, 0.06);
  });
  each(72, (x0, z0, x1, z1, top, b) => { // 'H': clad building on a plinth
    batch[laneOf(b.c, b.r)].add(x0, 0.9, z0, x1, top, z1, 4);
    batch.wall.add(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.9, z1 + 0.06, 4.8);
    roof(x0, z0, x1, z1, top, 0.12);
  });
  cells(88, (x, z, c, r) => { // 'X': two stacked containers, lane accent
    const k = laneOf(c, r) + 'X';
    batch[k].add(x + 0.02, 0, z + 0.02, x + S - 0.02, 1.3, z + S - 0.02, 1.5, true);
    batch[k].add(x + 0.08, 1.3, z + 0.08, x + S - 0.08, H(88), z + S - 0.08, 1.5, true);
  });
  cells(120, (x, z) => batch.crate.add(x + 0.03, 0, z + 0.03, x + S - 0.03, H(120), z + S - 0.03, 1, true));
  each(45, (x0, z0, x1, z1, top) => { // '-': barrier
    batch.wall.add(x0, 0, z0, x1, top - 0.12, z1, 3);
    batch.trim.add(x0, top - 0.12, z0, x1, top, z1, 1.2);
  });
  for (const code of [49, 50, 51]) each(code, (x0, z0, x1, z1, top) => { // '1' '2' '3': decks and stairs
    batch.trim.add(x0, 0, z0, x1, top - 0.08, z1, 2);
    batch.grating.add(x0, top - 0.08, z0, x1, top, z1, 1.5);
  });
  for (const site of map.siteList) { // plant zones: hazard edging, decal
    let c0 = 99, r0 = 99, c1 = 0, r1 = 0;
    for (const p of site.cells) { c0 = Math.min(c0, p.c); r0 = Math.min(r0, p.r); c1 = Math.max(c1, p.c + 1); r1 = Math.max(r1, p.r + 1); }
    const x0 = c0 * S - 0.6, z0 = r0 * S - 0.6, x1 = c1 * S + 0.6, z1 = r1 * S + 0.6, size = Math.sqrt(site.cells.length) * S + 1.2;
    for (const [a, b, c, d] of [[x0, z0, x1, z0 + 0.3], [x0, z1 - 0.3, x1, z1], [x0, z0, x0 + 0.3, z1], [x1 - 0.3, z0, x1, z1]]) batch.hazard.add(a, 0, b, c, 0.02, d, 1.2);
    flat(size, size, std({ map: siteDecal(site.name), transparent: true, depthWrite: false }), site.x, 0.025, site.z);
  }
  for (const k in mats) if (batch[k].pos.length) group.add(batch[k].mesh(mats[k]));

  tex.ground.repeat.set(W / 6, D / 6);
  flat(W, D, std({ map: tex.ground, roughness: 0.95 }), W / 2, 0, D / 2);
  const brine = std({ color: PALETTE.brine, roughness: 0.08, metalness: 0.25 });
  for (const [c0, r0, c1, r1] of POOLS) flat((c1 - c0 + 1) * S - 0.3, (r1 - r0 + 1) * S - 0.3, brine, (c0 + c1 + 1) * S / 2, 0.015, (r0 + r1 + 1) * S / 2);

  const place = (obj, c, r, face, y, off) => { // against a face of cell (c, r)
    const n = { n: [0, -1, Math.PI], s: [0, 1, 0], e: [1, 0, Math.PI / 2], w: [-1, 0, -Math.PI / 2] }[face];
    obj.position.set((c + 0.5 + n[0] * 0.5) * S + n[0] * off, y, (r + 0.5 + n[1] * 0.5) * S + n[1] * off);
    obj.rotation.y = n[2];
    group.add(obj);
  };
  for (const [lines, c, r, face] of SIGNS) place(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), std({ map: signTexture(lines, PALETTE.lanes[laneOf(c, r)][1]), roughness: 0.6 })), c, r, face, 2.6, 0.02);
  const lampMat = std({ color: 0x222222 }), lens = std({ color: 0, emissive: PALETTE.lamp, emissiveIntensity: 3 });
  for (const [c, r, face] of LAMPS) { // a dark housing, its warm lens underneath, a small glow, the light
    place(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), lampMat), c, r, face, 3.4, 0.15);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.22), lens), c, r, face, 3.3, 0.15);
    place(new THREE.Sprite(glow(PALETTE.lamp)), c, r, face, 3.25, 0.2);
    place(new THREE.PointLight(PALETTE.lamp, 14, 10), c, r, face, 3.1, 0.6);
  }

  // Beyond the walls, never collided.
  const salt = std({ color: 0xe8e4d8, emissive: 0x44403a, roughness: 1 }), steel = std({ color: PALETTE.steel, metalness: 0.4, roughness: 0.6 }), oxide = std({ color: 0x8c4c3a });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; group.add(m); };
  // Salt heaps: a lathed slump (round crown, spread toe), lumpy in angle so the lathe seam stays closed.
  const heap = (r, h) => {
    const g = new THREE.LatheGeometry([[0, 1], [0.25, 0.93], [0.7, 0.45], [1, 0.06], [1.08, 0]].map(([u, v]) => new THREE.Vector2(u * r, v * h)), 16), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.08 * Math.sin(a * 3 + r) * Math.cos(a * 5 + h);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * (2 - k), p.getZ(i) * k);
    }
    return g.computeVertexNormals(), g;
  };
  for (const [x, z, r, h] of [[-14, 18, 15, 8], [-6, 30, 10, 6], [-10, 52, 12, 7], [W + 16, 30, 17, 9], [W + 12, 68, 12, 7], [24, -42, 36, 20], [4, -30, 20, 11], [46, -44, 24, 14], [64, -18, 16, 9]]) add(heap(r, h), salt, x, -0.3, z);
  for (const z of [34, 42]) for (const x of [58, 65]) { add(new THREE.CylinderGeometry(3.2, 3.2, 17, 24), steel, x, 8.5, z); add(new THREE.ConeGeometry(3.3, 1.6, 24), oxide, x, 17.8, z); }
  flat(900, 900, std({ color: 0x6f6c66, roughness: 1 }), W / 2, -0.05, D / 2); // salt flats into the fog
  return group;
}
