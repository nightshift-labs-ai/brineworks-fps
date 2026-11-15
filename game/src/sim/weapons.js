// Gunplay for every actor: trigger, magazine, reload, spread, spray pattern, hitscan bullets.
import { DT, MOVE, WEAPONS } from './config.js';
import { raycast } from './collide.js';
import { eyeOf, rayActor, applyDamage } from './actors.js';
import { emit, EV } from './events.js';
import { makeNoise } from './senses.js';
import { throwNade } from './grenades.js';

const worldHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, kind: 0 };
const partOut = { part: 0 };

// Current cone radius (radians) for an actor's weapon: what the dynamic crosshair draws too.
export function spreadOf(a, def) {
  const moving = Math.max(0, Math.min(1, (Math.hypot(a.vel.x, a.vel.z) - 0.5) / (MOVE.runSpeed - 0.5))), s = def.spread;
  const cone = (def.scope && !a.scoped ? s.unscoped : s.base) + s.move * moving + (a.grounded ? 0 : s.air) + a.bloom;
  return cone * (1 + (s.crouch - 1) * a.crouch);
}

export function updateWeapon(state, a, cmd, canFire) {
  if (cmd.slot >= 0 && cmd.slot !== a.active && a.slots[cmd.slot]) {
    const next = WEAPONS[a.slots[cmd.slot].id];
    a.active = cmd.slot; a.reloadTimer = 0; a.drawTimer = next.draw; a.shotsFired = 0;
    emit(state.events, EV.DRAW, a.id, -1, next.index);
  }
  const w = a.slots[a.active], def = WEAPONS[w.id];
  if (a.fireCooldown > 0) a.fireCooldown -= DT;
  if (a.drawTimer > 0) a.drawTimer -= DT;
  if (a.reloadTimer > 0 && (a.reloadTimer -= DT) <= 0) {
    const take = Math.min(def.mag - w.mag, w.reserve);
    w.mag += take; w.reserve -= take;
  }
  if (cmd.reload) startReload(state, a, w, def);
  a.scoped = !!def.scope && cmd.aim && a.reloadTimer <= 0 && a.drawTimer <= 0;
  if (cmd.toss && canFire && a.drawTimer <= 0 && throwNade(state, a, cmd.toss)) {
    a.drawTimer = 0.55; // the gun comes back up after the throw
    a.reloadTimer = 0;
  }
  if (cmd.fire && (def.auto || !a.triggerHeld) && canFire && a.fireCooldown <= 1e-9 && a.drawTimer <= 0 && a.reloadTimer <= 0) {
    if (w.mag > 0) fire(state, a, w, def);
    else {
      emit(state.events, EV.DRY, a.id);
      a.fireCooldown = 0.3;
      startReload(state, a, w, def);
    }
  }
  a.triggerHeld = cmd.fire;
  // Punch and bloom fade off the trigger, while reloading and through a slow gun's cooldown.
  if ((!cmd.fire || a.reloadTimer > 0 || w.mag === 0) && (a.fireCooldown <= 0 || def.interval > 0.3)) {
    const fade = Math.exp(-def.recoil.recover * DT);
    a.punchPitch *= fade; a.punchYaw *= fade; a.bloom *= fade;
    if (a.fireCooldown <= 0 && Math.abs(a.punchPitch) < 0.002) a.shotsFired = 0;
  }
}

function startReload(state, a, w, def) {
  if (a.reloadTimer > 0 || w.mag >= def.mag || w.reserve <= 0) return;
  a.reloadTimer = def.reload;
  emit(state.events, EV.RELOAD, a.id);
  makeNoise(state, a, 'reload');
}

function fire(state, a, w, def) {
  w.mag--;
  a.fireCooldown = Math.min(0, a.fireCooldown) + def.interval; // exact fire rate at 60 Hz
  const rng = state.rng, ox = a.pos.x, oy = a.pos.y + eyeOf(a), oz = a.pos.z, cone = spreadOf(a, def);
  const baseYaw = a.yaw + a.punchYaw, basePitch = a.pitch + a.punchPitch;
  for (let p = 0; p < def.pellets; p++) {
    const r = cone * Math.sqrt(rng()), th = rng() * Math.PI * 2;
    const yaw = baseYaw + r * Math.cos(th), pitch = basePitch + r * Math.sin(th), cp = Math.cos(pitch);
    traceBullet(state, a, def, ox, oy, oz, -Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }
  // Spray pattern: `settle` shots climb straight up, then the muzzle sways; fixed, so it can be learned.
  const rc = def.recoil, n = a.shotsFired++;
  a.punchPitch = Math.min(a.punchPitch + (n < rc.settle ? rc.climb : rc.climb * 0.25), 0.22);
  if (n >= rc.settle) a.punchYaw += rc.sway * Math.cos((n - rc.settle) * 0.55);
  a.bloom += def.spread.bloom;
  makeNoise(state, a, 'shot');
}

function traceBullet(state, a, def, ox, oy, oz, dx, dy, dz) {
  const hitWall = raycast(state.map, ox, oy, oz, dx, dy, dz, def.range, worldHit);
  let bestT = worldHit.t, victim = null, part = 0;
  for (const b of state.actors) {
    if (!b.alive || b.team === a.team) continue;
    const t = rayActor(b, ox, oy, oz, dx, dy, dz, partOut);
    if (t >= 0 && t < bestT) { bestT = t; victim = b; part = partOut.part; }
  }
  const shot = emit(state.events, EV.SHOT, a.id, victim ? victim.id : -1, def.index, 0, ox, oy, oz);
  shot.x2 = ox + dx * bestT; shot.y2 = oy + dy * bestT; shot.z2 = oz + dz * bestT;
  if (victim) applyDamage(state, victim, a, def, part, bestT);
  else if (hitWall) {
    const e = emit(state.events, EV.IMPACT, a.id, -1, worldHit.kind, 0, worldHit.x, worldHit.y, worldHit.z);
    e.x2 = worldHit.nx; e.y2 = worldHit.ny; e.z2 = worldHit.nz;
  }
}
