// Boot and the one loop. The simulation advances in fixed 1/60 s steps (an accumulator absorbs
// the display's frame rate); the renderer draws in between, interpolating with the leftover
// fraction. Simulation state lives in one object (sim/state.js); view, HUD and audio only read it.
import { DT } from './sim/config.js';
import { createGame, step } from './sim/sim.js';
import { SHOP, buy } from './sim/economy.js';
import { createView } from './render/view.js';
import { createHud } from './ui/hud.js';
import { createInput } from './input.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const shot = params.get('shot');

const state = createGame(seed);
const view = createView(state, document.getElementById('game'));
const hud = createHud(state, view.camera);
const overlay = document.getElementById('overlay');
let running = false;
let lastRound = 0;

const input = createInput(view.canvas, {
  onLock(locked) {
    running = locked;
    overlay.hidden = locked;
    document.getElementById('overlay-title').textContent = 'Paused';
    document.getElementById('play').textContent = 'Resume';
  },
  onKey(code, down) {
    if (code === 'Tab') { hud.showBoard(down); return true; }
    if (!down || !running) return false;
    if (code === 'KeyB') { hud.toggleBuy(); return true; }
    if (hud.isBuyOpen()) {
      const item = SHOP.find((s) => `Digit${s.key}` === code);
      if (item) { buy(state, state.player, item); return true; }
      if (code === 'Escape') { hud.toggleBuy(false); return true; }
    }
    return false;
  },
});
document.getElementById('play').addEventListener('click', () => view.canvas.requestPointerLock());

function followRounds() {
  if (state.round.number !== lastRound) {
    lastRound = state.round.number;
    input.face(state.player.yaw, 0);
  }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    acc += dt;
    while (acc >= DT) {
      input.fill(state.player.cmd);
      step(state);
      followRounds();
      acc -= DT;
    }
  }
  view.render(acc / DT, dt, input.look);
  hud.update();
}

if (shot) stageShot(shot, { state, view, hud, input, step });
else { followRounds(); requestAnimationFrame(frame); }

// ?test: automated play tests (tools/playtest.mjs) drive the same loop without pointer lock.
if (params.has('test')) {
  running = true;
  overlay.hidden = true;
  window.__saltline = { state, step, pause: () => { running = false; }, resume: () => { running = true; } };
}
