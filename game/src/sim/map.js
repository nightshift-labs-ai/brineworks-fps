// The Brineworks map, a salt refinery on a cold coast: one ASCII grid drives collision, sight,
// bot navigation and the rendered level. North is up; a cell is CELL metres.
//   #  perimeter wall     H  refinery building   X  stacked crates (2.6 m)   x  crate (1.1 m, vaultable)
//   -  low wall (1 m)     1 2 3  stair / deck heights 0.4, 0.8, 1.2 m        .  floor
//   A B  Fuse Core sites  a d  attacker / defender spawns      other letters: named waypoints (floor)
// Lanes: west Brine Channel to B; Conveyor Court in the middle (its tower blocks spawn-to-spawn
// sight) with the Pan House to B and the Brine Bridge to A; the east Quay to A.
export const CELL = 1.5;

const LAYOUT = `
########################################################
####################..............x.####################
####################....d.....d.....####################
########...................d....................########
########...........z..d..........d..y........t..########
########..s.....................................########
#########...########.x..............########...#########
##........v......#HHHHHHH#....#HHHHHHH#......u........##
##....x..........#HHHHHHH#.i..#HHHHHHH#...x.........X.##
##..xx...........#HHHHHHH#....#HHHHHHH#...333.......X.##
##..........XX...#HHHHHHH#.x..#HHHHHHH#...33321AAA....##
##.....BBB..XX...#HHHHHHH#....#HHHHHHH#...333..AAA....##
##.....BBB.......#HHHHHHH#....#HHHHHHH#........AAA....##
##.....BBB.....x.#HHHHHHH#....#########.X.............##
##.--..........x.#HHHH......................xx.....xx.##
##..x.....xx.....#HHHH......h.......j....x..w.........##
##...............#HHHH..............x.................##
##...............#####..xx........#####...............##
####...#####...#######............#HHHHHHHHHHH##...#####
###..p..####.r.#######....HHHH.X..#HHHHHHHHHHH#......###
###.....####.............XHHHHXX..#HHHHHHHHHHH#..k...###
###.....####....xq.......XHHHHX...#HHHHHHHHHHH#......###
###...--####.-............HHHH....#HHHHHHHHHHH#......###
###.....#HHHHHHHHHHHH#............#HHHHHHHHHHH#......###
###.....#HHHHHHHHHHHH#.x..........#HHHHHHHHHHH#......###
###..x..#HHHHHHHHHHHH#.....g......#HHHHHHHHHHH#..xx..###
###.....#HHHHHHHHHHHH#............#HHHHHHHHHHH#......###
###..o..#HHHHHHHHHHHH#....----....#HHHHHHHHHHH#......###
###.....#HHHHHHHHHHHH#..........x.#HHHHHHHHHHH#...m..###
###.....#HHHHHHHHHHHH#X...........#HHHHHHHHHHH#......###
###.x...#HHHHHHHHHHHH#............#HHHHHHHHHHH#....x.###
###.....#HHHHHHHHHHHH####..f...####HHHHHHHHHHH#......###
###.....#HHHHHHHHHHHH####......####HHHHHHHHHHH#X.....###
###.....#################x.....################......###
####................#####......#####........x.......####
####.n.........x....#####......#####.............l..####
####....x..................e............x...........####
####................................................####
####################.x.....a........####################
####################..............x.####################
####################...a.....a......####################
####################......a.....a...####################
####################................####################
########################################################
`;

const HEIGHTS = { '#': 4.8, H: 9, X: 2.6, x: 1.1, '-': 1, 1: 0.4, 2: 0.8, 3: 1.2 };
const CALLOUTS = {
  e: 'Rail Cut', f: 'Weighbridge', g: 'Conveyor Court', h: 'Tower Foot', i: 'Pump Gate', j: 'Brine Bridge',
  k: 'Dock Gate', l: 'Bollard Corner', m: 'Quay', n: 'Channel Foot', o: 'Brine Channel', p: 'Channel Gate',
  q: 'Pan House', r: 'Pan Door', s: 'Office Row', t: 'Tank Walk', u: 'Tank Gate', v: 'Hall Gate', w: 'Tank Apron',
  y: 'Pumphouse East', z: 'Pumphouse West',
};
const SITE_NAMES = { A: 'Brine Tanks', B: 'Evaporator Hall' };

