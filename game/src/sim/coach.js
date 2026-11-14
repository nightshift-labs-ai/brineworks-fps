// Team plans, one coach per side (bots.js plays them out). Attack: pick a site (avoiding one that
// failed twice), split over its two routes, gather at the stage points and execute together, or
// rush on a save round; one lurker holds the other site. Defence: a 2-1-2, 3-1-1 or 1-1-3 setup on
// the held angles, rotations to a site the team has seen or heard being hit, and the retake.
import { BOT, SIDE, HEARING } from './config.js';
import { ATTACK_ROUTES, HOLDS, POSTPLANT } from './map.js';
import { emit, EV } from './events.js';

const SETUPS = [ // [weight, site of each defender in order]
  [0.6, ['A', 'B', 'yard', 'A', 'B']],
  [0.2, ['A', 'A', 'yard', 'B', 'A']],
  [0.2, ['B', 'B', 'yard', 'A', 'B']],
];

export function createPlan() { return { site: 'A', rush: false, execute: false, staged: -99, rotated: false, fails: { A: 0, B: 0 } }; }

// Give every bot of a team its job for the round (call: the team's buy call from economy.js).
export function planRound(state, team, call) {
  const plan = team.plan, rng = state.rng;
  const bots = state.actors.filter((a) => a.team === team.id && a.isBot).sort((x, y) => (y.id === state.core.carrier) - (x.id === state.core.carrier));
  for (const a of bots) resetBrain(a.brain);
  state.intel[team.id].time = -99;
  plan.execute = false; plan.staged = -99; plan.rotated = false;
  if (team.side === SIDE.ATTACK) {
    const weightA = 0.4 ** plan.fails.A, weightB = 0.4 ** plan.fails.B;
    plan.site = rng() * (weightA + weightB) < weightA ? 'A' : 'B';
    plan.rush = call === 'save';
    const routes = ATTACK_ROUTES.filter((r) => r.site === plan.site);
    const lurkRoute = rng.pick(ATTACK_ROUTES.filter((r) => r.site !== plan.site));
    bots.forEach((a, i) => {
      const b = a.brain;
      b.lurk = !plan.rush && i === bots.length - 1 && bots.length >= 4;
      const route = b.lurk ? lurkRoute : plan.rush ? routes[0] : routes[i % 2];
      b.plan = 'route'; b.route = route.path; b.stage = route.stage; b.site = route.site;
      pickHold(state, a, POSTPLANT[b.site]);
    });
    if (plan.rush) plan.execute = true;
    radio(state, bots[0], plan.rush ? `rush ${plan.site}, no waiting` : `we hit ${plan.site}, gather and go together`);
  } else {
    let roll = rng(), setup = SETUPS[0][1];
    for (const [w, sites] of SETUPS) { if (roll < w) { setup = sites; break; } roll -= w; }
    bots.forEach((a, i) => {
      const b = a.brain, where = b.role === 'marksman' && i >= 3 ? 'A' : setup[i % setup.length];
      b.plan = 'hold'; b.anchor = b.role === 'anchor';
      b.site = where === 'yard' ? (rng() < 0.5 ? 'A' : 'B') : where;
      pickHold(state, a, HOLDS[where]);
    });
  }
}

function resetBrain(b) {
  b.target = -1; b.lastSeenTime = -99; b.heardTime = -99; b.path.length = 0;
  b.burstLeft = 0; b.burstPause = 0; b.stuckTime = 0; b.smoked = false; b.staged = false; b.anchor = false;
}

// Per tick: decide when the attack executes and when defenders rotate.
export function updateCoach(state) {
  for (const team of state.teams) {
    const plan = team.plan;
    if (team.side === SIDE.ATTACK) {
      if (plan.execute) continue;
      let staged = 0, going = 0;
      for (const a of state.actors) {
        if (!a.alive || !a.isBot || a.team !== team.id || a.brain.lurk) continue;
        going++;
        if (a.brain.staged) staged++;
      }
      if (staged && plan.staged < 0) plan.staged = state.time;
      const spotted = state.time - state.intel[team.id].time < 1.5;
      if (going && (staged >= going - 1 || (plan.staged >= 0 && state.time - plan.staged > BOT.stageWait) || state.round.clock < 45 || (staged && spotted))) {
        plan.execute = true;
        radio(state, firstBot(state, team.id), `go ${plan.site} now`);
      }
    } else {
      // One rotation a round: to a site where two sightings came in close together, or where the
      // core is heard being armed. (After the core is armed every defender retakes, see bots.js.)
      const core = state.core, intel = state.intel[team.id];
      const arming = core.state === 'carried' && core.progress > 0 ? siteNear(state, core.x, core.z, HEARING.work) : null;
      const seen = intel.count >= 2 && state.time - intel.time < 4 ? siteNear(state, intel.x, intel.z, 22) : null;
      const hit = arming ?? seen;
      if (hit && !plan.rotated) {
        plan.rotated = true;
        rotateToSite(state, team, hit.name);
      }
    }
  }
}

// Send every defender bot that is not anchoring the hit site's angles to hold that site.
export function rotateToSite(state, team, site) {
  for (const a of state.actors) {
    if (!a.alive || !a.isBot || a.team !== team.id || a.brain.target >= 0) continue;
    const b = a.brain;
    if (b.anchor && b.site !== site) continue;
    if (b.site === site) continue;
    b.site = site; b.plan = 'hold';
    pickHold(state, a, HOLDS[site]);
  }
  radio(state, firstBot(state, team.id), `they are on ${site}, rotate`);
}

// Take the first spot in `list` no teammate already holds (else the bot's own slot in the list).
export function pickHold(state, a, list) {
  let pick = list[a.id % list.length];
  for (const hold of list) {
    const x = (hold.at[0] + 0.5) * state.map.cell, z = (hold.at[1] + 0.5) * state.map.cell;
    let taken = false;
    for (const o of state.actors) if (o !== a && o.isBot && o.alive && o.team === a.team && o.brain.holdX === x && o.brain.holdZ === z) taken = true;
    if (!taken) { pick = hold; break; }
  }
  const b = a.brain;
  b.holdX = (pick.at[0] + 0.5) * state.map.cell;
  b.holdZ = (pick.at[1] + 0.5) * state.map.cell;
  const look = state.map.marks[pick.look];
  b.lookX = look.x; b.lookZ = look.z;
}

export function siteNear(state, x, z, range) {
  for (const site of Object.values(state.map.sites)) if (Math.hypot(x - site.x, z - site.z) < range) return site;
  return null;
}

function firstBot(state, team) {
  for (const a of state.actors) if (a.alive && a.isBot && a.team === team) return a;
  return null;
}

// A radio line from a bot to its team (the HUD shows the player's team's lines in the feed).
export function radio(state, a, text) {
  if (a) emit(state.events, EV.RADIO, a.id, a.team).text = text;
}

// After a round: an attack that failed at a site makes the coach less keen to hit it again.
export function reviewRound(state, winner) {
  for (const team of state.teams) {
    if (team.side !== SIDE.ATTACK) continue;
    const fails = team.plan.fails;
    fails[team.plan.site] = winner === team.id ? 0 : Math.min(2, fails[team.plan.site] + 1);
  }
}
