// Actors (player and bots alike): body, hitboxes, loadout and every damage rule.
import { MOVE, BODY, WEAPONS, ECON } from './config.js';
import { raySphere, rayCylinder, clearLine } from './collide.js';
import { emit, EV } from './events.js';

export function createActor(id, team, name, isBot) {
  return {
    id, team, name, isBot,
    alive: false, hp: 100, armor: 0, helm: false, kit: false, money: 0,
    pos: { x: 0, y: 0, z: 0 }, prev: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, prevYaw: 0,
    grounded: true, crouch: 0, stride: 0, // crouch 0..1; stride: metres run since the last footstep
    // The command record input.js (player) or bots.js fills; the sim reads only this.
    cmd: { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, fire: false, aim: false, reload: false, crouch: false, walk: false, jump: false, use: false,
      slot: -1, toss: '', tossRange: 0, drop: false },
    slots: [null, null], active: 1, grenades: { frag: 0, smoke: 0 }, scoped: false, // slots: primary, sidearm ({ id, mag, reserve })
    fireCooldown: 0, reloadTimer: 0, drawTimer: 0, triggerHeld: false,
    bloom: 0, punchPitch: 0, punchYaw: 0, shotsFired: 0,
    kills: 0, deaths: 0, earned: 0, // earned: kill money this round
    lastHurtTime: -99, lastHurtBy: -1, diedAt: -99,
    brain: null, // bots only
  };
}

export function heightOf(a) { return MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * a.crouch; }
export function eyeOf(a) { return MOVE.standEye + (MOVE.crouchEye - MOVE.standEye) * a.crouch; }
export const pay = (a, amount) => { a.money = Math.min(ECON.max, a.money + amount); };

export function giveWeapon(a, id) {
  const def = WEAPONS[id], slot = def.slot === 'primary' ? 0 : 1;
  a.slots[slot] = { id, mag: def.mag, reserve: def.reserve };
  a.active = slot; a.drawTimer = def.draw; a.reloadTimer = 0;
}

// Survivors keep guns, grenades, armour and kit; the dead restart with the sidearm. Guns are refilled.
export function respawn(a, spawn, yaw) {
  if (!a.alive) { a.slots[0] = a.slots[1] = null; a.armor = 0; a.helm = a.kit = false; a.grenades.frag = a.grenades.smoke = 0; }
  if (!a.slots[1]) giveWeapon(a, 'rivet');
  for (const w of a.slots) if (w) { w.mag = WEAPONS[w.id].mag; w.reserve = WEAPONS[w.id].reserve; }
  a.active = a.slots[0] ? 0 : 1;
  a.alive = true; a.hp = 100;
  a.pos.x = a.prev.x = spawn.x; a.pos.z = a.prev.z = spawn.z; a.pos.y = a.prev.y = 0;
  a.vel.x = a.vel.y = a.vel.z = 0;
  a.yaw = a.prevYaw = yaw; a.pitch = 0;
  a.crouch = 0; a.grounded = true; a.stride = 0;
  a.fireCooldown = a.reloadTimer = a.drawTimer = 0;
  a.bloom = a.punchPitch = a.punchYaw = a.shotsFired = 0;
  a.scoped = false; a.lastHurtBy = -1; a.earned = 0;
}

// Ray against the three hitboxes: distance, and out.part = 1 head, 2 torso, 3 legs.
export function rayActor(a, ox, oy, oz, dx, dy, dz, out) {
  const h = heightOf(a), { x, y, z } = a.pos, legTop = y + h * BODY.legTop;
  let best = -1;
  const head = raySphere(ox, oy, oz, dx, dy, dz, x, y + h - BODY.headRadius, z, BODY.headRadius);
  if (head >= 0) { best = head; out.part = 1; }
  const torso = rayCylinder(ox, oy, oz, dx, dy, dz, x, z, BODY.torsoRadius, legTop, y + h - BODY.headRadius * 2);
  if (torso >= 0 && (best < 0 || torso < best)) { best = torso; out.part = 2; }
  const legs = rayCylinder(ox, oy, oz, dx, dy, dz, x, z, BODY.legRadius, y, legTop);
  if (legs >= 0 && (best < 0 || legs < best)) { best = legs; out.part = 3; }
  return best;
}

export function applyDamage(state, victim, attacker, def, part, distance) {
  const mult = part === 1 ? def.headMult : part === 3 ? BODY.legMult : BODY.torsoMult;
  hurt(state, victim, attacker, def.damage * mult * Math.pow(def.falloff, distance / 25), def.armorPen, part, def, attacker.pos.x, attacker.pos.z);
}

// Every damage ends here: a vest guards the torso, a helm the head, while armour points last (health
// takes dmg x pen, armour loses half the rest). (fromX, fromZ) is the source, for the HUD's arc.
function hurt(state, victim, attacker, amount, pen, part, def, fromX, fromZ) {
  if (!victim.alive) return;
  let dmg = amount;
  if (victim.armor > 0 && (part === 2 || (part === 1 && victim.helm))) {
    const soaked = Math.min(dmg * (1 - pen), victim.armor * 2);
    victim.armor = Math.max(0, victim.armor - soaked * 0.5);
    dmg -= soaked;
  }
  dmg = Math.max(1, Math.round(dmg));
  victim.hp -= dmg;
  victim.lastHurtTime = state.time;
  victim.lastHurtBy = attacker ? attacker.id : -1;
  emit(state.events, EV.HIT, attacker ? attacker.id : -1, victim.id, dmg, part, fromX, 0, fromZ);
  if (victim.hp > 0) return;
  // The kill: no credit for a teamkill or the core's blast.
  const killer = attacker && attacker.team !== victim.team ? attacker : null;
  victim.hp = 0; victim.alive = false; victim.diedAt = state.time; victim.deaths++;
  victim.vel.x = victim.vel.z = 0;
  if (killer) {
    killer.kills++;
    if (def) { pay(killer, def.reward); killer.earned += def.reward; }
  }
  emit(state.events, EV.KILL, killer ? killer.id : -1, victim.id, def ? def.index : -1, part === 1 ? 1 : 0);
}

// Radial damage (frag, core): linear to 0 at `radius`, blocked by walls, credited to `owner`.
export function blast(state, x, y, z, radius, damage, pen, owner, def) {
  for (const a of state.actors) {
    const d = Math.hypot(a.pos.x - x, a.pos.y + 0.9 - y, a.pos.z - z);
    if (!a.alive || d > radius || !clearLine(state.map, x, y + 0.2, z, a.pos.x, a.pos.y + 0.9, a.pos.z)) continue;
    hurt(state, a, owner, damage * (1 - d / radius), pen, 2, def, x, z);
  }
}
