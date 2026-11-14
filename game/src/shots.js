// Screenshot staging (?shot=N&seed=S): plays the real simulation to a chosen moment with scripted
// input and a scripted opening position, renders it, then stops and sets window.__shotReady for
// the capture tool. Nothing here runs in normal play.
import { DT, SIDE } from './sim/config.js';
import { giveWeapon, eyeOf } from './sim/actors.js';

// Advance n ticks with an optional per-tick script; only the last `drawn` ticks are rendered, so
// effects (tracers, flashes) are mid-flight in the final frame without rendering every tick.
function run(ctx, n, script, drawn = 3) {
  const { state, view, input, step } = ctx;
  for (let i = 0; i < n; i++) {
    if (script) script(i);
    input.fill(state.player.cmd);
    if (script) script(i);
    step(state);
    if (i >= n - drawn) view.render(1, DT, input.look);
  }
}

// Fast-forward (nothing rendered) until a condition holds, the player idle.
function skipUntil(ctx, done) {
  for (let i = 0; i < 60 * 60 * 30 && !done(ctx.state); i++) {
    ctx.input.fill(ctx.state.player.cmd);
    ctx.step(ctx.state);
  }
}

// Put an actor on a cell (column, row of the map grid), facing a world point.
function place(state, a, c, r, lookX, lookZ, gun) {
  a.pos.x = a.prev.x = (c + 0.5) * state.map.cell;
  a.pos.z = a.prev.z = (r + 0.5) * state.map.cell;
  a.pos.y = a.prev.y = state.map.height[r * state.map.w + c];
  a.vel.x = a.vel.z = 0;
  a.yaw = a.prevYaw = a.cmd.yaw = Math.atan2(-(lookX - a.pos.x), -(lookZ - a.pos.z));
  a.pitch = a.cmd.pitch = 0;
  if (gun) giveWeapon(a, gun);
  a.drawTimer = 0;
}

// Point the player's view at a target's body (height dy above its feet, yaw offset dx).
function aim(ctx, t, dy = 1.35, dx = 0) {
  const p = ctx.state.player;
  const ex = p.pos.x, ey = p.pos.y + eyeOf(p), ez = p.pos.z;
  ctx.input.face(Math.atan2(-(t.pos.x - ex), -(t.pos.z - ez)) + dx, Math.atan2(t.pos.y + dy - ey, Math.hypot(t.pos.x - ex, t.pos.z - ez)));
}

// A bot in the scene already has its target and fires after `react` seconds.
function engage(bot, target, react) {
  const b = bot.brain;
  b.target = target.id; b.reactTimer = react; b.errYaw = 0.03; b.errPitch = 0.01; b.aimHead = false;
  b.lastSeenX = target.pos.x; b.lastSeenZ = target.pos.z; b.lastSeenTime = 1e9;
}

const team = (state, side) => state.actors.filter((a) => state.teams[a.team].side === side);

const SCENES = {
  // Cover: a firefight at the long door of A, the player spraying a rifle into the site.
  1(ctx) {
    const { state } = ctx;
    skipUntil(ctx, (s) => s.round.number === 2 && s.round.phase === 'live');
    const p = state.player;
    const mates = team(state, SIDE.ATTACK).filter((a) => a !== p), foes = team(state, SIDE.DEFEND);
    place(state, p, 49, 22, 47 * 1.5, 12 * 1.5, 'kestrel');
    p.armor = 100;
    place(state, mates[0], 48, 19, 45 * 1.5, 11 * 1.5, 'kestrel');
    place(state, mates[1], 51, 24, 51 * 1.5, 12 * 1.5, 'wasp');
    for (const m of mates.slice(2)) place(state, m, 50, 31, 49 * 1.5, 20 * 1.5);
    place(state, foes[0], 46, 12, p.pos.x, p.pos.z, 'kestrel');
    place(state, foes[1], 43, 10, p.pos.x, p.pos.z, 'kestrel');
    place(state, foes[2], 51, 13, p.pos.x, p.pos.z, 'wasp');
    for (const f of foes.slice(3)) place(state, f, 27, 3, 27 * 1.5, 30 * 1.5);
    engage(foes[0], p, 0.1); engage(foes[1], mates[0], 0.05); engage(foes[2], mates[0], 0.2);
    engage(mates[0], foes[1], 0.05);
    aim(ctx, foes[0], 1.2, 0.004);
    run(ctx, 16, () => {
      p.cmd.fire = true;
      p.hp = Math.max(p.hp, 64);
    });
  },
  // Buy menu in the rail yard during the freeze of a later round.
  2(ctx) {
    skipUntil(ctx, (s) => s.round.number >= 3 && s.round.phase === 'freeze');
    const { state } = ctx;
    const p = state.player;
    p.money = Math.max(p.money, 4350);
    place(state, p, 27, 41, 27 * 1.5, 30 * 1.5);
    ctx.input.face(p.yaw - 0.35, -0.04);
    run(ctx, 20);
    ctx.hud.toggleBuy(true);
  },
  // Retake: the core is armed on B; the player crouches over it disarming, smoke on the door.
  3(ctx) {
    stageRetake(ctx);
    run(ctx, 60 * 3, () => { ctx.state.player.cmd.use = true; ctx.state.player.cmd.crouch = true; });
  },
  // The same retake a moment later: core disarmed, round won, scores up.
  4(ctx) {
    stageRetake(ctx);
    run(ctx, 60 * 6, () => { ctx.state.player.cmd.use = true; ctx.state.player.cmd.crouch = true; }, 0);
    skipUntil(ctx, (s) => s.round.phase === 'over' && s.round.timer < 4.2);
    ctx.hud.showBoard(true);
    run(ctx, 2);
  },
};

function stageRetake(ctx) {
  const { state } = ctx;
  skipUntil(ctx, (s) => s.round.number === 7 && s.round.phase === 'live');
  const p = state.player;
  const mates = team(state, SIDE.DEFEND).filter((a) => a !== p), foes = team(state, SIDE.ATTACK);
  // the attackers armed the core on B; one of them is down beside it, the rest are far away
  const core = state.core;
  core.state = 'planted'; core.site = 'B'; core.fuse = 19; core.carrier = -1;
  core.x = 8.5 * 1.5; core.y = 0; core.z = 12.2 * 1.5;
  state.round.planted = true;
  place(state, p, 8, 13, core.x, core.z, 'kestrel');
  place(state, mates[0], 11, 15, 5 * 1.5, 19 * 1.5, 'kestrel');
  place(state, mates[1], 12, 8, 10 * 1.5, 6 * 1.5, 'heron');
  for (const m of mates.slice(2)) place(state, m, 14, 9, 13 * 1.5, 19 * 1.5);
  for (const f of foes) place(state, f, 5, 30, 5 * 1.5, 19 * 1.5);
  place(state, foes[0], 6, 15, 8 * 1.5, 13 * 1.5);
  foes[0].alive = false; foes[0].hp = 0;
  const smoke = state.smokes[0];
  smoke.live = true; smoke.x = 5.5 * 1.5; smoke.y = 0; smoke.z = 17.6 * 1.5; smoke.age = 1;
  ctx.input.face(p.yaw + 0.55, -0.42);
}

export function stageShot(name, ctx) {
  document.getElementById('overlay').hidden = true;
  window.addEventListener('load', () => setTimeout(() => {
    (SCENES[name] ?? SCENES[1])(ctx);
    ctx.hud.update();
    requestAnimationFrame(() => { ctx.hud.update(); window.__shotReady = true; });
  }, 50));
}
