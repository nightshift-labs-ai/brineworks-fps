// Pointer-lock mouse look and keys -> the player's command record (the one bots fill in bots.js).
// Look is applied at frame rate; one-shot keys (jump, reload, weapons, drop) are latched until a tick reads them.
import { MOVE } from './sim/config.js';

const SENSITIVITY = 0.0022, TOSS_HOLD = 900; // ms G/F stay latched, to outlast a weapon draw
const SLOTS = { Digit1: 0, Digit2: 1 }, TOSSES = { KeyG: 'frag', KeyF: 'smoke' };

export function createInput(canvas, handlers) {
  const held = new Set(), look = { yaw: 0, pitch: 0 };
  let fire = false, aim = false, jump = false, reload = false, drop = false, slot = -1, toss = '', tossUntil = 0, locked = false;
  const axis = (pos, neg) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);
  const button = (e, down) => {
    if (e.button === 0) fire = down;
    if (e.button === 2) aim = down;
  };

  canvas.addEventListener('click', () => { if (!locked) handlers.lock(); });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    handlers.onLock(locked);
    if (!locked) { held.clear(); fire = aim = false; }
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    look.yaw -= e.movementX * SENSITIVITY;
    look.pitch = Math.max(-MOVE.maxPitch, Math.min(MOVE.maxPitch, look.pitch - e.movementY * SENSITIVITY));
  });
  document.addEventListener('mousedown', (e) => { if (locked) button(e, true); });
  document.addEventListener('mouseup', (e) => button(e, false));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat || handlers.onKey(e.code, true) || !locked) return; // menus may claim a key; no latching while paused
    held.add(e.code);
    if (e.code === 'Space') jump = true;
    if (e.code === 'KeyR') reload = true;
    if (e.code === 'KeyX') drop = true;
    slot = SLOTS[e.code] ?? slot;
    if (TOSSES[e.code]) { toss = TOSSES[e.code]; tossUntil = performance.now() + TOSS_HOLD; }
  });
  document.addEventListener('keyup', (e) => { held.delete(e.code); handlers.onKey(e.code, false); });

  function fill(cmd) {
    cmd.moveZ = axis('KeyW', 'KeyS'); cmd.moveX = axis('KeyD', 'KeyA');
    cmd.yaw = look.yaw; cmd.pitch = look.pitch;
    cmd.fire = fire && locked; cmd.aim = aim && locked;
    cmd.toss = performance.now() < tossUntil ? toss : ''; // one of each kind: no double throw
    cmd.crouch = held.has('KeyC'); // not Ctrl: Ctrl+W would close the tab
    cmd.walk = held.has('ShiftLeft');
    cmd.use = held.has('KeyE');
    cmd.jump = jump; cmd.reload = reload; cmd.drop = drop; cmd.slot = slot;
    jump = reload = drop = false; slot = -1; // latched keys count once
  }

  return { fill, look, face(yaw, pitch) { look.yaw = yaw; look.pitch = pitch; } };
}
