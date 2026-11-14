// Screenshot staging (?shot=N&seed=S): runs the real simulation to a chosen moment with scripted
// player input, renders it, then stops and sets window.__shotReady for the capture tool.
import { DT } from './sim/config.js';

// Advance n ticks with an optional per-tick script; only the last `drawn` ticks are rendered, so
// effects (tracers, flashes) are mid-flight in the final frame without rendering every tick.
function runTicks(ctx, n, script, drawn = 0) {
  const { state, view, input, step } = ctx;
  for (let i = 0; i < n; i++) {
    if (script) script(state, input, i);
    input.fill(state.player.cmd);
    step(state);
    if (i >= n - drawn) view.render(1, DT, input.look);
  }
}

// Fast-forward (no rendering) until a condition holds, with the player standing idle.
function skipUntil(ctx, done, limit = 60 * 60 * 20) {
  for (let i = 0; i < limit && !done(ctx.state); i++) {
    ctx.input.fill(ctx.state.player.cmd);
    ctx.step(ctx.state);
  }
  ctx.input.face(ctx.state.player.yaw, 0);
}

const SCENES = {
  // Round start view, then a few seconds of live play.
  1(ctx) {
    ctx.input.face(ctx.state.player.yaw, 0);
    runTicks(ctx, 60 * 9);
  },
  // Buy menu during the freeze of a later round, with money to spend.
  2(ctx) {
    skipUntil(ctx, (s) => s.round.number >= 3 && s.round.phase === 'freeze');
    runTicks(ctx, 30, null, 2);
    ctx.hud.toggleBuy(true);
  },
  // A round just decided: banner and scoreboard.
  3(ctx) {
    skipUntil(ctx, (s) => s.round.number >= 2 && s.round.phase === 'over');
    runTicks(ctx, 40, null, 2);
    ctx.hud.showBoard(true);
  },
};

export function stageShot(name, ctx) {
  const scene = SCENES[name] ?? SCENES[1];
  document.getElementById('overlay').hidden = true;
  window.addEventListener('load', () => setTimeout(() => finish(scene, ctx), 50));
}

function finish(scene, ctx) {
  scene(ctx);
  ctx.view.render(1, DT, ctx.input.look);
  ctx.hud.update();
  requestAnimationFrame(() => {
    ctx.view.render(1, 0, ctx.input.look);
    ctx.hud.update();
    window.__shotReady = true;
  });
}
