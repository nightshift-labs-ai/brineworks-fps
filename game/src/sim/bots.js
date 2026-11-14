// Bot brains. Every tick a bot fills the same command record the player's input fills, and the
// shared movement and weapon code does the rest. A bot perceives every few ticks (sight, plus the
// noises senses.js drops into its memory), then does one thing, in priority order: fight what it
// sees, play the objective (arm, recover, retake, disarm the Fuse Core), chase what it just lost,
// check what it heard, or walk its plan (a route to a site, then an angle to hold).
// Teammates share sightings through state.intel, which is how defenders rotate to a hit site.
import { BOT, DT, WEAPONS, SIDE, OBJECTIVE } from './config.js';
import { ATTACK_ROUTES, HOLDS, POSTPLANT } from './map.js';
import { canSee } from './senses.js';
import { siteAt } from './objective.js';
import { throwPitch } from './grenades.js';
import { findPath, createPath } from './nav.js';
import { eyeOf, heightOf } from './actors.js';

export function createBrain(skill) {
  return {
    skill, // 0..1: reaction, aim settle and head aim
    plan: 'hold', // 'route' walks `route` waypoints, then holds; 'hold' stands at (holdX, holdZ)
    route: '', routeIndex: 0, site: 'A', anchor: false, // anchors never rotate off their site
    holdX: 0, holdZ: 0, lookX: 0, lookZ: 0,
    path: createPath(), goalX: 0, goalZ: 0, repathAt: 0,
    target: -1, reactTimer: 0, errYaw: 0, errPitch: 0, aimHead: false,
    lastSeenX: 0, lastSeenZ: 0, lastSeenTime: -99,
    heardX: 0, heardZ: 0, heardTime: -99,
    burstLeft: 0, burstPause: 0, strafe: 1, strafeTimer: 0, crouchSpray: false,
    stuckTime: 0, scan: 0, smoked: false, fragAt: -99,
  };
}

// Give every bot of one team its job for the round. Attackers pick a site and split over its two
// routes (one lurker takes the other site's route); defenders spread over the held angles.
export function planRound(state, team, attacking) {
  const rng = state.rng;
  const carrier = state.core.carrier;
  const bots = state.actors.filter((a) => a.team === team && a.isBot).sort((x, y) => (y.id === carrier) - (x.id === carrier));
  state.intel[team].time = -99;
  const site = rng() < 0.5 ? 'A' : 'B';
  const routes = ATTACK_ROUTES.filter((r) => r.site === site);
  const other = ATTACK_ROUTES.filter((r) => r.site !== site);
  bots.forEach((a, i) => {
    const b = a.brain;
    b.target = -1; b.lastSeenTime = -99; b.heardTime = -99; b.path.length = 0;
    b.burstLeft = 0; b.burstPause = 0; b.stuckTime = 0; b.smoked = false;
    if (attacking) {
      const lurk = i === bots.length - 1 && bots.length > 3;
      const route = lurk ? rng.pick(other) : routes[i % routes.length];
      b.plan = 'route'; b.route = route.path; b.routeIndex = 0; b.site = lurk ? route.site : site;
      const hold = POSTPLANT[b.site][i % POSTPLANT[b.site].length];
      setHold(state, b, hold);
    } else {
      const spots = [['A', 0], ['B', 0], ['mid', 0], ['A', 1], ['B', 1], ['A', 2], ['B', 2]];
      const [where, k] = spots[i % spots.length];
      b.plan = 'hold';
      b.site = where === 'mid' ? (rng() < 0.5 ? 'A' : 'B') : where;
      b.anchor = i < 2;
      setHold(state, b, HOLDS[where][k]);
    }
  });
}

function setHold(state, b, hold) {
  b.holdX = (hold.at[0] + 0.5) * state.map.cell;
  b.holdZ = (hold.at[1] + 0.5) * state.map.cell;
  const look = state.map.marks[hold.look];
  b.lookX = look.x; b.lookZ = look.z;
}

