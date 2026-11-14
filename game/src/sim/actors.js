// Actors are the player and the bots alike: one record shape, created once and reused every round.
// This module owns their body (height, eye, hitboxes), loadout and the damage rules.
import { MOVE, BODY, WEAPONS, ECON } from './config.js';
import { raySphere, rayCylinder } from './collide.js';
import { emit, EV } from './events.js';

export function createCommand() {
  return { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false, aim: false, reload: false, crouch: false, walk: false, jump: false, use: false, slot: -1, toss: '' };
}

export function createActor(id, team, name, isBot) {
  return {
    id, team, name, isBot,
    alive: false, hp: 100, armor: 0, money: 0,
    pos: { x: 0, y: 0, z: 0 }, prev: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, prevYaw: 0, prevPitch: 0,
    grounded: true, crouch: 0, // crouch: 0 standing .. 1 fully crouched
    stride: 0, // metres run since the last footstep
    cmd: createCommand(),
    // loadout: one primary, one sidearm; each slot { id, mag, reserve } or null
    slots: [null, null],
    active: 1,
    grenades: { frag: 0, smoke: 0 },
    scoped: false,
    fireCooldown: 0, reloadTimer: 0, drawTimer: 0, triggerHeld: false,
    bloom: 0, punchPitch: 0, punchYaw: 0, shotsFired: 0,
    kills: 0, deaths: 0, roundKills: 0,
    lastHurtTime: -99, lastHurtBy: -1, diedAt: -99,
    brain: null, // bots only (see bots.js)
  };
}

export function heightOf(a) { return MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * a.crouch; }
export function eyeOf(a) { return MOVE.standEye + (MOVE.crouchEye - MOVE.standEye) * a.crouch; }
export function weaponOf(a) { return a.slots[a.active]; }
export function weaponDef(a) { const w = a.slots[a.active]; return w ? WEAPONS[w.id] : null; }

export function giveWeapon(a, id) {
  const def = WEAPONS[id];
  const slot = def.slot === 'primary' ? 0 : 1;
  a.slots[slot] = { id, mag: def.mag, reserve: def.reserve };
  a.active = slot;
  a.drawTimer = def.draw;
  a.reloadTimer = 0;
}

// Place an actor at a spawn for a new round. Survivors keep their guns and armour; the dead start
// again with the sidearm. Every gun is refilled.
export function respawn(a, spawn, yaw) {
  if (!a.alive) { a.slots[0] = null; a.slots[1] = null; a.armor = 0; a.grenades.frag = 0; a.grenades.smoke = 0; }
  if (!a.slots[1]) giveWeapon(a, 'pike');
  for (const w of a.slots) if (w) { w.mag = WEAPONS[w.id].mag; w.reserve = WEAPONS[w.id].reserve; }
  a.active = a.slots[0] ? 0 : 1;
  a.alive = true;
  a.hp = 100;
  a.pos.x = a.prev.x = spawn.x; a.pos.z = a.prev.z = spawn.z; a.pos.y = a.prev.y = 0;
  a.vel.x = a.vel.y = a.vel.z = 0;
  a.yaw = a.prevYaw = yaw; a.pitch = a.prevPitch = 0;
  a.crouch = 0; a.grounded = true; a.stride = 0;
  a.fireCooldown = 0; a.reloadTimer = 0; a.drawTimer = 0;
  a.bloom = 0; a.punchPitch = 0; a.punchYaw = 0; a.shotsFired = 0; a.scoped = false;
  a.roundKills = 0; a.lastHurtBy = -1;
}

// Hit test one actor's three hitboxes. Returns the distance and writes the part (1 head, 2 torso, 3 legs).
export function rayActor(a, ox, oy, oz, dx, dy, dz, out) {
  const h = heightOf(a);
  const { x, y, z } = a.pos;
  const legTop = y + h * BODY.legTop;
  let best = -1;
  const head = raySphere(ox, oy, oz, dx, dy, dz, x, y + h - BODY.headRadius, z, BODY.headRadius);
  if (head >= 0) { best = head; out.part = 1; }
  const torso = rayCylinder(ox, oy, oz, dx, dy, dz, x, z, BODY.torsoRadius, legTop, y + h - BODY.headRadius * 2);
  if (torso >= 0 && (best < 0 || torso < best)) { best = torso; out.part = 2; }
  const legs = rayCylinder(ox, oy, oz, dx, dy, dz, x, z, BODY.legRadius, y, legTop);
  if (legs >= 0 && (best < 0 || legs < best)) { best = legs; out.part = 3; }
  return best;
}

// Apply a bullet's damage. Armour soaks part of it except on the legs; the head multiplier is per weapon.
export function applyDamage(state, victim, attacker, def, part, distance) {
  if (!victim.alive) return;
  const mult = part === 1 ? def.headMult : part === 3 ? BODY.legMult : BODY.torsoMult;
  let dmg = def.damage * mult * Math.pow(def.falloff, distance / 25);
  if (victim.armor > 0 && part !== 3) {
    const soaked = dmg * (1 - def.armorPen);
    victim.armor = Math.max(0, victim.armor - soaked * 0.5);
    dmg -= soaked;
  }
  dmg = Math.max(1, Math.round(dmg));
  victim.hp -= dmg;
  victim.lastHurtTime = state.time;
  victim.lastHurtBy = attacker.id;
  const e = emit(state.events, EV.HIT, attacker.id, victim.id, dmg, part);
  e.x = attacker.pos.x; e.z = attacker.pos.z;
  if (victim.hp <= 0) kill(state, victim, attacker, def, part === 1);
}

export function kill(state, victim, killer, def, headshot) {
  victim.hp = 0;
  victim.alive = false;
  victim.diedAt = state.time;
  victim.deaths++;
  victim.vel.x = victim.vel.z = 0;
  if (killer && killer !== victim) {
    killer.kills++;
    killer.roundKills++;
    if (killer.team !== victim.team) killer.money = Math.min(ECON.max, killer.money + def.reward);
  }
  emit(state.events, EV.KILL, killer ? killer.id : -1, victim.id, def ? def.index : -1, headshot ? 1 : 0);
}
