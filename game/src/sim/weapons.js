// Gunplay for every actor: trigger, magazine and reserve, reload, draw time, spread that grows with
// speed, air time and sustained fire, and a fixed spray pattern (climb, then sway) that the shooter
// must pull against. Bullets are hitscan: the map ray first, then each body's head/torso/leg boxes.
import { DT, MOVE, WEAPONS } from './config.js';
import { raycast } from './collide.js';
import { eyeOf, rayActor, applyDamage } from './actors.js';
import { emit, EV } from './events.js';
import { makeNoise, NOISE } from './senses.js';

const worldHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, kind: 0 };
const partOut = { part: 0 };

// Current cone radius (radians) for an actor's weapon: what the dynamic crosshair draws too.
export function spreadOf(a, def) {
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const moving = Math.max(0, Math.min(1, (speed - 0.5) / (MOVE.runSpeed - 0.5)));
  const s = def.spread;
  const cone = s.base + s.move * moving + (a.grounded ? 0 : s.air) + a.bloom;
  return cone * (1 + (s.crouch - 1) * a.crouch);
}

export function updateWeapon(state, a, cmd, canFire) {
  if (cmd.slot >= 0 && cmd.slot !== a.active && a.slots[cmd.slot]) switchTo(state, a, cmd.slot);
  const w = a.slots[a.active];
  const def = WEAPONS[w.id];

  a.fireCooldown = Math.max(0, a.fireCooldown - DT);
  if (a.drawTimer > 0) a.drawTimer -= DT;
  if (a.reloadTimer > 0) {
    a.reloadTimer -= DT;
    if (a.reloadTimer <= 0) {
      const take = Math.min(def.mag - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
  }
  if (cmd.reload) startReload(state, a, w, def);

  const pulled = cmd.fire && (def.auto || !a.triggerHeld);
  if (pulled && canFire && a.fireCooldown <= 0 && a.drawTimer <= 0 && a.reloadTimer <= 0) {
    if (w.mag > 0) fire(state, a, w, def);
    else {
      emit(state.events, EV.DRY, a.id);
      a.fireCooldown = 0.3;
      startReload(state, a, w, def);
    }
  }
  a.triggerHeld = cmd.fire;

  // Off the trigger, the spray pattern resets and punch and bloom fade.
  if (a.fireCooldown <= 0 && !cmd.fire) {
    const fade = Math.exp(-def.recoil.recover * DT);
    a.punchPitch *= fade;
    a.punchYaw *= fade;
    a.bloom *= fade;
    if (Math.abs(a.punchPitch) < 0.002) a.shotsFired = 0;
  }
}

function switchTo(state, a, slot) {
  a.active = slot;
  a.reloadTimer = 0;
  a.drawTimer = WEAPONS[a.slots[slot].id].draw;
  a.shotsFired = 0;
  emit(state.events, EV.DRAW, a.id, -1, WEAPONS[a.slots[slot].id].index);
}

function startReload(state, a, w, def) {
  if (a.reloadTimer > 0 || w.mag >= def.mag || w.reserve <= 0) return;
  a.reloadTimer = def.reload;
  emit(state.events, EV.RELOAD, a.id);
  makeNoise(state, a, NOISE.RELOAD);
}

// Spray pattern: the first `settle` shots climb straight up, then the climb flattens and the
// muzzle swings left and right. Deterministic, so it can be learned and pulled against.
function kick(a, def) {
  const rc = def.recoil;
  const n = a.shotsFired;
  a.punchPitch += n < rc.settle ? rc.climb : rc.climb * 0.25;
  if (n >= rc.settle) a.punchYaw += rc.sway * Math.cos((n - rc.settle) * 0.55);
  a.punchPitch = Math.min(a.punchPitch, 0.22);
}

function fire(state, a, w, def) {
  w.mag--;
  a.fireCooldown = def.interval;
  const rng = state.rng;
  const ox = a.pos.x, oy = a.pos.y + eyeOf(a), oz = a.pos.z;
  const cone = spreadOf(a, def);
  const baseYaw = a.yaw + a.punchYaw, basePitch = a.pitch + a.punchPitch;
  for (let p = 0; p < def.pellets; p++) {
    const r = cone * Math.sqrt(rng()), th = rng() * Math.PI * 2;
    const yaw = baseYaw + r * Math.cos(th), pitch = basePitch + r * Math.sin(th);
    const cp = Math.cos(pitch);
    traceBullet(state, a, def, ox, oy, oz, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }
  kick(a, def);
  a.shotsFired++;
  a.bloom += def.spread.bloom;
  makeNoise(state, a, NOISE.SHOT);
}

function traceBullet(state, a, def, ox, oy, oz, dx, dy, dz) {
  const hitWall = raycast(state.map, ox, oy, oz, dx, dy, dz, def.range, worldHit);
  let bestT = worldHit.t, victim = null, part = 0;
  for (const b of state.actors) {
    if (!b.alive || b.team === a.team) continue;
    const t = rayActor(b, ox, oy, oz, dx, dy, dz, partOut);
    if (t >= 0 && t < bestT) { bestT = t; victim = b; part = partOut.part; }
  }
  const shot = emit(state.events, EV.SHOT, a.id, victim ? victim.id : -1, def.index);
  shot.x = ox; shot.y = oy; shot.z = oz;
  shot.x2 = ox + dx * bestT; shot.y2 = oy + dy * bestT; shot.z2 = oz + dz * bestT;
  if (victim) {
    applyDamage(state, victim, a, def, part, bestT);
  } else if (hitWall) {
    const e = emit(state.events, EV.IMPACT, a.id, -1, worldHit.kind);
    e.x = worldHit.x; e.y = worldHit.y; e.z = worldHit.z;
    e.x2 = worldHit.nx; e.y2 = worldHit.ny; e.z2 = worldHit.nz;
  }
}
