// The Fuse Core, this game's bomb: carry, drop, arm, fuse, disarm, detonate; pays arm and disarm, deals the blast.
import { DT, OBJECTIVE, SIDE } from './config.js';
import { emit, EV } from './events.js';
import { makeNoise } from './senses.js';
import { siteNear } from './map.js';
import { nearestWalkable } from './nav.js';
import { blast, pay } from './actors.js';

export function createCore() {
  return { state: 'carried', carrier: -1, x: 0, y: 0, z: 0, site: '', fuse: 0, progress: 0, worker: -1, beep: 0, droppedAt: -99 };
}

export function resetCore(state, carrierId) {
  Object.assign(state.core, createCore(), { carrier: carrierId });
}

// Who is arming or disarming (-1: nobody): their movement and trigger are locked.
export const workerOf = (core) => (core.progress > 0 ? core.worker : -1);

export function updateCore(state) {
  const core = state.core, map = state.map;
  if (core.state === 'carried') {
    const c = state.actors[core.carrier];
    Object.assign(core, c.pos);
    if (!c.alive || c.cmd.drop) { // fell or let go (X): onto the floor of the nearest cell bots can walk to
      const n = nearestWalkable(map, core.x, core.z);
      core.x = (n % map.w + 0.5) * map.cell; core.y = map.height[n]; core.z = ((n / map.w | 0) + 0.5) * map.cell;
      core.state = 'dropped'; core.carrier = -1; core.droppedAt = state.time;
      stopWork(core);
      return;
    }
    // Armed standing still on a site, holding use.
    const site = c.cmd.use && Math.hypot(c.vel.x, c.vel.z) < 0.6 && c.grounded && state.round.phase === 'live'
      && siteNear(map, c.pos.x, c.pos.z, 0);
    if (!site) stopWork(core);
    else if (work(state, c, OBJECTIVE.plantTime)) {
      core.state = 'planted'; core.site = site.name; core.fuse = OBJECTIVE.fuse; core.carrier = -1;
      pay(c, OBJECTIVE.reward);
      state.round.planted = true;
      emit(state.events, EV.CORE, c.id, -1, 0);
      makeNoise(state, c, 'alarm'); // every defender hears it
    }
  } else if (core.state === 'dropped' && state.time - core.droppedAt > 1) { // a second for the dropper to step away
    for (const a of state.actors) {
      if (!a.alive || state.teams[a.team].side !== SIDE.ATTACK || Math.hypot(a.pos.x - core.x, a.pos.z - core.z) > OBJECTIVE.reach) continue;
      core.state = 'carried'; core.carrier = a.id;
      return;
    }
  } else if (core.state === 'planted') {
    core.fuse -= DT;
    if ((core.beep -= DT) <= 0) { // beeps quicken as the fuse burns down
      core.beep = Math.max(0.12, core.fuse / OBJECTIVE.fuse);
      emit(state.events, EV.CORE, -1, -1, 2, 0, core.x, core.y, core.z);
    }
    if (core.fuse <= 0) { // the blast: falls off with distance, blocked by walls; no kill reward
      core.state = 'detonated';
      emit(state.events, EV.BLAST, -1, -1, OBJECTIVE.blastRadius, 0, core.x, core.y + 0.5, core.z);
      blast(state, core.x, core.y + 0.5, core.z, OBJECTIVE.blastRadius, OBJECTIVE.blastDamage, OBJECTIVE.armorPen, null, null);
      return;
    }
    for (const a of state.actors) {
      if (!a.alive || !a.cmd.use || state.teams[a.team].side !== SIDE.DEFEND || !a.grounded
        || Math.hypot(a.pos.x - core.x, a.pos.z - core.z) > OBJECTIVE.reach) continue;
      if (work(state, a, a.kit ? OBJECTIVE.kitDefuseTime : OBJECTIVE.defuseTime)) {
        core.state = 'defused';
        pay(a, OBJECTIVE.reward);
        emit(state.events, EV.CORE, a.id, -1, 1);
      }
      return;
    }
    stopWork(core);
  }
}

// Hold-to-act progress shared by arming and disarming; switching hands restarts it. True when done.
function work(state, a, duration) {
  const core = state.core;
  if (core.worker !== a.id) {
    core.worker = a.id; core.progress = 0;
    makeNoise(state, a, 'work');
  }
  core.progress += DT / duration;
  if (core.progress < 1) return false;
  stopWork(core);
  return true;
}

function stopWork(core) { core.worker = -1; core.progress = 0; }