export function think(state, a) {
  const b = a.brain, cmd = a.cmd;
  cmd.moveX = 0; cmd.moveZ = 0; cmd.fire = false; cmd.jump = false; cmd.reload = false;
  cmd.walk = false; cmd.slot = -1; cmd.toss = ''; cmd.aim = false;
  if (state.round.phase === 'freeze') { cmd.crouch = false; return; }
  if ((state.tick + a.id) % BOT.thinkEvery === 0) perceive(state, a, b);

  const target = b.target >= 0 ? state.actors[b.target] : null;
  const core = state.core;
  const committed = core.worker === a.id && core.progress > 0.6; // nearly done: finish the job
  if (target && !committed) { engage(state, a, b, target); return; }
  cmd.crouch = false;
  const w = a.slots[a.active];
  if (w.mag < WEAPONS[w.id].mag * 0.4 && w.reserve > 0 && !committed) cmd.reload = true;
  if (playObjective(state, a, b)) return;
  // Flush a target that just ducked behind cover with a frag.
  const lost = state.time - b.lastSeenTime;
  if (lost > 0.6 && lost < 3 && a.grenades.frag > 0 && state.time - b.fragAt > 8) {
    const d = Math.hypot(b.lastSeenX - a.pos.x, b.lastSeenZ - a.pos.z);
    if (d > 6 && d < 20) { b.fragAt = state.time; toss(a, b.lastSeenX, b.lastSeenZ, 'frag'); return; }
  }
  if (state.time - b.lastSeenTime < 2.5) {
    goTo(state, a, b, b.lastSeenX, b.lastSeenZ, false);
    lookAt(a, b.lastSeenX, a.pos.y + eyeOf(a), b.lastSeenZ, 1);
  } else if (state.time - b.heardTime < 3.5) {
    if (b.plan === 'route') followPlan(state, a, b);
    else if (dist2(a.pos.x, a.pos.z, b.heardX, b.heardZ) > 100) goTo(state, a, b, b.heardX, b.heardZ, true);
    lookAt(a, b.heardX, a.pos.y + eyeOf(a), b.heardZ, 1);
  } else {
    followPlan(state, a, b);
  }
}

function perceive(state, a, b) {
  let best = null, bestD = Infinity;
  for (const e of state.actors) {
    if (!e.alive || e.team === a.team) continue;
    const d = dist2(a.pos.x, a.pos.z, e.pos.x, e.pos.z);
    if (d < bestD && canSee(state, a, e)) { best = e; bestD = d; }
  }
  if (!best) {
    b.target = -1;
    return;
  }
  if (best.id !== b.target) {
    // A fresh target: react, and start with a sloppy aim that settles while tracking.
    const slow = 1.25 - b.skill * 0.5;
    b.reactTimer = state.rng.range(BOT.reactMin, BOT.reactMax) * slow;
    const err = BOT.aimError * slow;
    b.errYaw = state.rng.range(-err, err);
    b.errPitch = state.rng.range(-err, err) * 0.5;
    b.aimHead = state.rng() < 0.15 + b.skill * 0.25;
    b.burstLeft = 0;
    b.crouchSpray = state.rng() < 0.35;
  }
  b.target = best.id;
  b.lastSeenX = best.pos.x; b.lastSeenZ = best.pos.z; b.lastSeenTime = state.time;
  const intel = state.intel[a.team]; // call it out to the team
  intel.x = best.pos.x; intel.z = best.pos.z; intel.time = state.time;
}

// The Fuse Core comes first once nobody is in sight. Returns true when it took the bot's turn.
function playObjective(state, a, b) {
  const core = state.core, cmd = a.cmd;
  const quiet = state.time - b.lastSeenTime > 1.2;
  if (state.teams[a.team].side === SIDE.ATTACK) {
    if (core.state === 'carried' && core.carrier === a.id) {
      const site = siteAt(state, a.pos.x, a.pos.z);
      if (site && quiet) { cmd.use = true; return true; } // stop and arm it
      if (b.plan === 'hold') { const s = state.map.sites[b.site]; goTo(state, a, b, s.x, s.z, false); return true; }
      return false; // still walking the route
    }
    if (core.state === 'dropped' && nearestTo(state, a, core.x, core.z)) { goTo(state, a, b, core.x, core.z, false); return true; }
    if (core.state === 'planted' && b.site !== core.site) {
      b.site = core.site; b.plan = 'hold';
      setHold(state, b, POSTPLANT[core.site][a.id % POSTPLANT[core.site].length]);
    }
    return false;
  }
  if (core.state === 'planted') { // retake: go to the core and disarm it when the coast is clear
    if (Math.hypot(a.pos.x - core.x, a.pos.z - core.z) < OBJECTIVE.reach * 0.8 && quiet) {
      cmd.use = true;
      cmd.crouch = true;
      lookAt(a, core.x, core.y, core.z, 1);
    } else goTo(state, a, b, core.x, core.z, false);
    return true;
  }
  const intel = state.intel[a.team]; // rotate toward a called-out site unless anchored
  if (!b.anchor && state.time - intel.time < 6) {
    const site = siteNear(state, intel.x, intel.z, 24);
    if (site && site.name !== b.site) {
      b.site = site.name; b.plan = 'hold';
      setHold(state, b, HOLDS[site.name][(a.id + 1) % HOLDS[site.name].length]);
    }
  }
  return false;
}

