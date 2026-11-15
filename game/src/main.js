// Boot and the one loop: fixed 1/60 s simulation steps from an accumulator, interpolated rendering.
import { DT } from './sim/config.js';
import { createGame, step } from './sim/sim.js';
import { SHOP, buy } from './sim/economy.js';
import { createInput } from './input.js';
import { createHud } from './ui/hud.js';
import { createAudio } from './audio.js';
import { createView } from './render/view.js';

const params = new URLSearchParams(location.search), shot = params.get('shot');
const byId = (id) => document.getElementById(id);
const state = createGame(parseInt(params.get('seed'), 10) || 7);
const view = createView(state, byId('game'));
const hud = createHud(state, view.camera), audio = createAudio(state);
let running = false, lastRound = 0;

// Chrome refuses a re-lock for about a second after Esc: say so instead of failing silently.
const hint = () => { byId('overlay-title').textContent = 'Click again to resume'; };
function lock() {
  audio.start();
  const p = view.canvas.requestPointerLock();
  if (p && p.catch) p.catch(hint);
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
    if (item) buy(state, state.player, item);
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
      step(state);
      followRounds();
    }
  }
  view.render(acc / DT, dt, input.look);
  hud.update();
  audio.update();
}

// Dev hook for tools/ (staged screenshots, the play test): the sim, the view and a switch for the loop.
if (shot || params.has('test')) window.__brineworks = { state, view, hud, input, step, run: (on) => { running = on; } };
if (!shot) { followRounds(); requestAnimationFrame(frame); }
