// Boot and the one loop: fixed 1/60 s simulation steps from an accumulator, interpolated rendering.
import { DT } from './sim/config.js';
import { createGame, step } from './sim/sim.js';
import { SHOP, buy } from './sim/economy.js';
import { createInput } from './input.js';
import { createHud } from './ui/hud.js';
import { createView } from './render/view.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(location.search), shot = params.get('shot');
const byId = (id) => document.getElementById(id);
const state = createGame(parseInt(params.get('seed'), 10) || 7);
const view = createView(state, byId('game'));
const hud = createHud(state, view.camera), audio = createAudio(state);
let running = false, lastRound = 0, order = null;

// Chrome refuses a re-lock for ~1 s after Esc: say so rather than fail silently.
const hint = () => { byId('overlay-title').textContent = 'Click again to resume'; };
function lock() {
  audio.start();
  const p = view.canvas.requestPointerLock();
  p?.catch(hint);
}
document.addEventListener('pointerlockerror', hint);

const input = createInput(view.canvas, {
  lock,
  onLock(locked) {
    running = locked;
    if (!locked) hud.toggleBuy(false);
    byId('overlay').hidden = locked;
    byId('overlay-title').textContent = 'Paused';
    byId('play').textContent = 'Resume';
  },
  onKey(code, down) {
    if (code === 'Tab') { hud.showBoard(down); return true; }
    if (!down || !running) return false;
    if (code === 'KeyB') { hud.toggleBuy(); return true; }
    if (!hud.isBuyOpen()) return false;
    const item = SHOP.find((s) => `Digit${s.key}` === code);
    if (item) order = item;
    return !!item;
  },
});
byId('play').addEventListener('click', lock);

function followRounds() { // face the spawn's direction at each new round
  if (state.round.number !== lastRound) { lastRound = state.round.number; input.face(state.player.yaw, 0); }
}

let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    for (acc += dt; acc >= DT; acc -= DT) {
      input.fill(state.player.cmd);
      if (order) { buy(state, state.player, order); order = null; } // menu buys land on a tick
      step(state);
      followRounds();
    }
  }
  view.render(acc / DT, dt, input.look);
  hud.update();
  audio.update();
}

// Test hook for tools/ (screenshot scenes, play test).
if (shot || params.has('test')) window.__brineworks = { state, view, hud, input, step, run: (on) => { running = on; } };
if (!shot) { followRounds(); requestAnimationFrame(frame); }
