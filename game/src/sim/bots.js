// One brain per bot: fills the same command record the player's input fills, every tick.
import { BOT, DT, WEAPONS, SIDE, OBJECTIVE, HEARING, BODY } from './config.js';
import { placeName, siteNear } from './map.js';
import { canSee } from './senses.js';
import { LOB, predictBurst } from './grenades.js';
import { findPath, createPath } from './nav.js';
import { eyeOf, heightOf } from './actors.js';
import { pickHold, radio } from './coach.js';
import { aliveCount } from './round.js';
import { wrapAngle, yawTo, dist2 } from './util.js';

const HEARD = { step: 'footsteps', shot: 'gunfire', reload: 'a reload', work: 'the core being worked', bounce: 'a grenade' };
const away2 = (a, x, z) => dist2(a.pos.x, a.pos.z, x, z), yawFrom = (a, x, z) => yawTo(a.pos.x, a.pos.z, x, z);

export function createBrain(skill, role) {
  return {
    skill, role, // skill 0..1 scales reaction, aim and head aim
    plan: 'hold', // 'route' walks `route` (waiting at `stage` until the team executes), then holds
    route: '', routeIndex: 0, stage: '', staged: false, lurk: false, site: 'A', anchor: false,
    holdX: 0, holdZ: 0, lookX: 0, lookZ: 0, atHold: false,
    path: createPath(), goalX: 0, goalZ: 0, repathAt: 0,
    target: -1, reactTimer: 0, errYaw: 0, errPitch: 0, aimHead: false, lostId: -1, lostAt: -99,
    lastSeenId: -1, lastSeenX: 0, lastSeenZ: 0, lastSeenTime: -99,
    heardX: 0, heardZ: 0, heardTime: -99, heardKind: '',
    burstLeft: 0, burstPause: 0, magSeen: 0, strafe: 1, strafeTimer: 0, crouchSpray: false,
    stuckTime: 0, scan: 0, smoked: false, fragAt: -99, calledAt: -99,
  };
}

// Order: finish arming/disarming, fight, the core, frag a ducked target, chase it, a noise, the plan.
export function think(state, a) {
  const b = a.brain, cmd = a.cmd, core = state.core, now = state.time, defends = state.teams[a.team].side === SIDE.DEFEND;
  cmd.moveX = cmd.moveZ = 0; cmd.fire = cmd.jump = cmd.reload = cmd.walk = cmd.use = cmd.aim = false;
  cmd.slot = -1; cmd.toss = ''; cmd.tossRange = 0;
  if (state.round.phase === 'freeze') { cmd.crouch = false; return; }
  if ((state.tick + a.id) % BOT.thinkEvery === 0) perceive(state, a, b);
  if (b.lastSeenTime > -99 && !state.actors[b.lastSeenId].alive) b.lastSeenTime = -99;
  if (core.worker === a.id && core.progress > 0.6) { cmd.use = true; cmd.crouch = defends; return; }
  const w = a.slots[a.active];
  if (!w.mag && !w.reserve) { // dry: the sidearm, else drop the fight rather than strafe unarmed
    if (a.active === 0 && a.slots[1].mag + a.slots[1].reserve) cmd.slot = 1;
    else { b.target = -1; b.lastSeenTime = -99; }
  }
  if (b.target >= 0) { engage(state, a, b, state.actors[b.target]); return; }
  cmd.crouch = false;
  if (w.mag < WEAPONS[w.id].mag * 0.4 && w.reserve > 0) cmd.reload = true;
  if (playObjective(state, a, b)) return;
  const lost = now - b.lastSeenTime;
  if (lost > 0.6 && lost < 3 && a.grenades.frag > 0 && now - b.fragAt > 8 && away2(a, b.lastSeenX, b.lastSeenZ) < 400
    && clearOfFriends(state, a, predictBurst(state, a, b.lastSeenX, b.lastSeenZ))) { b.fragAt = now; toss(a, b.lastSeenX, b.lastSeenZ, 'frag'); return; }
  if (a.lastHurtBy >= 0 && now - a.lastHurtTime < 0.2) {
    const s = state.actors[a.lastHurtBy].pos;
    b.heardX = s.x; b.heardZ = s.z; b.heardTime = now;
  }
  if (lost < 2.5) {
    // A defender on its angle keeps it and pre-aims where the enemy vanished; others close in.
    if (defends && b.plan === 'hold') followPlan(state, a, b);
    else if (away2(a, b.lastSeenX, b.lastSeenZ) < 300) goTo(state, a, b.lastSeenX, b.lastSeenZ);
    lookAt(a, b.lastSeenX, b.lastSeenZ);
  } else if (now - b.heardTime < 3.5) {
    if (b.heardTime === now && now - b.calledAt > 6 && HEARD[b.heardKind]) {
      b.calledAt = now;
      radio(state, a, `${HEARD[b.heardKind]} at ${placeName(state.map, b.heardX, b.heardZ)}`);
    }
    // Check a noise near it or its post (not anchors), else keep the plan and listen.
    const near = away2(a, b.heardX, b.heardZ) < 400 || dist2(b.holdX, b.holdZ, b.heardX, b.heardZ) < 225;
    if (near && b.plan === 'hold' && !b.anchor) goTo(state, a, b.heardX, b.heardZ, true);
    else followPlan(state, a, b);
    lookAt(a, b.heardX, b.heardZ);
  } else followPlan(state, a, b);
}