// Is `a` the living bot of its team closest to (x, z)?
function nearestTo(state, a, x, z) {
  const d = dist2(a.pos.x, a.pos.z, x, z);
  for (const o of state.actors) if (o !== a && o.alive && o.isBot && o.team === a.team && dist2(o.pos.x, o.pos.z, x, z) < d) return false;
  return true;
}

function siteNear(state, x, z, range) {
  for (const site of Object.values(state.map.sites)) if (Math.hypot(x - site.x, z - site.z) < range) return site;
  return null;
}

function engage(state, a, b, t) {
  const cmd = a.cmd;
  const def = WEAPONS[a.slots[a.active].id];
  const ex = a.pos.x, ey = a.pos.y + eyeOf(a), ez = a.pos.z;
  const th = heightOf(t);
  const tx = t.pos.x, ty = t.pos.y + (b.aimHead ? th - 0.16 : th * 0.68), tz = t.pos.z;
  const d = Math.hypot(tx - ex, tz - ez);

  // Aim error settles while tracking, grows while the target strafes fast across the view.
  const settle = Math.exp(-BOT.aimSettle * (0.6 + b.skill) * DT);
  const lateral = Math.abs(t.vel.x * Math.cos(a.yaw) - t.vel.z * Math.sin(a.yaw));
  b.errYaw = b.errYaw * settle + (state.rng() - 0.5) * lateral * 0.0025;
  b.errPitch *= settle;
  const comp = 0.55 + b.skill * 0.3; // how much of its own recoil the bot pulls down
  const wantYaw = Math.atan2(-(tx - ex), -(tz - ez)) + b.errYaw - a.punchYaw * comp;
  const wantPitch = Math.atan2(ty - ey, d) + b.errPitch - a.punchPitch * comp;
  turnToward(a, wantYaw, wantPitch, BOT.turnRate * (0.8 + b.skill * 0.5));

  b.reactTimer -= DT;
  const offYaw = Math.abs(wrap(cmd.yaw - wantYaw)), offPitch = Math.abs(cmd.pitch - wantPitch);
  const tolerance = Math.atan2(0.32, d) + 0.01;
  const onTarget = offYaw < tolerance && offPitch < tolerance * 1.5;

  // Trigger discipline: bursts for automatics (the spray resets in the pause), paced taps otherwise.
  if (b.burstPause > 0) b.burstPause -= DT;
  const w = a.slots[a.active];
  cmd.aim = !!def.scope;
  if (b.reactTimer <= 0 && onTarget && b.burstPause <= 0 && w.mag > 0) {
    if (b.burstLeft <= 0) b.burstLeft = def.auto ? Math.round(state.rng.range(BOT.burst[0], BOT.burst[1]) * (d < 10 ? 2 : 1)) : 1;
    cmd.fire = def.auto ? true : !a.triggerHeld;
    if (a.fireCooldown <= 0 && cmd.fire) {
      b.burstLeft--;
      if (b.burstLeft <= 0) b.burstPause = def.auto ? state.rng.range(0.18, 0.4) : state.rng.range(0.12, 0.3) + d * 0.004;
    }
  }
  if (w.mag === 0) cmd.reload = true;

  // Feet: stand still to shoot (accuracy) and strafe between bursts; close in on far targets with an SMG.
  const shooting = b.burstLeft > 0 && b.reactTimer <= 0;
  cmd.crouch = shooting && b.crouchSpray && d > 12;
  if (!shooting) {
    b.strafeTimer -= DT;
    if (b.strafeTimer <= 0) { b.strafe = -b.strafe; b.strafeTimer = state.rng.range(0.35, 0.8); }
    cmd.moveX = b.strafe;
    if (def.kind === 'smg' && d > 14) cmd.moveZ = 1;
  }
}

