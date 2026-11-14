// Bot brains. Every tick a bot fills the same command record the player's input fills, and the
// shared movement and weapon code does the rest. A bot perceives every few ticks (sight, plus the
// noises senses.js drops into its memory), then does one thing: fight what it sees, chase what it
// just lost, check what it heard, or walk its plan (a route to a site, then an angle to hold).
import { BOT, DT, WEAPONS } from './config.js';
import { ATTACK_ROUTES, HOLDS, POSTPLANT } from './map.js';
import { canSee } from './senses.js';
import { findPath, createPath } from './nav.js';
import { eyeOf, heightOf } from './actors.js';

export function createBrain(skill) {
  return {
    skill, // 0..1: reaction, aim settle and head aim
    plan: 'hold', // 'route' walks `route` waypoints, then holds; 'hold' stands at (holdX, holdZ)
    route: '', routeIndex: 0, site: 'A',
    holdX: 0, holdZ: 0, lookX: 0, lookZ: 0,
    path: createPath(), goalX: 0, goalZ: 0, repathAt: 0,
    target: -1, reactTimer: 0, errYaw: 0, errPitch: 0, aimHead: false,
    lastSeenX: 0, lastSeenZ: 0, lastSeenTime: -99,
    heardX: 0, heardZ: 0, heardTime: -99,
    burstLeft: 0, burstPause: 0, strafe: 1, strafeTimer: 0, crouchSpray: false,
    stuckTime: 0, scan: 0,
  };
}

// Give every bot of one team its job for the round. Attackers pick a site and split over its two
// routes (one lurker takes the other site's route); defenders spread over the held angles.
export function planRound(state, team, attacking) {
  const rng = state.rng;
  const bots = state.actors.filter((a) => a.team === team && a.isBot);
  const site = rng() < 0.5 ? 'A' : 'B';
  const routes = ATTACK_ROUTES.filter((r) => r.site === site);
  const other = ATTACK_ROUTES.filter((r) => r.site !== site);
  bots.forEach((a, i) => {
    const b = a.brain;
    b.target = -1; b.lastSeenTime = -99; b.heardTime = -99; b.path.length = 0;
    b.burstLeft = 0; b.burstPause = 0; b.stuckTime = 0;
    if (attacking) {
      const lurk = i === bots.length - 1 && bots.length > 3;
      const route = lurk ? rng.pick(other) : routes[i % routes.length];
      b.plan = 'route'; b.route = route.path; b.routeIndex = 0; b.site = lurk ? route.site : site;
      const hold = POSTPLANT[b.site][i % POSTPLANT[b.site].length];
      setHold(state, b, hold);
    } else {
      const spots = [HOLDS.A[0], HOLDS.B[0], HOLDS.mid[0], HOLDS.A[1], HOLDS.B[1], HOLDS.A[2], HOLDS.B[2]];
      b.plan = 'hold';
      setHold(state, b, spots[i % spots.length]);
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
  cmd.walk = false; cmd.slot = -1;
  if (state.round.phase === 'freeze') { cmd.crouch = false; return; }
  if ((state.tick + a.id) % BOT.thinkEvery === 0) perceive(state, a, b);

  const target = b.target >= 0 ? state.actors[b.target] : null;
  if (target) { engage(state, a, b, target); return; }
  cmd.crouch = false;
  const w = a.slots[a.active];
  if (w.mag < WEAPONS[w.id].mag * 0.4 && w.reserve > 0) cmd.reload = true;
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
    b.aimHead = state.rng() < 0.25 + b.skill * 0.35;
    b.burstLeft = 0;
    b.crouchSpray = state.rng() < 0.35;
  }
  b.target = best.id;
  b.lastSeenX = best.pos.x; b.lastSeenZ = best.pos.z; b.lastSeenTime = state.time;
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

