// Boot and the one loop: fixed 1/60 s simulation steps from an accumulator, interpolated rendering.
import { DT } from './sim/config.js';
import { createGame, step } from './sim/sim.js';
import { SHOP, buy } from './sim/economy.js';
import { createInput } from './input.js';
import { createHud } from './ui/hud.js';
import { createView } from './render/view.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const shot = params.get('shot');

const state = createGame(seed);
const view = createView(state, document.getElementById('game'));
const hud = createHud(state, view.camera);
const overlay = document.getElementById('overlay');
let running = false, lastRound = 0;

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
    if (!hud.isBuyOpen()) return false;
    const item = SHOP.find((s) => `Digit${s.key}` === code);
    if (item) buy(state, state.player, item);
    else if (code === 'Escape') hud.toggleBuy(false);
    return !!item || code === 'Escape';
  },
});
document.getElementById('play').addEventListener('click', () => view.canvas.requestPointerLock());

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
}

// Screenshot staging and the play-test hook live in a dev module loaded only for ?shot / ?test.
if (shot || params.has('test')) import('./shots.js').then((m) => m.dev(shot, { state, view, hud, input, step }, (on) => { running = on; }));
if (!shot) { followRounds(); requestAnimationFrame(frame); }
