// Spawn safety and every tactical hold must remain grounded on walkable map cells.
import { buildMap } from '../game/src/sim/map.js';
import { clearLine } from '../game/src/sim/collide.js';
const map = buildMap();
let seen = 0;
for (const a of map.spawns[0]) for (const d of map.spawns[1]) {
  if (clearLine(map, a.x, 1.62, a.z, d.x, 1.62, d.z)) seen++;
}
let blocked = 0;
for (const [name, list] of Object.entries({ ...map.holds, ...Object.fromEntries(Object.entries(map.postplant).map(([k, v]) => ['post' + k, v])) })) {
  for (const h of list) {
    const c = Math.floor(h.x / map.cell), r = Math.floor(h.z / map.cell);
    if (!map.walk[r * map.w + c]) { blocked++; console.error('blocked hold', name, c, r); }
  }
}
console.log('spawn sightlines:', seen, 'blocked holds:', blocked, 'sites:', Object.keys(map.sites));
if (seen || blocked) process.exit(1);
