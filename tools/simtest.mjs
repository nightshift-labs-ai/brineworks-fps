// Headless sim smoke test: runs the fixed-step simulation (no browser) and reports round results.
// usage: node tools/simtest.mjs [seed] [minutes]
import { createGame, step } from '../game/src/sim/sim.js';
import { drain, EV } from '../game/src/sim/events.js';
const seed = +(process.argv[2] ?? 1), minutes = +(process.argv[3] ?? 6);
const state = createGame(seed);
let cursor = 0, kills = 0, shots = 0, heads = 0;
const t0 = Date.now();
let lastPhase = '';
for (let i = 0; i < minutes * 60 * 60; i++) {
  step(state);
  cursor = drain(state.events, cursor, (e) => {
    if (e.type === EV.KILL) { kills++; if (e.w) heads++; }
    if (e.type === EV.SHOT) shots++;
    if (e.type === EV.ROUND && e.v === 1) console.log(`round ${state.round.number} -> ${state.teams[e.a].name} (${state.round.reason}) at ${(105 - state.round.clock).toFixed(1)}s  score ${state.teams[0].score}-${state.teams[1].score}`);
  });
  if (state.round.phase !== lastPhase) { lastPhase = state.round.phase; }
}
const p = state.player;
console.log({ kills, heads, shots, ms: Date.now() - t0, ticks: state.tick, player: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)] });
for (const a of state.actors) console.log(a.name.padEnd(8), a.team, a.alive ? 'alive' : 'dead ', 'K', a.kills, 'D', a.deaths, '$', a.money, a.slots.map((w) => w && w.id).join(','), a.pos.x.toFixed(1), a.pos.z.toFixed(1));
