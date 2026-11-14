// Map check: lines of sight between the two spawn areas at standing eye height (should be none),
// plus that every hold / waypoint stands on a walkable cell.
import { buildMap, HOLDS, POSTPLANT } from '../game/src/sim/map.js';
import { clearLine } from '../game/src/sim/collide.js';
const map = buildMap();
const cells = (r0, r1) => { const out = []; for (let r = r0; r <= r1; r++) for (let c = 0; c < map.w; c++) if (map.walk[r * map.w + c]) out.push([c, r]); return out; };
const atk = cells(36, 42).filter(([c]) => c >= 20 && c <= 35), def = cells(1, 13).filter(([c]) => c >= 20 && c <= 35);
let seen = 0; const examples = [];
for (const [ac, ar] of atk) for (const [dc, dr] of def) {
  if (clearLine(map, (ac + .5) * 1.5, 1.62, (ar + .5) * 1.5, (dc + .5) * 1.5, 1.62, (dr + .5) * 1.5)) { seen++; if (examples.length < 5) examples.push([ac, ar, dc, dr]); }
}
console.log('spawn sightlines:', seen, examples);
for (const [k, list] of Object.entries({ ...HOLDS, ...Object.fromEntries(Object.entries(POSTPLANT).map(([s, l]) => ['post' + s, l])) })) {
  for (const h of list) { const i = h.at[1] * map.w + h.at[0]; if (!map.walk[i]) console.log('hold not walkable', k, h.at, String.fromCharCode(map.kind[i])); }
}
console.log('marks', Object.keys(map.marks).length, 'sites', Object.keys(map.sites));
