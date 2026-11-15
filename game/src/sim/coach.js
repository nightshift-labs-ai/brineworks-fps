// Team plans, one coach per side; bots.js plays them out.
import { BOT, SIDE } from './config.js';
import { ATTACK_ROUTES, siteNear } from './map.js';
import { emit, EV } from './events.js';

const SETUPS = [ // defence: [weight, where each defender holds] = 2-1-2, 3-1-1, 1-1-3
  [0.6, ['A', 'B', 'tower', 'A', 'B']],
  [0.2, ['A', 'A', 'tower', 'B', 'A']],
  [0.2, ['B', 'B', 'tower', 'A', 'B']],
];

const mate = (a, team) => a.alive && a.isBot && a.team === team;

export function createPlan() { return { site: 'A', rush: false, execute: false, staged: -99, executedAt: -99, rotated: false, fails: { A: 0, B: 0 } }; }

// Attack: a site (less likely one that just failed) split over its two routes plus a lurker, or a save-round rush.
// Defence: a weighted setup.
export function planRound(state, team, call) {
  const plan = team.plan, rng = state.rng, map = state.map;
  const bots = state.actors.filter((a) => a.team === team.id && a.isBot).sort((x, y) => (y.id === state.core.carrier) - (x.id === state.core.carrier));
  for (const { brain: b } of bots) {
    b.target = -1; b.lastSeenTime = b.heardTime = -99; b.path.length = 0;
    b.burstLeft = b.burstPause = b.stuckTime = b.routeIndex = 0; b.smoked = b.staged = b.anchor = b.atHold = false;
  }
  state.intel[team.id].time = -99;
  plan.execute = plan.rotated = false; plan.staged = plan.executedAt = -99;
  if (team.side === SIDE.ATTACK) {
    const weightA = 0.4 ** plan.fails.A, weightB = 0.4 ** plan.fails.B;
    plan.site = rng() * (weightA + weightB) < weightA ? 'A' : 'B';
    plan.execute = plan.rush = call === 'save';
    const routes = ATTACK_ROUTES.filter((r) => r.site === plan.site);
    const lurkRoute = rng.pick(ATTACK_ROUTES.filter((r) => r.site !== plan.site));
    bots.forEach((a, i) => {
      const b = a.brain;
      b.lurk = !plan.rush && i === bots.length - 1 && bots.length >= 4;
      const route = b.lurk ? lurkRoute : plan.rush ? routes[0] : routes[i % 2];
      b.plan = 'route'; b.route = route.path; b.stage = route.stage; b.site = route.site;
      pickHold(state, a, map.postplant[b.site]);
    });
    radio(state, bots[0], plan.rush ? `rush ${plan.site}, no waiting` : `we hit ${plan.site}, gather and go together`);
  } else {
    let roll = rng(), setup = SETUPS[0][1];
    for (const [w, sites] of SETUPS) { if (roll < w) { setup = sites; break; } roll -= w; }
    bots.forEach((a, i) => {
      const b = a.brain, where = setup[i % setup.length];
      b.plan = 'hold'; b.anchor = b.role === 'anchor';
      b.site = where === 'tower' ? (rng() < 0.5 ? 'A' : 'B') : where;
      pickHold(state, a, map.holds[where]);
    });
  }
}

// When the attack executes (gathered, waited, spotted or late) and when the defence rotates.
export function updateCoach(state) {
  for (const team of state.teams) {
    const plan = team.plan;
    if (team.side === SIDE.ATTACK) {
      if (plan.execute) continue;
      let staged = 0, going = 0;
      for (const a of state.actors) if (mate(a, team.id) && !a.brain.lurk) { going++; if (a.brain.staged) staged++; }
      if (staged && plan.staged < 0) plan.staged = state.time;
      const spotted = state.time - state.intel[team.id].time < 1.5, waited = plan.staged >= 0 && state.time - plan.staged > BOT.stageWait;
      if (going && (staged >= going - 1 || waited || state.round.clock < 45 || (staged && spotted))) {
        plan.execute = true; plan.executedAt = state.time;
        radio(state, firstBot(state, team.id), `go ${plan.site} now`);
      }
    } else if (!plan.rotated) {
      // One rotation a round: to a site with two sightings close together or the core heard being armed.
      const core = state.core, intel = state.intel[team.id];
      const hit = (core.state === 'carried' && core.progress > 0 ? siteNear(state.map, core.x, core.z, 0) : null)
        ?? (intel.count >= 2 && state.time - intel.time < 4 ? siteNear(state.map, intel.x, intel.z, 19) : null);
      if (!hit) continue;
      plan.rotated = true;
      for (const a of state.actors) {
        const b = a.brain;
        if (!mate(a, team.id) || b.target >= 0 || b.site === hit.name || b.anchor) continue;
        b.site = hit.name; b.plan = 'hold';
        pickHold(state, a, state.map.holds[hit.name]);
      }
      radio(state, firstBot(state, team.id), `they are on ${hit.name}, rotate`);
    }
  }
}

// Take the first spot in `list` no teammate already holds (else the bot's own slot in the list).
export function pickHold(state, a, list) {
  let pick = list[a.id % list.length];
  spots: for (const hold of list) {
    for (const o of state.actors) if (o !== a && mate(o, a.team) && o.brain.holdX === hold.x && o.brain.holdZ === hold.z) continue spots;
    pick = hold;
    break;
  }
  const b = a.brain;
  b.holdX = pick.x; b.holdZ = pick.z; b.lookX = pick.lookX; b.lookZ = pick.lookZ;
}

function firstBot(state, team) {
  for (const a of state.actors) if (mate(a, team)) return a;
}

export function radio(state, a, text) {
  if (a) emit(state.events, EV.RADIO, a.id, a.team).text = text;
}

// After a round: an attack that failed at a site makes the coach less keen to hit it again.
export function reviewRound(state, winner) {
  for (const { side, plan, id } of state.teams) {
    if (side === SIDE.ATTACK) plan.fails[plan.site] = winner === id ? 0 : Math.min(2, plan.fails[plan.site] + 1);
  }
}