function perceive(state, a, b) {
  const rng = state.rng, now = state.time;
  let best = null, bestD = Infinity;
  for (const e of state.actors) {
    if (!e.alive || e.team === a.team) continue;
    const d = away2(a, e.pos.x, e.pos.z) * (e.id === b.target ? 0.5 : 1); // stick to the current target
    if (d < bestD && canSee(state, a, e)) { best = e; bestD = d; }
  }
  if (!best) {
    if (b.target >= 0) { b.lostId = b.target; b.lostAt = now; }
    b.target = -1;
    return;
  }
  const { x, z } = best.pos;
  if (best.id !== b.target && !(best.id === b.lostId && now - b.lostAt < 0.6)) {
    // A fresh target: slower at range or moving, faster down a pre-aimed angle (defenders' edge); sloppy aim first.
    const off = Math.abs(wrapAngle(yawFrom(a, x, z) - a.yaw)), moving = Math.hypot(a.vel.x, a.vel.z) > 1.5;
    const slow = (1.25 - b.skill * 0.5) * (1 + Math.sqrt(bestD) / 50) * (off < 0.4 && !moving ? 0.45 : moving ? 1.4 : 1);
    const err = BOT.aimError * slow;
    b.reactTimer = rng.range(BOT.reactMin, BOT.reactMax) * slow;
    b.errYaw = rng.range(-err, err);
    b.errPitch = rng.range(-err, err) * 0.5;
    b.aimHead = rng() < 0.15 + b.skill * 0.25;
    b.burstLeft = 0;
    b.crouchSpray = rng() < 0.35;
    if (now - b.calledAt > 4) { b.calledAt = now; radio(state, a, `contact, ${placeName(state.map, x, z)}`); }
  }
  b.target = b.lastSeenId = best.id; b.lastSeenX = x; b.lastSeenZ = z; b.lastSeenTime = now;
  // Team intel (coach rotations, the radar): sightings of different enemies close together add up.
  const intel = state.intel[a.team], close = now - intel.time < 4 && dist2(intel.x, intel.z, x, z) < 400;
  intel.count = close ? intel.count + (intel.id !== best.id ? 1 : 0) : 1;
  intel.x = x; intel.z = z; intel.time = now; intel.id = best.id;
}

// The Fuse Core once nobody is in sight; true when it took the bot's turn.
function playObjective(state, a, b) {
  const core = state.core, cmd = a.cmd, map = state.map, quiet = state.time - b.lastSeenTime > 1.2;
  const coreDist = Math.hypot(a.pos.x - core.x, a.pos.z - core.z);
  if (state.teams[a.team].side === SIDE.ATTACK) {
    if (core.state === 'carried' && core.carrier === a.id) {
      b.lurk = false; // a lurker with the core joins the push
      if (siteNear(map, a.pos.x, a.pos.z, 0) && quiet) { cmd.use = true; return true; }
      if (b.plan === 'hold') { goTo(state, a, map.sites[b.site].x, map.sites[b.site].z); return true; }
      return false;
    }
    if (core.state === 'dropped' && nearestTo(state, a, core.x, core.z)) { goTo(state, a, core.x, core.z); return true; }
    if (core.state === 'planted') {
      if (core.worker >= 0 && coreDist < HEARING.work) { goTo(state, a, core.x, core.z); return true; } // heard the disarm
      if (b.site !== core.site || b.plan !== 'hold') { b.site = core.site; b.plan = 'hold'; pickHold(state, a, map.postplant[core.site]); }
    }
    return false;
  }
  if (core.state !== 'planted') return false;
  // Retake: whoever is closest disarms when the coast is clear; the others cover the site.
  if (!nearestTo(state, a, core.x, core.z)) {
    if (b.site !== core.site) { b.site = core.site; b.plan = 'hold'; pickHold(state, a, map.holds[core.site]); }
    return false;
  }
  if (coreDist < OBJECTIVE.reach * 0.8 && quiet) {
    if (core.worker < 0) radio(state, a, 'disarming, cover me'); // once: next tick it is the worker
    cmd.use = cmd.crouch = true;
    lookAt(a, core.x, core.z, 1, Math.atan2(core.y - (a.pos.y + eyeOf(a)), coreDist));
  } else goTo(state, a, core.x, core.z);
  return true;
}

