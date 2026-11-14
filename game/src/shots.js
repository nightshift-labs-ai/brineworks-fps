// Screenshot staging (?shot=N&seed=S). The match is played by the sim with the player slot on the bot
// brain (autopilot) up to a chosen round; then a few actors are put in place for the composition and
// the real simulation runs the moment (shots, hits, smoke, arming) before the frame is taken.
import { DT, SIDE } from './sim/config.js';
import { giveWeapon, eyeOf } from './sim/actors.js';
import { createBrain, think } from './sim/bots.js';

// Advance n ticks; `script` runs before each tick, the last `drawn` ticks are rendered (effects in flight).
function run(ctx, n, script, drawn = 3) {
  const { state, view, input, step } = ctx;
  for (let i = 0; i < n; i++) {
    input.fill(state.player.cmd);
    if (script) script(i);
    step(state);
    if (i >= n - drawn) view.render(1, DT, input.look);
  }
}

// Fast-forward with the player on autopilot until `done`, then hand the slot back to the input.
function autopilot(ctx, done) {
  const { state } = ctx, p = state.player;
  p.isBot = true;
  for (let i = 0; i < 60 * 60 * 40 && !done(state); i++) {
    if (p.alive) think(state, p);
    ctx.step(state);
  }
  p.isBot = false;
}

// Put an actor on a map cell facing a cell, optionally with a gun.
function place(state, a, c, r, fc, fr, gun) {
  const S = state.map.cell;
  a.alive = true; a.hp = Math.max(a.hp, 1);
  a.pos.x = a.prev.x = (c + 0.5) * S; a.pos.z = a.prev.z = (r + 0.5) * S;
  a.pos.y = a.prev.y = state.map.height[r * state.map.w + c];
  a.vel.x = a.vel.z = 0;
  a.yaw = a.prevYaw = a.cmd.yaw = Math.atan2(-(fc - c), -(fr - r));
  a.pitch = a.cmd.pitch = 0;
  if (gun) giveWeapon(a, gun);
  a.drawTimer = 0;
  if (a.brain) Object.assign(a.brain, { plan: 'hold', holdX: a.pos.x, holdZ: a.pos.z, lookX: (fc + 0.5) * S, lookZ: (fr + 0.5) * S, target: -1 });
}

// The player looks at an actor's chest (yaw offset dx).
function look(ctx, t, dx = 0) {
  const p = ctx.state.player, ey = p.pos.y + eyeOf(p);
  ctx.input.face(Math.atan2(-(t.pos.x - p.pos.x), -(t.pos.z - p.pos.z)) + dx, Math.atan2(t.pos.y + 1.25 - ey, Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z)));
}

// A bot that has already seen `target` and fires after `react` seconds.
function engage(bot, target, react) {
  Object.assign(bot.brain, { target: target.id, reactTimer: react, errYaw: 0.02, errPitch: 0.01, aimHead: false, lastSeenId: target.id, lastSeenTime: 1e9 });
}

const side = (state, s) => state.actors.filter((a) => state.teams[a.team].side === s && a !== state.player);
// Everyone not in the shot waits in their own spawn, out of sight.
const park = (state, list) => list.forEach((a, i) => { const s = state.map.spawns[state.teams[a.team].side][i % 5]; place(state, a, Math.floor(s.x / 1.5), Math.floor(s.z / 1.5), 27, 20); });
const kit = (a) => { a.grenades.frag = 1; a.grenades.smoke = 1; a.armor = 100; a.helm = true; };

