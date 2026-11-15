// Movement for every actor: Quake-style accelerate/friction, crouch, walk, jump, collision, footsteps.
import { DT, GRAVITY, MOVE, WEAPONS } from './config.js';
import { moveBody, nudgeBody } from './collide.js';
import { emit, EV } from './events.js';
import { makeNoise } from './senses.js';

export function moveActor(state, a, cmd, frozen) {
  a.prev.x = a.pos.x; a.prev.y = a.pos.y; a.prev.z = a.pos.z;
  a.prevYaw = a.yaw;
  a.yaw = cmd.yaw;
  a.pitch = Math.max(-1.45, Math.min(1.45, cmd.pitch));
  const rate = MOVE.crouchRate * DT;
  a.crouch += Math.max(-rate, Math.min(rate, (cmd.crouch ? 1 : 0) - a.crouch));

  let mx = frozen ? 0 : cmd.moveX, mz = frozen ? 0 : cmd.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  let wx = mx * cos - mz * sin, wz = -mx * sin - mz * cos;
  const wlen = Math.hypot(wx, wz);
  if (wlen > 1e-5) { wx /= wlen; wz /= wlen; }
  const w = a.slots[a.active], upright = cmd.walk ? MOVE.walkSpeed : MOVE.runSpeed;
  const wishSpeed = wlen > 1e-5 ? (upright + (MOVE.crouchSpeed - upright) * a.crouch) * (w ? WEAPONS[w.id].speedMult : 1) : 0;

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

  const wasAirborne = !a.grounded, fallSpeed = a.vel.y;
  moveBody(state.map, a, DT);
  if (wasAirborne && a.grounded && fallSpeed < -5) makeNoise(state, a, 'land');

  // Running is loud; walking and crouching are silent.
  const speed = Math.hypot(a.vel.x, a.vel.z);
  if (a.grounded && speed > MOVE.walkSpeed * 1.15 && (a.stride += speed * DT) >= MOVE.footstepEvery) {
    a.stride = 0;
    emit(state.events, EV.STEP, a.id, -1, 0, 0, a.pos.x, a.pos.y, a.pos.z);
    makeNoise(state, a, 'step');
  }
}

function applyFriction(a) {
  const speed = Math.hypot(a.vel.x, a.vel.z);
  if (speed < 1e-4) { a.vel.x = a.vel.z = 0; return; }
  const scale = Math.max(0, speed - Math.max(speed, MOVE.stopSpeed) * MOVE.friction * DT) / speed;
  a.vel.x *= scale; a.vel.z *= scale;
}

function accelerate(a, wx, wz, wishSpeed, accel) {
  const add = wishSpeed - (a.vel.x * wx + a.vel.z * wz);
  if (add <= 0) return;
  const gain = Math.min(add, accel * wishSpeed * DT);
  a.vel.x += wx * gain; a.vel.z += wz * gain;
}

export function separateActors(state) {
  const list = state.actors, min = MOVE.radius * 2;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j], dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (!b.alive || Math.abs(a.pos.y - b.pos.y) > 1.5 || d >= min || d < 1e-5) continue;
      const push = (min - d) * 0.5 / d;
      nudgeBody(state.map, a, -dx * push, -dz * push);
      nudgeBody(state.map, b, dx * push, dz * push);
    }
  }
}
