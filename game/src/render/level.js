// Builds the visible level from the same grid the simulation collides with: greedy-merged boxes,
// one merged geometry per material (a handful of draw calls), world-space UVs so textures keep
// their scale on any size of box. Skyline props beyond the walls are decoration only.
import * as THREE from 'three';
import { siteDecal } from './textures.js';

// One merged mesh per material: push boxes, then build.
class BoxBatch {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }

  // Axis-aligned box from (x0,y0,z0) to (x1,y1,z1). `scale` metres per texture repeat;
  // `fit` maps each face to the whole texture instead (crates).
  add(x0, y0, z0, x1, y1, z1, scale, fit = false) {
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    ];
    for (const [a, b, c, d, n] of faces) {
      const base = this.pos.length / 3;
      for (const v of [a, b, c, d]) {
        this.pos.push(v[0], v[1], v[2]);
        this.nor.push(n[0], n[1], n[2]);
        if (fit) {
          const u = n[0] !== 0 ? (v[2] - z0) / (z1 - z0) : (v[0] - x0) / (x1 - x0);
          const w = n[1] !== 0 ? (v[2] - z0) / (z1 - z0) : (v[1] - y0) / (y1 - y0);
          this.uv.push(u, w);
        } else {
          const u = n[0] !== 0 ? v[2] : v[0];
          const w = n[1] !== 0 ? v[2] : v[1];
          this.uv.push(u / scale, w / scale);
        }
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
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}

// Greedy rectangles of equal cells: fewer, larger boxes.
function rectangles(map, code) {
  const seen = new Uint8Array(map.w * map.h);
  const out = [];
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const i = r * map.w + c;
      if (seen[i] || map.kind[i] !== code) continue;
      let w = 1;
      while (c + w < map.w && !seen[i + w] && map.kind[i + w] === code) w++;
      let h = 1;
      grow: while (r + h < map.h) {
        for (let k = 0; k < w; k++) {
          const j = (r + h) * map.w + c + k;
          if (seen[j] || map.kind[j] !== code) break grow;
        }
        h++;
      }
      for (let rr = r; rr < r + h; rr++) for (let k = 0; k < w; k++) seen[rr * map.w + c + k] = 1;
      out.push({ c, r, w, h });
    }
  }
  return out;
}

function material(tex, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.05, ...opts });
}