// The player counts only while working the core.
function nearestTo(state, a, x, z) {
  const d = away2(a, x, z);
  for (const o of state.actors) if (o !== a && o.alive && o.team === a.team && (o.isBot || state.core.worker === o.id) && dist2(o.pos.x, o.pos.z, x, z) < d) return false;
  return true;
}

// Nobody on its side within 8 m of p, itself included.
function clearOfFriends(state, a, p) {
  for (const o of state.actors) if (o.alive && o.team === a.team && dist2(o.pos.x, o.pos.z, p.x, p.z) < 64) return false;
  return true;
}

function engage(state, a, b, t) {
  const cmd = a.cmd, w = a.slots[a.active], def = WEAPONS[w.id], rng = state.rng;
  const th = heightOf(t), ty = t.pos.y + (b.aimHead ? th - BODY.headRadius : th * 0.68), d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
  // Aim error settles while tracking and grows as the target crosses the view; part of the recoil is pulled down.
  const settle = Math.exp(-BOT.aimSettle * (0.6 + b.skill) * DT), lateral = Math.abs(t.vel.x * Math.cos(a.yaw) - t.vel.z * Math.sin(a.yaw));
  b.errYaw = b.errYaw * settle + (rng() - 0.5) * lateral * 0.0025;
  b.errPitch *= settle;
  const comp = 0.55 + b.skill * 0.3;
  const wantYaw = yawFrom(a, t.pos.x, t.pos.z) + b.errYaw - a.punchYaw * comp;
  const wantPitch = Math.atan2(ty - (a.pos.y + eyeOf(a)), d) + b.errPitch - a.punchPitch * comp;
  turnToward(a, wantYaw, wantPitch, BOT.turnRate * (0.8 + b.skill * 0.5));
  b.reactTimer -= DT;
  const tolerance = Math.atan2(0.32, d) + 0.01;
  const onTarget = Math.abs(wrapAngle(cmd.yaw - wantYaw)) < tolerance && Math.abs(cmd.pitch - wantPitch) < tolerance * 1.5;
  // Automatics burst (longer up close; the spray resets in the pause), others tap; shots counted from the mag.
  const fired = b.magSeen - w.mag;
  b.magSeen = w.mag;
  if (fired > 0 && b.burstLeft > 0 && (b.burstLeft -= fired) <= 0) {
    b.burstLeft = 0;
    b.burstPause = def.auto ? rng.range(0.18, 0.4) : rng.range(0.12, 0.3) + d * 0.004;
  }
  if (b.burstPause > 0) b.burstPause -= DT;
  cmd.aim = !!def.scope;
  const ready = b.reactTimer <= 0 && b.burstPause <= 0 && w.mag > 0 && a.reloadTimer <= 0;
  if (ready && onTarget) {
    if (b.burstLeft <= 0) b.burstLeft = def.auto ? Math.round(rng.range(BOT.burst[0], BOT.burst[1]) * (d < 10 ? 2 : 1)) : 1;
    cmd.fire = def.auto || !a.triggerHeld;
  }
  if (w.mag === 0) cmd.reload = true;
  // Stand to shoot (spread follows speed), strafe between bursts, an SMG closes in; a holding defender stays.
  const shooting = b.burstLeft > 0 && ready;
  const dug = b.plan === 'hold' && state.teams[a.team].side === SIDE.DEFEND && away2(a, b.holdX, b.holdZ) < 1;
  cmd.crouch = dug ? (!shooting && a.id % 2 === 0) || b.crouchSpray : shooting && b.crouchSpray && d > 12;
  if (shooting || dug) return;
  if ((b.strafeTimer -= DT) <= 0) { b.strafe = -b.strafe; b.strafeTimer = rng.range(0.35, 0.8); }
  cmd.moveX = b.strafe;
  if (def.kind === 'smg' && d > 14) cmd.moveZ = 1;
}

