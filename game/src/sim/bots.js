// One brain per bot: fills the same command record the player's input fills, every tick.
import { BOT, DT, WEAPONS, SIDE, OBJECTIVE, HEARING } from './config.js';
import { placeName, siteNear } from './map.js';
import { canSee } from './senses.js';
import { LOB } from './grenades.js';
import { findPath, createPath } from './nav.js';
import { eyeOf, heightOf } from './actors.js';
import { pickHold, radio } from './coach.js';
import { wrapAngle, yawTo, dist2 } from './util.js';

const HEARD = { step: 'footsteps', shot: 'gunfire', reload: 'a reload', work: 'the core being worked', bounce: 'a grenade' };

export function createBrain(skill, role) {
  return {
    skill, role, // skill 0..1 scales reaction, aim and head aim; role: entry, support, anchor, marksman
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

// Priorities: finish arming/disarming, fight what it sees, the Fuse Core, a frag on a target that
// ducked, chase or pre-aim what it lost, check what it heard (or what shot it), then its plan.
export function think(state, a) {
  const b = a.brain, cmd = a.cmd;
  cmd.moveX = cmd.moveZ = 0; cmd.fire = cmd.jump = cmd.reload = cmd.walk = cmd.use = cmd.aim = false;
  cmd.slot = -1; cmd.toss = ''; cmd.tossRange = 0;
  if (state.round.phase === 'freeze') { cmd.crouch = false; return; }
  if ((state.tick + a.id) % BOT.thinkEvery === 0) perceive(state, a, b);
  if (b.lastSeenTime > -99 && !state.actors[b.lastSeenId].alive) b.lastSeenTime = -99;
  const core = state.core;
  if (core.worker === a.id && core.progress > 0.6) { cmd.use = true; cmd.crouch = state.teams[a.team].side === SIDE.DEFEND; return; }
  if (b.target >= 0) { engage(state, a, b, state.actors[b.target]); return; }
  cmd.crouch = false;
  const w = a.slots[a.active];
  if (w.mag < WEAPONS[w.id].mag * 0.4 && w.reserve > 0) cmd.reload = true;
  if (playObjective(state, a, b)) return;
  const lost = state.time - b.lastSeenTime;
  // Flush a target that just ducked behind cover with a frag (never onto a teammate).
  if (lost > 0.6 && lost < 3 && a.grenades.frag > 0 && state.time - b.fragAt > 8 && clearOfFriends(state, a, b.lastSeenX, b.lastSeenZ)) {
    const d = Math.hypot(b.lastSeenX - a.pos.x, b.lastSeenZ - a.pos.z);
    if (d > 6 && d < 20) { b.fragAt = state.time; toss(a, b.lastSeenX, b.lastSeenZ, 'frag'); return; }
  }
  if (a.lastHurtBy >= 0 && state.time - a.lastHurtTime < 0.2) {
    const s = state.actors[a.lastHurtBy];
    b.heardX = s.pos.x; b.heardZ = s.pos.z; b.heardTime = state.time;
  }
  if (lost < 2.5) {
    // A defender on its angle keeps it and pre-aims where the enemy vanished; others close in.
    const holding = state.teams[a.team].side === SIDE.DEFEND && b.plan === 'hold';
    if (holding) followPlan(state, a, b);
    else if (dist2(a.pos.x, a.pos.z, b.lastSeenX, b.lastSeenZ) < 300) goTo(state, a, b, b.lastSeenX, b.lastSeenZ, false);
    lookAt(a, b.lastSeenX, a.pos.y + eyeOf(a), b.lastSeenZ, 1);
  } else if (state.time - b.heardTime < 3.5) {
    if (b.heardTime === state.time && state.time - b.calledAt > 6 && HEARD[b.heardKind]) {
      b.calledAt = state.time;
      radio(state, a, `${HEARD[b.heardKind]} at ${placeName(state.map, b.heardX, b.heardZ)}`);
    }
    // Walk to check a noise near it or its post (not anchors); otherwise keep the plan and listen.
    const near = dist2(a.pos.x, a.pos.z, b.heardX, b.heardZ) < 400 || dist2(b.holdX, b.holdZ, b.heardX, b.heardZ) < 225;
    if (near && b.plan === 'hold' && !b.anchor) goTo(state, a, b, b.heardX, b.heardZ, true);
    else followPlan(state, a, b);
    lookAt(a, b.heardX, a.pos.y + eyeOf(a), b.heardZ, 1);
  } else followPlan(state, a, b);
}

function perceive(state, a, b) {
  let best = null, bestD = Infinity;
  for (const e of state.actors) {
    if (!e.alive || e.team === a.team) continue;
    const d = dist2(a.pos.x, a.pos.z, e.pos.x, e.pos.z) * (e.id === b.target ? 0.5 : 1); // stick to the current target
    if (d < bestD && canSee(state, a, e)) { best = e; bestD = d; }
  }
  if (!best) {
    if (b.target >= 0) { b.lostId = b.target; b.lostAt = state.time; }
    b.target = -1;
    return;
  }
  if (best.id !== b.target && !(best.id === b.lostId && state.time - b.lostAt < 0.6)) {
    // A fresh target: react slower at range and on the move, faster down a pre-aimed angle (the
    // defenders' edge), and start with a sloppy aim that settles while tracking.
    const off = Math.abs(wrapAngle(yawTo(a.pos.x, a.pos.z, best.pos.x, best.pos.z) - a.yaw));
    const moving = Math.hypot(a.vel.x, a.vel.z) > 1.5;
    const slow = (1.25 - b.skill * 0.5) * (1 + Math.sqrt(bestD) / 50) * (off < 0.4 && !moving ? 0.45 : moving ? 1.4 : 1);
    const err = BOT.aimError * slow;
    b.reactTimer = state.rng.range(BOT.reactMin, BOT.reactMax) * slow;
    b.errYaw = state.rng.range(-err, err);
    b.errPitch = state.rng.range(-err, err) * 0.5;
    b.aimHead = state.rng() < 0.15 + b.skill * 0.25;
    b.burstLeft = 0;
    b.crouchSpray = state.rng() < 0.35;
    if (state.time - b.calledAt > 4) { b.calledAt = state.time; radio(state, a, `contact, ${placeName(state.map, best.pos.x, best.pos.z)}`); }
  }
  b.target = best.id;
  b.lastSeenId = best.id; b.lastSeenX = best.pos.x; b.lastSeenZ = best.pos.z; b.lastSeenTime = state.time;
  // Team intel (coach rotations, the radar): sightings of different enemies close together add up.
  const intel = state.intel[a.team];
  const close = state.time - intel.time < 4 && dist2(intel.x, intel.z, best.pos.x, best.pos.z) < 400;
  intel.count = close ? intel.count + (intel.id !== best.id ? 1 : 0) : 1;
  intel.x = best.pos.x; intel.z = best.pos.z; intel.time = state.time; intel.id = best.id;
}

// The Fuse Core once nobody is in sight; true when it took the bot's turn.
function playObjective(state, a, b) {
  const core = state.core, cmd = a.cmd, map = state.map;
  const quiet = state.time - b.lastSeenTime > 1.2;
  const coreDist = Math.hypot(a.pos.x - core.x, a.pos.z - core.z);
  if (state.teams[a.team].side === SIDE.ATTACK) {
    if (core.state === 'carried' && core.carrier === a.id) {
      if (siteNear(map, a.pos.x, a.pos.z, 0) && quiet) { cmd.use = true; return true; }
      if (b.plan === 'hold') { goTo(state, a, b, map.sites[b.site].x, map.sites[b.site].z, false); return true; }
      return false;
    }
    if (core.state === 'dropped' && nearestTo(state, a, core.x, core.z)) { goTo(state, a, b, core.x, core.z, false); return true; }
    if (core.state === 'planted') {
      if (core.worker >= 0 && coreDist < HEARING.work) { goTo(state, a, b, core.x, core.z, false); return true; } // heard the disarm
      if (b.site !== core.site || b.plan !== 'hold') { b.site = core.site; b.plan = 'hold'; b.lurk = false; pickHold(state, a, map.postplant[core.site]); }
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
    cmd.use = cmd.crouch = true;
    lookAt(a, core.x, core.y, core.z, 1);
  } else goTo(state, a, b, core.x, core.z, false);
  return true;
}

// Is `a` the living member of its team (player included) closest to (x, z)?
function nearestTo(state, a, x, z) {
  const d = dist2(a.pos.x, a.pos.z, x, z);
  for (const o of state.actors) if (o !== a && o.alive && o.team === a.team && dist2(o.pos.x, o.pos.z, x, z) < d) return false;
  return true;
}

function clearOfFriends(state, a, x, z) {
  for (const o of state.actors) if (o.alive && o.team === a.team && dist2(o.pos.x, o.pos.z, x, z) < 64) return false;
  return true;
}

function engage(state, a, b, t) {
  const cmd = a.cmd, w = a.slots[a.active], def = WEAPONS[w.id];
  const ey = a.pos.y + eyeOf(a), th = heightOf(t);
  const ty = t.pos.y + (b.aimHead ? th - 0.16 : th * 0.68), d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
  // Aim error settles while tracking and grows while the target crosses the view fast; the bot
  // pulls down part of its own recoil.
  const settle = Math.exp(-BOT.aimSettle * (0.6 + b.skill) * DT);
  const lateral = Math.abs(t.vel.x * Math.cos(a.yaw) - t.vel.z * Math.sin(a.yaw));
  b.errYaw = b.errYaw * settle + (state.rng() - 0.5) * lateral * 0.0025;
  b.errPitch *= settle;
  const comp = 0.55 + b.skill * 0.3;
  const wantYaw = yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z) + b.errYaw - a.punchYaw * comp;
  const wantPitch = Math.atan2(ty - ey, d) + b.errPitch - a.punchPitch * comp;
  turnToward(a, wantYaw, wantPitch, BOT.turnRate * (0.8 + b.skill * 0.5));
  b.reactTimer -= DT;
  const tolerance = Math.atan2(0.32, d) + 0.01;
  const onTarget = Math.abs(wrapAngle(cmd.yaw - wantYaw)) < tolerance && Math.abs(cmd.pitch - wantPitch) < tolerance * 1.5;
  // Trigger discipline: bursts for automatics (longer up close; the spray resets in the pause),
  // paced taps otherwise; shots are counted from the magazine.
  const fired = b.magSeen - w.mag;
  b.magSeen = w.mag;
  if (fired > 0 && b.burstLeft > 0 && (b.burstLeft -= fired) <= 0) {
    b.burstLeft = 0;
    b.burstPause = def.auto ? state.rng.range(0.18, 0.4) : state.rng.range(0.12, 0.3) + d * 0.004;
  }
  if (b.burstPause > 0) b.burstPause -= DT;
  cmd.aim = !!def.scope;
  const ready = b.reactTimer <= 0 && b.burstPause <= 0 && w.mag > 0 && a.reloadTimer <= 0;
  if (ready && onTarget) {
    if (b.burstLeft <= 0) b.burstLeft = def.auto ? Math.round(state.rng.range(BOT.burst[0], BOT.burst[1]) * (d < 10 ? 2 : 1)) : 1;
    cmd.fire = def.auto || !a.triggerHeld;
  }
  if (w.mag === 0) cmd.reload = true;
  // Feet: stand still to shoot (spread follows speed) and strafe between bursts; an SMG closes in;
  // a defender on its angle stays behind its cover, crouching between bursts.
  const shooting = b.burstLeft > 0 && ready;
  const dug = b.plan === 'hold' && state.teams[a.team].side === SIDE.DEFEND && dist2(a.pos.x, a.pos.z, b.holdX, b.holdZ) < 1;
  cmd.crouch = dug ? (!shooting && a.id % 2 === 0) || b.crouchSpray : shooting && b.crouchSpray && d > 12;
  if (shooting || dug) return;
  if ((b.strafeTimer -= DT) <= 0) { b.strafe = -b.strafe; b.strafeTimer = state.rng.range(0.35, 0.8); }
  cmd.moveX = b.strafe;
  if (def.kind === 'smg' && d > 14) cmd.moveZ = 1;
}

function followPlan(state, a, b) {
  const map = state.map;
  if (b.plan === 'route') {
    if (b.routeIndex >= b.route.length) { b.plan = 'hold'; return; }
    const letter = b.route[b.routeIndex], mark = map.marks[letter];
    const near = dist2(a.pos.x, a.pos.z, mark.x, mark.z);
    if (letter === b.stage && (!state.teams[a.team].plan.execute || b.lurk)) {
      // Stage point: arrive walking (silent), wait for the call, aim at the way in.
      if (near > 2.2) { goTo(state, a, b, mark.x, mark.z, near < 150); return; }
      b.staged = true;
      const next = map.marks[b.route[b.routeIndex + 1]];
      turnToward(a, yawTo(a.pos.x, a.pos.z, next.x, next.z) + Math.sin(state.time + a.id) * 0.3, 0, 2.5);
      return;
    }
    // On the call, smoke the defenders' main angle from the stage, then push in.
    if (letter !== b.stage && b.staged && !b.smoked && a.grenades.smoke > 0) {
      b.smoked = true;
      toss(a, map.holds[b.site][0].x, map.holds[b.site][0].z, 'smoke');
      return;
    }
    if (near < 2.2) b.routeIndex++;
    else goTo(state, a, b, mark.x, mark.z, false);
    return;
  }
  if (dist2(a.pos.x, a.pos.z, b.holdX, b.holdZ) > 0.5) { goTo(state, a, b, b.holdX, b.holdZ, false); b.atHold = false; return; }
  if (!b.atHold && state.time - b.calledAt > 3) { b.atHold = true; b.calledAt = state.time; radio(state, a, `holding ${placeName(map, b.holdX, b.holdZ)}`); }
  b.scan += DT * 0.7;
  turnToward(a, yawTo(a.pos.x, a.pos.z, b.lookX, b.lookZ) + Math.sin(b.scan + a.id) * 0.2, 0, 2.5);
}

// Walk an A* path to (x, z), re-planning when the goal moves, every 4 s, or when stuck (hop first).
function goTo(state, a, b, x, z, quiet) {
  const cmd = a.cmd, p = b.path;
  if (p.length === 0 || dist2(b.goalX, b.goalZ, x, z) > 2.25 || state.time > b.repathAt) {
    findPath(state.map, a.pos.x, a.pos.z, x, z, p);
    b.goalX = x; b.goalZ = z; b.repathAt = state.time + 4;
  }
  if (p.index >= p.length) return;
  if (dist2(a.pos.x, a.pos.z, p.xs[p.index], p.zs[p.index]) < 0.36 && p.index < p.length - 1) p.index++;
  const nx = p.xs[p.index], nz = p.zs[p.index];
  const dx = nx - a.pos.x, dz = nz - a.pos.z, len = Math.hypot(dx, dz);
  if (len < 0.15) return;
  lookAt(a, nx, a.pos.y + eyeOf(a), nz, 0.6);
  const sin = Math.sin(cmd.yaw), cos = Math.cos(cmd.yaw), ux = dx / len, uz = dz / len;
  cmd.moveZ = -(ux * sin + uz * cos);
  cmd.moveX = ux * cos - uz * sin;
  cmd.walk = quiet; // walking makes no footsteps
  b.stuckTime = Math.hypot(a.vel.x, a.vel.z) < 0.4 ? b.stuckTime + DT : 0;
  if (b.stuckTime > 0.8) { cmd.jump = true; b.repathAt = 0; b.stuckTime = 0; }
}

// Face (x, z) and lob a grenade to land there this tick.
function toss(a, x, z, kind) {
  a.cmd.yaw = yawTo(a.pos.x, a.pos.z, x, z);
  a.cmd.pitch = LOB;
  a.cmd.tossRange = Math.hypot(x - a.pos.x, z - a.pos.z);
  a.cmd.toss = kind;
}

function lookAt(a, x, y, z, rateScale) {
  const ey = a.pos.y + eyeOf(a);
  turnToward(a, yawTo(a.pos.x, a.pos.z, x, z), Math.atan2(y - ey, Math.hypot(x - a.pos.x, z - a.pos.z)), BOT.turnRate * rateScale);
}

// Turn at a limited rate: bots never snap.
function turnToward(a, yaw, pitch, rate) {
  const cmd = a.cmd, max = rate * DT;
  cmd.yaw = wrapAngle(cmd.yaw + Math.max(-max, Math.min(max, wrapAngle(yaw - cmd.yaw))));
  cmd.pitch += Math.max(-max, Math.min(max, pitch - cmd.pitch));
}
