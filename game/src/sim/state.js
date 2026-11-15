// The one game state, created once and reset in place each round; view and HUD only read it.
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
  ['You', 'Carrick', 'Skerry', 'Ozzy', 'Brandt'],
  ['Haldane', 'Kesh', 'Fenn', 'Lowrie', 'Dunmore'],
];

export function createState(seed) {
  const rng = createRng(seed);
  const state = {
    rng, tick: 0, time: 0, map: buildMap(),
    teams: TEAMS.map((t, id) => ({ id, name: t.name, side: id, score: 0, lossStreak: 0, lastPay: 0, plan: createPlan() })),
    actors: [], player: null,
    round: { number: 0, phase: 'freeze', timer: 0, clock: 0, winner: -1, reason: '', buyOpen: false, planted: false, endedAt: -99 },
    core: createCore(),
    nades: createNades(), smokes: createSmokes(),
    intel: [0, 1].map(() => ({ x: 0, z: 0, time: -99, id: -1, count: 0, heardX: 0, heardZ: 0, heardTime: -99 })), // per team: last sighting, last noise
    match: { winner: -1, history: [] },
    events: createEvents(),
  };
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < TEAM_SIZE; i++) {
      const isBot = !(team === PLAYER_TEAM && i === 0), a = createActor(state.actors.length, team, CALLSIGNS[team][i], isBot);
      if (isBot) a.brain = createBrain(0.35 + rng() * 0.5, ROLES[i]);
      else state.player = a;
      state.actors.push(a);
    }
  }
  return state;
}
