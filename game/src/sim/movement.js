// Movement for every actor: Quake-style accelerate/friction, crouch, walk, jump, collision, footsteps.
import { DT, GRAVITY, MOVE } from './config.js';
import { moveBody, nudgeBody } from './collide.js';
import { weaponDef } from './actors.js';
import { emit, EV } from './events.js';
import { makeNoise } from './senses.js';

export function moveActor(state, a, cmd, frozen) {
  a.prev.x = a.pos.x; a.prev.y = a.pos.y; a.prev.z = a.pos.z;
  a.prevYaw = a.yaw;
  a.yaw = cmd.yaw;
  a.pitch = Math.max(-1.45, Math.min(1.45, cmd.pitch));

  const wantCrouch = cmd.crouch ? 1 : 0;
  const rate = MOVE.crouchRate * DT;
  a.crouch += Math.max(-rate, Math.min(rate, wantCrouch - a.crouch));

  let mx = frozen ? 0 : cmd.moveX, mz = frozen ? 0 : cmd.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  let wx = mx * cos - mz * sin;
  let wz = -mx * sin - mz * cos;
  const wlen = Math.hypot(wx, wz);
  if (wlen > 1e-5) { wx /= wlen; wz /= wlen; }
  const def = weaponDef(a);
  const upright = cmd.walk ? MOVE.walkSpeed : MOVE.runSpeed;
  const wishSpeed = wlen > 1e-5 ? (upright + (MOVE.crouchSpeed - upright) * a.crouch) * (def ? def.speedMult : 1) : 0;

  if (a.grounded) {
    applyFriction(a);
    accelerate(a, wx, wz, wishSpeed, MOVE.accel);
    if (cmd.jump && !frozen && a.crouch < 0.5) {
      a.vel.y = MOVE.jumpSpeed;
      a.grounded = false;
      emit(state.events, EV.JUMP, a.id);
    }
  } else {
    accelerate(a, wx, wz, wishSpeed, MOVE.airAccel);
    a.vel.y -= GRAVITY * DT;
  }

  const wasAirborne = !a.grounded;
  const fallSpeed = a.vel.y;
  moveBody(state.map, a, DT);
  if (wasAirborne && a.grounded && fallSpeed < -5) makeNoise(state, a, 'land');

  // Running is loud; walking and crouching are silent.
  const speed = Math.hypot(a.vel.x, a.vel.z);
  if (a.grounded && speed > MOVE.walkSpeed * 1.15) {
    a.stride += speed * DT;
    if (a.stride >= MOVE.footstepEvery) {
      a.stride = 0;
      const e = emit(state.events, EV.STEP, a.id);
      e.x = a.pos.x; e.y = a.pos.y; e.z = a.pos.z;
      makeNoise(state, a, 'step');
    }
  }
}

function applyFriction(a) {
  const speed = Math.hypot(a.vel.x, a.vel.z);
  if (speed < 1e-4) { a.vel.x = a.vel.z = 0; return; }
  const drop = Math.max(speed, MOVE.stopSpeed) * MOVE.friction * DT;
  const scale = Math.max(0, speed - drop) / speed;
  a.vel.x *= scale;
  a.vel.z *= scale;
}

function accelerate(a, wx, wz, wishSpeed, accel) {
  const current = a.vel.x * wx + a.vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const gain = Math.min(add, accel * wishSpeed * DT);
  a.vel.x += wx * gain;
  a.vel.z += wz * gain;
}

// Push each overlapping pair of bodies apart.
export function separateActors(state) {
  const list = state.actors;
  const min = MOVE.radius * 2;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-5) continue;
      const push = (min - d) * 0.5 / d;
      nudgeBody(state.map, a, -dx * push, -dz * push);
      nudgeBody(state.map, b, dx * push, dz * push);
    }
  }
}
