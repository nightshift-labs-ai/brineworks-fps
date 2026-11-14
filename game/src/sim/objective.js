// The Fuse Core: the attackers carry it to site A or B and arm it (hold E for plantTime, standing
// still); once armed it burns for `fuse` seconds and detonates unless a defender holds E on it for
// defuseTime. A dead carrier drops it; an attacker walking over it picks it up. This module only
// moves the core through its states; round.js reads them to decide the round.
import { DT, OBJECTIVE, SIDE, ECON } from './config.js';
import { emit, EV } from './events.js';
import { makeNoise } from './senses.js';
import { clearLine } from './collide.js';
import { kill } from './actors.js';

export function createCore() {
  return { state: 'carried', carrier: -1, x: 0, y: 0, z: 0, site: '', fuse: 0, progress: 0, worker: -1, beep: 0 };
}

export function resetCore(state, carrierId) {
  const core = state.core;
  core.state = 'carried'; core.carrier = carrierId; core.site = ''; core.fuse = 0;
  core.progress = 0; core.worker = -1; core.beep = 0;
}

// The site an actor stands in, or null.
export function siteAt(state, x, z) {
  for (const site of Object.values(state.map.sites)) {
    if (Math.hypot(x - site.x, z - site.z) < site.radius) return site;
  }
  return null;
}

const side = (state, a) => state.teams[a.team].side;

// True while an actor is busy arming or disarming (movement and trigger are locked).
export function isWorking(state, a) { return state.core.worker === a.id && state.core.progress > 0; }

export function updateCore(state) {
  const core = state.core;
  if (core.state === 'carried') {
    const c = state.actors[core.carrier];
    if (!c.alive) { drop(state, c); return; }
    core.x = c.pos.x; core.y = c.pos.y; core.z = c.pos.z;
    const site = siteAt(state, c.pos.x, c.pos.z);
    const still = Math.hypot(c.vel.x, c.vel.z) < 0.6 && c.grounded;
    if (c.cmd.use && site && still && state.round.phase === 'live') work(state, c, OBJECTIVE.plantTime, () => plant(state, c, site));
    else stopWork(core);
  } else if (core.state === 'dropped') {
    for (const a of state.actors) {
      if (!a.alive || side(state, a) !== SIDE.ATTACK) continue;
      if (Math.hypot(a.pos.x - core.x, a.pos.z - core.z) < 1.1) {
        core.state = 'carried'; core.carrier = a.id;
        emit(state.events, EV.CORE, a.id, -1, 1);
        return;
      }
    }
  } else if (core.state === 'planted') {
    core.fuse -= DT;
    core.beep -= DT;
    if (core.beep <= 0) { // beeps quicken as the fuse burns down
      core.beep = Math.max(0.12, core.fuse / OBJECTIVE.fuse);
      const e = emit(state.events, EV.CORE, -1, -1, 4);
      e.x = core.x; e.y = core.y; e.z = core.z;
    }
    if (core.fuse <= 0) { detonate(state); return; }
    let defuser = null;
    for (const a of state.actors) {
      if (a.alive && a.cmd.use && side(state, a) === SIDE.DEFEND && a.grounded
        && Math.hypot(a.pos.x - core.x, a.pos.z - core.z) < OBJECTIVE.reach) { defuser = a; break; }
    }
    if (defuser) work(state, defuser, OBJECTIVE.defuseTime, () => defuse(state, defuser));
    else stopWork(core);
  }
}

// Hold-to-act progress shared by arming and disarming; switching hands restarts it.
function work(state, a, duration, done) {
  const core = state.core;
  if (core.worker !== a.id) { core.worker = a.id; core.progress = 0; emit(state.events, EV.CORE, a.id, -1, 5); }
  core.progress += DT / duration;
  if (core.progress >= 1) { core.progress = 0; core.worker = -1; done(); }
}

function stopWork(core) { core.worker = -1; core.progress = 0; }

function drop(state, carrier) {
  const core = state.core;
  core.state = 'dropped';
  core.carrier = -1;
  core.x = carrier.pos.x; core.y = carrier.pos.y; core.z = carrier.pos.z;
  stopWork(core);
  emit(state.events, EV.CORE, carrier.id, -1, 0);
}

function plant(state, a, site) {
  const core = state.core;
  core.state = 'planted';
  core.site = site.name;
  core.fuse = OBJECTIVE.fuse;
  core.x = a.pos.x; core.y = a.pos.y; core.z = a.pos.z;
  core.carrier = -1;
  a.money = Math.min(ECON.max, a.money + OBJECTIVE.reward);
  state.round.planted = true;
  emit(state.events, EV.CORE, a.id, -1, 2);
  makeNoise(state, a, 200); // every defender knows
}

function defuse(state, a) {
  state.core.state = 'defused';
  a.money = Math.min(ECON.max, a.money + OBJECTIVE.reward);
  emit(state.events, EV.CORE, a.id, -1, 3);
}

// The blast: heavy damage that falls off with distance, blocked by walls.
function detonate(state) {
  const core = state.core;
  core.state = 'detonated';
  const e = emit(state.events, EV.BLAST, -1, -1, OBJECTIVE.blastRadius);
  e.x = core.x; e.y = core.y + 0.5; e.z = core.z;
  for (const a of state.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - core.x, a.pos.z - core.z);
    if (d > OBJECTIVE.blastRadius || !clearLine(state.map, core.x, core.y + 0.6, core.z, a.pos.x, a.pos.y + 1, a.pos.z)) continue;
    a.hp -= Math.round(OBJECTIVE.blastDamage * (1 - d / OBJECTIVE.blastRadius));
    if (a.hp <= 0) kill(state, a, null, null, false);
  }
}
