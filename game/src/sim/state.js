// The one game state. Everything the simulation knows lives in this object; the view, HUD and
// audio only read it (and the event ring inside it). Created once; rounds reset it in place.
import { TEAMS, TEAM_SIZE, PLAYER_TEAM } from './config.js';
import { buildMap } from './map.js';
import { createRng } from './util.js';
import { createEvents } from './events.js';
import { createActor } from './actors.js';
import { createBrain } from './bots.js';
import { createPlan } from './coach.js';
import { createCore } from './objective.js';
import { createNades, createSmokes } from './grenades.js';

const ROLES = ['entry', 'support', 'anchor', 'support', 'marksman'];
const CALLSIGNS = [
  ['You', 'Rook', 'Tamsin', 'Ozzy', 'Brandt'],
  ['Vale', 'Kesh', 'Morrow', 'Ilse', 'Dunmore'],
];

export function createState(seed) {
  const rng = createRng(seed);
  const state = {
    seed, rng,
    tick: 0, time: 0,
    map: buildMap(),
    teams: TEAMS.map((t, id) => ({ id, name: t.name, side: id, score: 0, lossStreak: 0, lastPay: 0, plan: createPlan() })),
    actors: [],
    player: null,
    round: { number: 0, phase: 'freeze', timer: 0, clock: 0, winner: -1, reason: '', buyOpen: false, planted: false },
    core: createCore(),
    nades: createNades(),
    smokes: createSmokes(),
    intel: [0, 1].map(() => ({ x: 0, z: 0, time: -99, id: -1, count: 0, heardX: 0, heardZ: 0, heardTime: -99 })), // per team: latest sighting and noise
    match: { winner: -1 },
    events: createEvents(),
  };
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < TEAM_SIZE; i++) {
      const isBot = !(team === PLAYER_TEAM && i === 0);
      const a = createActor(state.actors.length, team, CALLSIGNS[team][i], isBot);
      if (isBot) a.brain = createBrain(0.35 + rng() * 0.5, ROLES[i]);
      state.actors.push(a);
    }
  }
  state.player = state.actors.find((a) => !a.isBot);
  return state;
}
