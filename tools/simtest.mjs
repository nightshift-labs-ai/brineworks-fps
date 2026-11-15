// Headless sim smoke test: runs the fixed-step simulation (no browser) and reports round results.
// usage: node tools/simtest.mjs [seed] [minutes]
import { createGame, step } from '../game/src/sim/sim.js';
import { drain, EV } from '../game/src/sim/events.js';
import { createBrain } from '../game/src/sim/bots.js';
import { startMatch } from '../game/src/sim/round.js';
const seed = +(process.argv[2] ?? 1), minutes = +(process.argv[3] ?? 6), allBots = process.argv.includes('--bots');
const state = createGame(seed);
if (allBots) { state.player.isBot = true; state.player.brain = createBrain(0.6); startMatch(state); }
let cursor = 0, kills = 0, shots = 0, heads = 0;
const t0 = Date.now();
let lastPhase = '';
const tally = {};
for (let i = 0; i < minutes * 60 * 60; i++) {
  step(state);
  cursor = drain(state.events, cursor, (e) => {
    if (e.type === EV.KILL) { kills++; if (e.w) heads++; }
    if (e.type === EV.SHOT) shots++;
    if (e.type === EV.ROUND && e.v === 1) { const k = `${state.teams[e.a].side === 0 ? 'ATTACK' : 'DEFEND'} ${state.round.reason}`; tally[k] = (tally[k] ?? 0) + 1; }
    if (e.type === EV.ROUND && e.v === 1) console.log(`round ${state.round.number} -> ${state.teams[e.a].name} (${state.round.reason}) at ${(105 - state.round.clock).toFixed(1)}s  score ${state.teams[0].score}-${state.teams[1].score}  core ${state.core.state} ${state.core.site}`);
    if (e.type === EV.CORE && e.v !== 2) console.log(`   core event ${['armed','disarmed','beep'][e.v]} by ${e.a >= 0 ? state.actors[e.a].name : '-'} t=${(105 - state.round.clock).toFixed(1)}`);
  });
  if (state.round.phase !== lastPhase) { lastPhase = state.round.phase; }
}
const p = state.player;
console.log('TALLY', JSON.stringify(tally));
console.log({ kills, heads, shots, ms: Date.now() - t0, ticks: state.tick, player: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)] });
for (const a of state.actors) console.log(a.name.padEnd(8), a.team, a.alive ? 'alive' : 'dead ', 'K', a.kills, 'D', a.deaths, '$', a.money, a.slots.map((w) => w && w.id).join(','), a.pos.x.toFixed(1), a.pos.z.toFixed(1));