function followPlan(state, a, b) {
  if (b.plan === 'route') {
    if (b.routeIndex >= b.route.length) { b.plan = 'hold'; return; }
    const mark = state.map.marks[b.route[b.routeIndex]];
    // At the last waypoint before the site, smoke off the defenders' main angle.
    if (b.routeIndex === b.route.length - 1 && !b.smoked && a.grenades.smoke > 0 && dist2(a.pos.x, a.pos.z, mark.x, mark.z) < 9) {
      const hold = HOLDS[b.site][0];
      b.smoked = true;
      toss(a, (hold.at[0] + 0.5) * state.map.cell, (hold.at[1] + 0.5) * state.map.cell, 'smoke');
      return;
    }
    if (dist2(a.pos.x, a.pos.z, mark.x, mark.z) < 2.2) { b.routeIndex++; return; }
    goTo(state, a, b, mark.x, mark.z, false);
    return;
  }
  if (dist2(a.pos.x, a.pos.z, b.holdX, b.holdZ) > 0.5) {
    goTo(state, a, b, b.holdX, b.holdZ, false);
    return;
  }
  // Holding: watch the angle with a slow sweep.
  b.scan += DT * 0.7;
  const sweep = Math.sin(b.scan + a.id) * 0.35;
  const yaw = Math.atan2(-(b.lookX - a.pos.x), -(b.lookZ - a.pos.z)) + sweep;
  turnToward(a, yaw, 0, 2.5);
}

// Walk toward a point along an A* path, re-planning when the goal moves or the bot is stuck.
function goTo(state, a, b, x, z, careful) {
  const cmd = a.cmd;
  const p = b.path;
  if (p.length === 0 || dist2(b.goalX, b.goalZ, x, z) > 2.25 || state.time > b.repathAt) {
    findPath(state.map, a.pos.x, a.pos.z, x, z, p);
    b.goalX = x; b.goalZ = z;
    b.repathAt = state.time + 4;
  }
  if (p.index >= p.length) return;
  let nx = p.xs[p.index], nz = p.zs[p.index];
  if (dist2(a.pos.x, a.pos.z, nx, nz) < 0.36 && p.index < p.length - 1) {
    p.index++;
    nx = p.xs[p.index]; nz = p.zs[p.index];
  }
  const dx = nx - a.pos.x, dz = nz - a.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.15) return;
  // Face where we walk (unless the caller looks elsewhere afterwards), and move along that line.
  lookAt(a, nx, a.pos.y + eyeOf(a), nz, 0.6);
  const sin = Math.sin(cmd.yaw), cos = Math.cos(cmd.yaw);
  const ux = dx / len, uz = dz / len;
  cmd.moveZ = -(ux * sin + uz * cos);
  cmd.moveX = ux * cos - uz * sin;
  cmd.walk = careful;
  // Stuck: barely moving while trying to. Hop and re-plan.
  const speed = Math.hypot(a.vel.x, a.vel.z);
  b.stuckTime = speed < 0.4 ? b.stuckTime + DT : 0;
  if (b.stuckTime > 0.8) { cmd.jump = true; b.repathAt = 0; b.stuckTime = 0; }
}

// Face (x, z) at the arc that lands a grenade there, and throw it this tick.
function toss(a, x, z, kind) {
  a.cmd.yaw = Math.atan2(-(x - a.pos.x), -(z - a.pos.z));
  a.cmd.pitch = throwPitch(Math.hypot(x - a.pos.x, z - a.pos.z));
  a.cmd.toss = kind;
}

function lookAt(a, x, y, z, rateScale) {
  const ex = a.pos.x, ey = a.pos.y + eyeOf(a), ez = a.pos.z;
  const yaw = Math.atan2(-(x - ex), -(z - ez));
  const pitch = Math.atan2(y - ey, Math.hypot(x - ex, z - ez));
  turnToward(a, yaw, pitch, BOT.turnRate * rateScale);
}

function turnToward(a, yaw, pitch, rate) {
  const cmd = a.cmd;
  const max = rate * DT;
  const dy = wrap(yaw - cmd.yaw);
  cmd.yaw = wrap(cmd.yaw + Math.max(-max, Math.min(max, dy)));
  cmd.pitch += Math.max(-max, Math.min(max, pitch - cmd.pitch));
}

function wrap(angle) {
  let x = angle;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

