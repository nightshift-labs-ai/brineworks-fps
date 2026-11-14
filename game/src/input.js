// Pointer-lock mouse look and keys -> the player's command record (the one bots fill in bots.js).
// Look is applied at frame rate; one-shot keys (jump, reload, weapons) are latched until a tick reads them.
const SENSITIVITY = 0.0022;

export function createInput(canvas, handlers) {
  const held = new Set();
  const look = { yaw: 0, pitch: 0 };
  let fire = false, aim = false, jump = false, reload = false, slot = -1, toss = '';
  let locked = false;

  canvas.addEventListener('click', () => { if (!locked) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    handlers.onLock(locked);
    if (!locked) { held.clear(); fire = false; aim = false; }
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    look.yaw -= e.movementX * SENSITIVITY;
    look.pitch = Math.max(-1.45, Math.min(1.45, look.pitch - e.movementY * SENSITIVITY));
  });
  document.addEventListener('mousedown', (e) => {
    if (!locked) return;
    if (e.button === 0) fire = true;
    if (e.button === 2) aim = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) fire = false;
    if (e.button === 2) aim = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    if (handlers.onKey(e.code, true)) return; // menus may claim a key (buy menu digits)
    held.add(e.code);
    if (e.code === 'Space') jump = true;
    if (e.code === 'KeyR') reload = true;
    if (e.code === 'Digit1') slot = 0;
    if (e.code === 'Digit2') slot = 1;
    if (e.code === 'KeyG') toss = 'frag';
    if (e.code === 'KeyF') toss = 'smoke';
  });
  document.addEventListener('keyup', (e) => { held.delete(e.code); handlers.onKey(e.code, false); });

  function fill(cmd) {
    cmd.moveZ = axis(held, 'KeyW', 'KeyS');
    cmd.moveX = axis(held, 'KeyD', 'KeyA');
    cmd.yaw = look.yaw;
    cmd.pitch = look.pitch;
    cmd.fire = fire && locked;
    cmd.aim = aim && locked;
    cmd.toss = toss;
    cmd.crouch = held.has('KeyC'); // not Ctrl: Ctrl+W would close the tab
    cmd.walk = held.has('ShiftLeft');
    cmd.jump = jump;
    cmd.reload = reload;
    cmd.slot = slot;
    cmd.use = held.has('KeyE');
    jump = reload = false;
    slot = -1;
    toss = '';
  }

  function face(yaw, pitch) { look.yaw = yaw; look.pitch = pitch; }

  return { fill, face, look };
}

function axis(held, pos, neg) { return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0); }