function followPlan(state, a, b) {
  const map = state.map;
  if (b.plan === 'route') {
    if (b.routeIndex >= b.route.length) { b.plan = 'hold'; return; }
    const letter = b.route[b.routeIndex], mark = map.marks[letter], near = away2(a, mark.x, mark.z), plan = state.teams[a.team].plan;
    // The lurker holds until 8 s after the call, under 35 s left, or alone.
    if (letter === b.stage && (b.lurk ? state.round.clock > 35 && !(plan.execute && state.time - plan.executedAt > 8) && aliveCount(state, a.team) > 1 : !plan.execute)) {
      // Stage point: arrive walking (silent), wait for the call, aim at the way in.
      if (near > 2.2) { goTo(state, a, mark.x, mark.z, near < 150); return; }
      b.staged = true;
      const next = map.marks[b.route[b.routeIndex + 1]];
      turnToward(a, yawFrom(a, next.x, next.z) + Math.sin(state.time + a.id) * 0.3, 0, 2.5);
      return;
    }
    // On the call, smoke the defenders' main angle from the stage, then push in.
    if (letter !== b.stage && b.staged && !b.smoked && a.grenades.smoke > 0) {
      b.smoked = true;
      toss(a, map.holds[b.site][0].x, map.holds[b.site][0].z, 'smoke');
    } else if (near < 2.2) b.routeIndex++;
    else goTo(state, a, mark.x, mark.z);
    return;
  }
  if (away2(a, b.holdX, b.holdZ) > 0.5) { goTo(state, a, b.holdX, b.holdZ); b.atHold = false; return; }
  if (!b.atHold && state.time - b.calledAt > 3) { b.atHold = true; b.calledAt = state.time; radio(state, a, `holding ${placeName(map, b.holdX, b.holdZ)}`); }
  b.scan += DT * 0.7;
  turnToward(a, yawFrom(a, b.lookX, b.lookZ) + Math.sin(b.scan + a.id) * 0.2, 0, 2.5);
}

// Walk an A* path to (x, z), re-planning when the goal moves, every 4 s, or when stuck (hop first).
function goTo(state, a, x, z, quiet = false) {
  const cmd = a.cmd, b = a.brain, p = b.path;
  if (p.length === 0 || dist2(b.goalX, b.goalZ, x, z) > 2.25 || state.time > b.repathAt) {
    findPath(state.map, a.pos.x, a.pos.z, x, z, p);
    b.goalX = x; b.goalZ = z; b.repathAt = state.time + 4;
  }
  if (p.index >= p.length) return;
  if (away2(a, p.xs[p.index], p.zs[p.index]) < 0.36 && p.index < p.length - 1) p.index++;
  const nx = p.xs[p.index], nz = p.zs[p.index], dx = nx - a.pos.x, dz = nz - a.pos.z, len = Math.hypot(dx, dz);
  if (len < 0.15) return;
  lookAt(a, nx, nz, 0.6);
  const sin = Math.sin(cmd.yaw), cos = Math.cos(cmd.yaw), ux = dx / len, uz = dz / len;
  cmd.moveZ = -(ux * sin + uz * cos);
  cmd.moveX = ux * cos - uz * sin;
  cmd.walk = quiet; // walking makes no footsteps
  b.stuckTime = Math.hypot(a.vel.x, a.vel.z) < 0.4 ? b.stuckTime + DT : 0;
  if (b.stuckTime > 0.8) { cmd.jump = true; b.repathAt = 0; b.stuckTime = 0; }
}

function toss(a, x, z, kind) {
  a.cmd.yaw = yawFrom(a, x, z);
  a.cmd.pitch = LOB;
  a.cmd.tossRange = Math.hypot(x - a.pos.x, z - a.pos.z);
  a.cmd.toss = kind;
}

const lookAt = (a, x, z, rate = 1, pitch = 0) => turnToward(a, yawFrom(a, x, z), pitch, BOT.turnRate * rate);

// Turn at a limited rate: bots never snap.
function turnToward(a, yaw, pitch, rate) {
  const cmd = a.cmd, max = rate * DT;
  cmd.yaw = wrapAngle(cmd.yaw + Math.max(-max, Math.min(max, wrapAngle(yaw - cmd.yaw))));
  cmd.pitch += Math.max(-max, Math.min(max, pitch - cmd.pitch));
}