export function buildLevel(map, tex) {
  const group = new THREE.Group();
  const S = map.cell;
  const mats = {
    wall: material(tex.wall),
    rust: material(tex.rustClad, { roughness: 0.75, metalness: 0.25 }),
    teal: material(tex.tealClad, { roughness: 0.75, metalness: 0.25 }),
    crate: material(tex.crate),
    container: material(tex.container, { roughness: 0.7, metalness: 0.3 }),
    grating: material(tex.grating, { roughness: 0.6, metalness: 0.5 }),
    hazard: material(tex.hazard),
    trim: new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.8 }),
  };
  const batch = {};
  for (const k of Object.keys(mats)) batch[k] = new BoxBatch();
  const height = (code) => map.height[map.kind.indexOf(code)];

  for (const b of rectangles(map, 35)) { // '#': perimeter concrete
    batch.wall.add(b.c * S, 0, b.r * S, (b.c + b.w) * S, height(35), (b.r + b.h) * S, 3);
    batch.trim.add(b.c * S - 0.05, height(35), b.r * S - 0.05, (b.c + b.w) * S + 0.05, height(35) + 0.18, (b.r + b.h) * S + 0.05, 3);
  }
  rectangles(map, 72).forEach((b, n) => { // 'H': clad refinery buildings on a concrete plinth
    const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = height(72);
    batch[n % 2 ? 'teal' : 'rust'].add(x0, 0.7, z0, x1, top, z1, 4);
    batch.wall.add(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.7, z1 + 0.06, 3);
    batch.trim.add(x0 - 0.12, top, z0 - 0.12, x1 + 0.12, top + 0.35, z1 + 0.12, 3);
  });
  for (const b of rectangles(map, 88)) { // 'X': stacked steel crates
    for (let c = b.c; c < b.c + b.w; c++) for (let r = b.r; r < b.r + b.h; r++) {
      batch.container.add(c * S + 0.02, 0, r * S + 0.02, (c + 1) * S - 0.02, 1.3, (r + 1) * S - 0.02, 1.5, true);
      batch.container.add(c * S + 0.08, 1.3, r * S + 0.08, (c + 1) * S - 0.08, height(88), (r + 1) * S - 0.08, 1.5, true);
    }
  }
  for (const b of rectangles(map, 120)) { // 'x': wooden crates, one per cell
    for (let c = b.c; c < b.c + b.w; c++) for (let r = b.r; r < b.r + b.h; r++) {
      batch.crate.add(c * S + 0.03, 0, r * S + 0.03, (c + 1) * S - 0.03, height(120), (r + 1) * S - 0.03, 1, true);
    }
  }
  for (const b of rectangles(map, 45)) { // '-': low concrete barrier with a painted top
    const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = height(45);
    batch.wall.add(x0, 0, z0, x1, top - 0.12, z1, 3);
    batch.hazard.add(x0, top - 0.12, z0, x1, top, z1, 1.2);
  }
  for (const code of [49, 50, 51]) { // '1' '2' '3': steel deck and its stairs
    for (const b of rectangles(map, code)) {
      const x0 = b.c * S, z0 = b.r * S, x1 = (b.c + b.w) * S, z1 = (b.r + b.h) * S, top = height(code);
      batch.trim.add(x0, 0, z0, x1, top - 0.08, z1, 2);
      batch.grating.add(x0, top - 0.08, z0, x1, top, z1, 1.5);
    }
  }
  for (const k of Object.keys(mats)) if (batch[k].pos.length) group.add(batch[k].mesh(mats[k]));

  // Ground: one slab with the salt-crust texture repeating every 6 m.
  tex.ground.repeat.set(map.width / 6, map.depth / 6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), material(tex.ground, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.width / 2, 0, map.depth / 2);
  ground.receiveShadow = true;
  group.add(ground);

  for (const site of Object.values(map.sites)) {
    const size = Math.sqrt(site.cells.length) * S + 1.2;
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: siteDecal(site.name), transparent: true, depthWrite: false, roughness: 0.9 }));
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.x, 0.02, site.z);
    decal.receiveShadow = true;
    group.add(decal);
  }
  group.add(buildSkyline(map));
  return group;
}

// Beyond the walls: salt mounds, silos, a gantry crane and the sea. Never collided with.
function buildSkyline(map) {
  const g = new THREE.Group();
  const salt = new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4e5a62, roughness: 0.6, metalness: 0.4 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x8e4630, roughness: 0.7, metalness: 0.3 });
  const W = map.width, D = map.depth;
  const mounds = [[-14, 18, 13, 10], [-10, 50, 10, 8], [W + 16, 30, 15, 11], [W + 12, 70, 11, 8], [24, -18, 12, 9], [62, -16, 14, 10]];
  for (const [x, z, r, h] of mounds) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 28, 1), salt);
    m.position.set(x, h / 2 - 0.3, z);
    g.add(m);
  }
  const siloGeo = new THREE.CylinderGeometry(3.2, 3.2, 17, 24);
  for (const [x, z] of [[58, 34], [65, 34], [58, 42], [65, 42]]) {
    const s = new THREE.Mesh(siloGeo, steel);
    s.position.set(x, 8.5, z);
    s.castShadow = true;
    g.add(s);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.6, 24), rust);
    cap.position.set(x, 17.8, z);
    g.add(cap);
  }
  // gantry crane over the dock (east)
  const leg = new THREE.BoxGeometry(0.8, 22, 0.8);
  for (const [x, z] of [[W + 6, 8], [W + 6, 22], [W + 22, 8], [W + 22, 22]]) {
    const l = new THREE.Mesh(leg, rust);
    l.position.set(x, 11, z);
    g.add(l);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 2), rust);
  beam.position.set(W + 10, 22, 15);
  g.add(beam);
  // land around the works to the west, north and south; open water east of the dock wall
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 64, D + 120), new THREE.MeshStandardMaterial({ color: 0xb9a68f, roughness: 1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set((W - 56) / 2, -0.05, D / 2);
  apron.receiveShadow = true;
  g.add(apron);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x35505e, roughness: 0.35, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(W / 2, -0.6, D / 2);
  g.add(sea);
  return g;
}