const SCENES = {
  // Cover (seed 9): round 5 of a real match, where two Saltreeve frags have just landed (kill feed).
  // In Conveyor Court a Saltreeve 5 m ahead fires at you and another flanks from the right.
  1(ctx) {
    const { state } = ctx, p = state.player;
    autopilot(ctx, (s) => s.round.number === 5 && s.round.phase === 'live' && s.round.clock < 95);
    const foes = side(state, SIDE.DEFEND);
    park(state, [...side(state, SIDE.ATTACK), ...foes]);
    place(state, p, 24, 30, 25, 27, 'ballast'); kit(p); p.hp = 100;
    place(state, foes[0], 25, 27, 24, 30, 'ballast'); foes[0].armor = 100; foes[0].hp = 100;
    place(state, foes[1], 31, 24, 24, 30, 'skiff');
    engage(foes[0], p, 0.3); engage(foes[1], p, 0.25);
    look(ctx, foes[0], 0.02);
    run(ctx, 24, (i) => { p.cmd.fire = i > 12; });
  },
  // Requisition at the pumphouse during the buy window of a later round; an attacker shows at Tower Foot.
  2(ctx) {
    const { state } = ctx, p = state.player;
    autopilot(ctx, (s) => s.round.number >= 7 && s.round.phase === 'live');
    p.money = Math.max(p.money, 3150);
    const mates = side(state, SIDE.DEFEND), foes = side(state, SIDE.ATTACK);
    park(state, [...mates, ...foes]);
    place(state, p, 27, 3, 28, 15);
    place(state, mates[0], 25, 5, 26, 9, 'ballast'); place(state, mates[1], 30, 4, 28, 8, 'skiff');
    place(state, foes[0], 28, 16, 28, 9, 'ballast');
    ctx.input.face(p.yaw + 0.12, -0.03);
    run(ctx, 20);
    ctx.hud.toggleBuy(true);
  },
  // Arming the core on B under a teammate's smoke on Hall Gate; a Saltreeve presses from the north-west.
  3(ctx) { stagePlant(ctx); run(ctx, 110, () => { ctx.state.player.cmd.use = true; }); },
  // The same round played out: the round-end banner, scores and the camera pulled up over the site.
  4(ctx) {
    stagePlant(ctx);
    run(ctx, 200, () => { ctx.state.player.cmd.use = true; }, 0);
    autopilot(ctx, (s) => s.round.phase === 'over' && s.time - s.round.endedAt > 2.2);
    ctx.hud.showBoard(true);
    run(ctx, 2);
  },
};

function stagePlant(ctx) {
  const { state } = ctx, p = state.player;
  autopilot(ctx, (s) => s.round.number === 4 && s.round.phase === 'live' && s.round.clock < 92);
  const mates = side(state, SIDE.ATTACK), foes = side(state, SIDE.DEFEND);
  park(state, [...mates, ...foes]);
  place(state, p, 8, 13, 10, 7, 'ballast'); kit(p); p.hp = 100;
  Object.assign(state.core, { state: 'carried', carrier: p.id });
  place(state, mates[0], 12, 13, 12, 18, 'ballast'); place(state, mates[1], 13, 8, 10, 6, 'skiff');
  // Rook's smoke sits on Hall Gate; a Saltreeve inside it cannot see out (smokeBlocks).
  Object.assign(state.smokes[0], { live: true, x: 10.5 * 1.5, y: 0, z: 6.6 * 1.5, age: 2 });
  place(state, foes[0], 10, 6, 8, 13, 'ballast');
  ctx.input.face(p.yaw - 0.15, -0.36);
}

// ?shot=N stages scene N and sets window.__shotReady; ?test exposes the sim to tools/playtest.mjs.
export function dev(name, ctx, setRunning) {
  document.getElementById('overlay').hidden = true;
  if (!name) {
    setRunning(true);
    window.__brineworks = { state: ctx.state, step: ctx.step, pause: () => setRunning(false), resume: () => setRunning(true) };
    return;
  }
  const go = () => setTimeout(() => {
    ctx.state.player.brain = createBrain(0.7, 'entry');
    (SCENES[name] ?? SCENES[1])(ctx);
    ctx.hud.update();
    requestAnimationFrame(() => { ctx.hud.update(); window.__shotReady = true; });
  }, 50);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
}