// Attack routes from the railhead: the group gathers at `stage`, then pushes the last leg together.
export const ATTACK_ROUTES = [
  { site: 'A', name: 'quay', path: 'lmk', stage: 'm' },
  { site: 'A', name: 'bridge', path: 'efghj', stage: 'h' },
  { site: 'B', name: 'channel', path: 'nop', stage: 'o' },
  { site: 'B', name: 'pan house', path: 'efgqr', stage: 'q' },
];

// Held angles (stand on a cell, aim at a waypoint): defenders anchor HOLDS, attackers hold POSTPLANT.
const HOLDS = {
  A: [[43, 10, 'k'], [40, 9, 'j'], [52, 12, 'k']],
  B: [[12, 13, 'p'], [4, 11, 'r'], [14, 8, 'p']],
  tower: [[28, 9, 'h']],
};
const POSTPLANT = {
  A: [[43, 10, 'u'], [51, 15, 'j'], [42, 16, 'u']],
  B: [[5, 15, 'v'], [15, 9, 'r'], [3, 8, 'v']],
};

// Parse the layout into flat typed arrays (index = row * w + col), named places and world-space holds.
export function buildMap() {
  const rows = LAYOUT.trim().split('\n');
  const h = rows.length, w = rows[0].length;
  const map = {
    w, h, cell: CELL, width: w * CELL, depth: h * CELL,
    kind: new Uint8Array(w * h), // char code of the cell
    height: new Float32Array(w * h), // top of whatever stands on the cell (0 = open floor)
    walk: new Uint8Array(w * h), // 1 = bots may path through
    spawns: [[], []], sites: {}, marks: {},
  };
  for (let r = 0; r < h; r++) {
    if (rows[r].length !== w) throw new Error(`map row ${r} is ${rows[r].length} wide, expected ${w}`);
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c], i = r * w + c;
      map.kind[i] = ch.charCodeAt(0);
      map.height[i] = HEIGHTS[ch] ?? 0;
      map.walk[i] = map.height[i] < 1.25 && ch !== 'x' && ch !== '-' ? 1 : 0;
      const place = { c, r, x: (c + 0.5) * CELL, z: (r + 0.5) * CELL };
      if (ch === 'a' || ch === 'd') map.spawns[ch === 'a' ? 0 : 1].push(place);
      else if (ch === 'A' || ch === 'B') (map.sites[ch] ??= { name: ch, title: SITE_NAMES[ch], cells: [], x: 0, z: 0, radius: 0 }).cells.push(place);
      else if (CALLOUTS[ch]) map.marks[ch] = { ...place, name: CALLOUTS[ch] };
    }
  }
  map.markList = Object.values(map.marks);
  map.siteList = Object.values(map.sites);
  for (const site of map.siteList) {
    for (const p of site.cells) { site.x += p.x / site.cells.length; site.z += p.z / site.cells.length; }
    site.radius = Math.sqrt(site.cells.length) * CELL * 0.5 + 0.9;
  }
  const spot = ([c, r, look]) => ({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL, lookX: map.marks[look].x, lookZ: map.marks[look].z });
  map.holds = {}; map.postplant = {};
  for (const k in HOLDS) map.holds[k] = HOLDS[k].map(spot);
  for (const k in POSTPLANT) map.postplant[k] = POSTPLANT[k].map(spot);
  return map;
}

// The site within `pad` metres of its edge from (x, z), or null.
export function siteNear(map, x, z, pad) {
  for (const site of map.siteList) if (Math.hypot(x - site.x, z - site.z) < site.radius + pad) return site;
  return null;
}

// A point's callout: the site inside a site, else the nearest named waypoint.
export function placeName(map, x, z) {
  const site = siteNear(map, x, z, 1);
  if (site) return `${site.title} (${site.name})`;
  let best = '', bestD = Infinity;
  for (const m of map.markList) {
    const d = (m.x - x) ** 2 + (m.z - z) ** 2;
    if (d < bestD) { bestD = d; best = m.name; }
  }
  return best;
}
