// The Brineworks map: a salt refinery on the coast at dusk. One ASCII grid is the single source of truth
// for collision, line of sight, bot navigation and the rendered level. North is up; one cell is CELL metres.
//
//   #  perimeter wall     H  refinery building   X  stacked crates (2.6 m)   x  crate (1.1 m, vaultable)
//   -  low wall (1 m)     1 2 3  stair / deck heights 0.4, 0.8, 1.2 m        .  floor
//   A B  Fuse Core sites  a d  attacker / defender spawns      other letters: named waypoints (floor)
//
// Sites: A = the Brine Tanks (a raised steel deck), B = the Evaporator Hall. Lanes: the west Brine
// Channel to B; the open Conveyor Court in the middle (its tower blocks the spawn-to-spawn line) with
// the Pan House to B and the Brine Bridge to A; the east Quay to A. Harrow start in the railhead
// (south), the Saltreeves in the pumphouse (north).
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
// Callouts: every waypoint letter is a named place (the HUD shows where you stand, bots call by name).
const CALLOUTS = {
  e: 'Rail Cut', f: 'Weighbridge', g: 'Conveyor Court', h: 'Tower Foot', i: 'Pump Gate', j: 'Brine Bridge',
  k: 'Dock Gate', l: 'Bollard Corner', m: 'Quay', n: 'Channel Foot', o: 'Brine Channel', p: 'Channel Gate',
  q: 'Pan House', r: 'Pan Door', s: 'Office Row', t: 'Tank Walk', u: 'Tank Gate', v: 'Hall Gate', w: 'Tank Apron',
  y: 'Pumphouse East', z: 'Pumphouse West',
};
export const SITE_NAMES = { A: 'Brine Tanks', B: 'Evaporator Hall' };

// Attack routes: waypoints walked in order from the railhead. The group gathers at `stage`, then
// pushes the last waypoint into the site together.
export const ATTACK_ROUTES = [
  { site: 'A', name: 'quay', path: 'lmk', stage: 'm' },
  { site: 'A', name: 'bridge', path: 'efghj', stage: 'h' },
  { site: 'B', name: 'channel', path: 'nop', stage: 'o' },
  { site: 'B', name: 'pan house', path: 'efgqr', stage: 'q' },
];

// Held angles: stand at a cell, aim at a waypoint. Defenders anchor these; attackers hold post-plant ones.
export const HOLDS = {
  A: [{ at: [43, 10], look: 'k' }, { at: [40, 9], look: 'j' }, { at: [52, 12], look: 'k' }],
  B: [{ at: [12, 13], look: 'p' }, { at: [4, 11], look: 'r' }, { at: [14, 8], look: 'p' }],
  tower: [{ at: [28, 9], look: 'h' }],
};
export const POSTPLANT = {
  A: [{ at: [43, 10], look: 'u' }, { at: [51, 15], look: 'j' }, { at: [42, 16], look: 'u' }],
  B: [{ at: [5, 15], look: 'v' }, { at: [15, 9], look: 'r' }, { at: [3, 8], look: 'v' }],
};

// Parse the layout into flat typed arrays (index = row * w + col) plus named places.
export function buildMap() {
  const rows = LAYOUT.trim().split('\n');
  const h = rows.length;
  const w = rows[0].length;
  const map = {
    w, h, cell: CELL,
    width: w * CELL, depth: h * CELL,
    kind: new Uint8Array(w * h), // char code of the cell
    height: new Float32Array(w * h), // top of whatever stands on the cell (0 = open floor)
    walk: new Uint8Array(w * h), // 1 = bots may path through
    spawns: [[], []], // by side: attack, defend
    sites: {},
    marks: {},
  };
  for (let r = 0; r < h; r++) {
    if (rows[r].length !== w) throw new Error(`map row ${r} is ${rows[r].length} wide, expected ${w}`);
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      const i = r * w + c;
      map.kind[i] = ch.charCodeAt(0);
      map.height[i] = HEIGHTS[ch] ?? 0;
      map.walk[i] = map.height[i] < 1.25 && ch !== 'x' && ch !== '-' ? 1 : 0;
      const place = { c, r, x: (c + 0.5) * CELL, z: (r + 0.5) * CELL };
      if (ch === 'a') map.spawns[0].push(place);
      else if (ch === 'd') map.spawns[1].push(place);
      else if (ch === 'A' || ch === 'B') {
        const site = map.sites[ch] ?? (map.sites[ch] = { name: ch, cells: [], x: 0, z: 0, radius: 0 });
        site.cells.push(place);
      } else if (CALLOUTS[ch]) map.marks[ch] = { ...place, name: CALLOUTS[ch] };
    }
  }
  map.markList = Object.values(map.marks);
  map.siteList = Object.values(map.sites);
  for (const site of map.siteList) {
    for (const p of site.cells) { site.x += p.x / site.cells.length; site.z += p.z / site.cells.length; }
    site.radius = Math.sqrt(site.cells.length) * CELL * 0.5 + 0.9;
  }
  return map;
}

// The callout for a point: the site's name inside a site, else the nearest named waypoint.
export function placeName(map, x, z) {
  for (const site of map.siteList) if (Math.hypot(x - site.x, z - site.z) < site.radius + 1) return `${SITE_NAMES[site.name]} (${site.name})`;
  let best = '', bestD = Infinity;
  for (const m of map.markList) {
    const d = (m.x - x) ** 2 + (m.z - z) ** 2;
    if (d < bestD) { bestD = d; best = m.name; }
  }
  return best;
}
