// The Saltline map: a salt refinery on the coast at dusk. One ASCII grid is the single source of truth
// for collision, line of sight, bot navigation and the rendered level. North is up; one cell is CELL metres.
//
//   #  perimeter wall     H  refinery building   X  stacked crates (2.6 m)   x  crate (1.1 m, vaultable)
//   -  low wall (1 m)     1 2 3  stair / deck heights 0.4, 0.8, 1.2 m        .  floor
//   A B  Fuse Core sites  a d  attacker / defender spawns      other letters: named waypoints (floor)
//
// Lanes: west "Sluice" to B, the open "Conveyor yard" in the middle with a vent hall to B and a
// catwalk to A, and the east "Long dock" to A. The attackers start in the rail yard (south), the
// defenders in the pumphouse yard (north).
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
const WAYPOINT_NAMES = {
  e: 'lower mid', f: 'mid tunnel', g: 'conveyor yard', h: 'top mid', i: 'mid gate', j: 'catwalk',
  k: 'long door', l: 'dock corner', m: 'long dock', n: 'sluice corner', o: 'sluice', p: 'sluice door',
  q: 'vent hall', r: 'vent door', s: 'B link', t: 'A link', u: 'A door', v: 'B door', w: 'A front',
  y: 'pumphouse east', z: 'pumphouse west',
};

// Attack routes: waypoints walked in order from the rail yard, ending on a site.
export const ATTACK_ROUTES = [
  { site: 'A', name: 'long', path: 'lmk' },
  { site: 'A', name: 'catwalk', path: 'efghj' },
  { site: 'B', name: 'sluice', path: 'nop' },
  { site: 'B', name: 'vent', path: 'efgqr' },
];
// Defender routes from the pumphouse to each site (used to take positions and to retake).
export const DEFEND_ROUTES = { A: ['ytu', 'ihj'], B: ['zsv', 'ihqr'] };

// Held angles: stand at a cell, watch a waypoint. Defenders anchor these; attackers hold post-plant ones.
export const HOLDS = {
  A: [{ at: [43, 10], look: 'k' }, { at: [40, 9], look: 'j' }, { at: [52, 12], look: 'k' }],
  B: [{ at: [12, 13], look: 'p' }, { at: [4, 11], look: 'r' }, { at: [14, 8], look: 'p' }],
  mid: [{ at: [28, 9], look: 'h' }],
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
      } else if (WAYPOINT_NAMES[ch]) map.marks[ch] = { ...place, name: WAYPOINT_NAMES[ch] };
    }
  }
  for (const site of Object.values(map.sites)) {
    for (const p of site.cells) { site.x += p.x / site.cells.length; site.z += p.z / site.cells.length; }
    site.radius = Math.sqrt(site.cells.length) * CELL * 0.5 + 0.9;
  }
  return map;
}

export function cellCenter(c, r, out) {
  out.x = (c + 0.5) * CELL;
  out.z = (r + 0.5) * CELL;
  return out;
}
