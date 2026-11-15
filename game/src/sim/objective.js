// The Fuse Core, this game's bomb objective: carry, drop, arm, fuse, disarm, detonate (round.js reads the state).
import { DT, OBJECTIVE, SIDE } from './config.js';
import { emit, EV } from './events.js';
import { makeNoise } from './senses.js';
import { siteNear } from './map.js';
import { blast, pay } from './actors.js';

export function createCore() {
  return { state: 'carried', carrier: -1, x: 0, y: 0, z: 0, site: '', fuse: 0, progress: 0, worker: -1, beep: 0 };
}

export function resetCore(state, carrierId) {
  Object.assign(state.core, { state: 'carried', carrier: carrierId, site: '', fuse: 0, progress: 0, worker: -1, beep: 0 });
}

// Busy arming or disarming: movement and trigger are locked.
export function isWorking(state, a) { return state.core.worker === a.id && state.core.progress > 0; }

export function updateCore(state) {
  const core = state.core;
  if (core.state === 'carried') {
    const c = state.actors[core.carrier];
    core.x = c.pos.x; core.y = c.pos.y; core.z = c.pos.z;
    if (!c.alive) { // dropped where the carrier fell
      core.state = 'dropped'; core.carrier = -1;
      stopWork(core);
      emit(state.events, EV.CORE, c.id, -1, 0);
      return;
    }
    // Armed standing still on a site, holding use.
    const site = c.cmd.use && Math.hypot(c.vel.x, c.vel.z) < 0.6 && c.grounded && state.round.phase === 'live'
      && siteNear(state.map, c.pos.x, c.pos.z, 0);
    if (!site) stopWork(core);
    else if (work(state, c, OBJECTIVE.plantTime)) {
      core.state = 'planted'; core.site = site.name; core.fuse = OBJECTIVE.fuse; core.carrier = -1;
      pay(c, OBJECTIVE.reward);
      state.round.planted = true;
      emit(state.events, EV.CORE, c.id, -1, 2);
      makeNoise(state, c, 'alarm'); // the armed core's alarm: every defender knows
    }
  } else if (core.state === 'dropped') {
    for (const a of state.actors) {
      if (!a.alive || state.teams[a.team].side !== SIDE.ATTACK || Math.hypot(a.pos.x - core.x, a.pos.z - core.z) > 1.1) continue;
      core.state = 'carried'; core.carrier = a.id;
      emit(state.events, EV.CORE, a.id, -1, 1);
      return;
    }
  } else if (core.state === 'planted') {
    core.fuse -= DT;
    if ((core.beep -= DT) <= 0) { // beeps quicken as the fuse burns down
      core.beep = Math.max(0.12, core.fuse / OBJECTIVE.fuse);
      emit(state.events, EV.CORE, -1, -1, 4, 0, core.x, core.y, core.z);
    }
    if (core.fuse <= 0) { // the blast: falls off with distance, blocked by walls; no kill reward
      core.state = 'detonated';
      emit(state.events, EV.BLAST, -1, -1, OBJECTIVE.blastRadius, 0, core.x, core.y + 0.5, core.z);
      blast(state, core.x, core.y + 0.5, core.z, OBJECTIVE.blastRadius, OBJECTIVE.blastDamage, 0.5, null, null);
      return;
    }
    for (const a of state.actors) {
      if (!a.alive || !a.cmd.use || state.teams[a.team].side !== SIDE.DEFEND || !a.grounded
        || Math.hypot(a.pos.x - core.x, a.pos.z - core.z) > OBJECTIVE.reach) continue;
      if (work(state, a, a.kit ? OBJECTIVE.kitDefuseTime : OBJECTIVE.defuseTime)) {
        core.state = 'defused';
        pay(a, OBJECTIVE.reward);
        emit(state.events, EV.CORE, a.id, -1, 3);
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
    emit(state.events, EV.CORE, a.id, -1, 5);
    makeNoise(state, a, 'work');
  }
  core.progress += DT / duration;
  if (core.progress < 1) return false;
  stopWork(core);
  return true;
}

function stopWork(core) { core.worker = -1; core.progress = 0; }
