// Screenshot staging for ?shot=N&seed=S. tools/shoot.mjs injects this file into the game page as a module
// (imports resolve from game/index.html), so it drives the same module instances as the game through
// window.__brineworks: the sim plays the match with the player slot on the bot brain up to a round, the
// cast below is placed for the frame, and the real sim runs the moment. Not part of the judged game/.
import { DT } from './src/sim/config.js';
import { giveWeapon, eyeOf } from './src/sim/actors.js';
import { createBrain, think } from './src/sim/bots.js';
import { yawTo } from './src/sim/util.js';

// cast: [who, col, row, faces col, faces row, gun]; who: p player, m0.. teammates, f0.. opponents.
// fire: opponents already engaging the player [who, reaction s]; shoot: tick the player opens fire.
// side: the side the player must be on (0 attack, 1 defend); core: 'carry' (arming) or 'armed' (disarming).
const B_SITE = [['m0', 12, 13, 12, 18, 'ballast'], ['m1', 13, 8, 10, 6, 'skiff'], ['f0', 10, 6, 8, 13, 'ballast']];
const PLANT = { side: 0, round: 2, clock: 92, core: 'carry', ticks: 110, look: [-0.15, -0.36], cast: [['p', 8, 13, 10, 7, 'ballast'], ...B_SITE] };
const SCENES = {
  1: { round: 5, clock: 95, ticks: 24, shoot: 12, fire: [['f0', 0.3], ['f1', 0.25]],
    cast: [['p', 24, 30, 25, 27, 'ballast'], ['f0', 25, 27, 24, 30, 'ballast'], ['f1', 31, 24, 24, 30, 'skiff']] },
  2: { round: 7, ticks: 20, buy: true, look: [0.12, -0.03],
    cast: [['p', 28, 5, 28, 15], ['m0', 24, 4, 26, 9, 'ballast'], ['m1', 31, 2, 28, 8, 'skiff'], ['f0', 28, 16, 28, 9, 'ballast']] },
  3: PLANT,
  4: { side: 1, round: 6, clock: 95, core: 'armed', ticks: 240, end: true, look: [-0.15, -0.36], cast: [['p', 8, 13, 10, 7, 'ballast'], ...B_SITE, ['f1', 4, 8, 8, 13, 'skiff']] },
};

function run(ctx, n, script, drawn = 3) { // n ticks; only the last `drawn` are rendered (effects in flight)
  for (let i = 0; i < n; i++) {
    ctx.input.fill(ctx.state.player.cmd);
    script(i);
    ctx.step(ctx.state);
    if (i >= n - drawn) ctx.view.render(1, DT, ctx.input.look);
  }
}

function autopilot(ctx, done) {
  const { state } = ctx, p = state.player;
  p.isBot = true;
  for (let i = 0; i < 60 * 60 * 40 && !done(state); i++) { if (p.alive) think(state, p); ctx.step(state); }
  p.isBot = false;
  ctx.view.render(1, 1, ctx.input.look); // consume the fast-forward's events: the scene starts clean
}

function place(state, a, c, r, fc, fr, gun) {
  const S = state.map.cell;
  a.alive = true; a.hp = 100;
  a.pos.x = a.prev.x = (c + 0.5) * S; a.pos.z = a.prev.z = (r + 0.5) * S; a.pos.y = a.prev.y = state.map.height[r * state.map.w + c];
  a.vel.x = a.vel.z = a.pitch = a.cmd.pitch = 0;
  a.yaw = a.prevYaw = a.cmd.yaw = yawTo(c, r, fc, fr);
  if (gun) giveWeapon(a, gun);
  a.drawTimer = 0;
  if (a.brain) Object.assign(a.brain, { plan: 'hold', holdX: a.pos.x, holdZ: a.pos.z, lookX: (fc + 0.5) * S, lookZ: (fr + 0.5) * S, target: -1 });
}

function stage(ctx, sc) {
  const { state } = ctx, p = state.player, mySide = state.teams[p.team].side;
  autopilot(ctx, (s) => s.round.number >= sc.round && s.teams[p.team].side === (sc.side ?? s.teams[p.team].side) && s.round.phase === 'live' && s.round.clock < (sc.clock ?? 999));
  const team = (side) => state.actors.filter((a) => a !== p && state.teams[a.team].side === side);
  const mates = team(mySide), foes = team(1 - mySide), who = (k) => (k === 'p' ? p : (k[0] === 'm' ? mates : foes)[+k[1]]);
  // Everyone not cast waits in their own spawn, out of sight.
  [...mates, ...foes].forEach((a, i) => { const s = state.map.spawns[state.teams[a.team].side][i % 5]; place(state, a, s.c, s.r, 27, 20); });
  for (const [k, c, r, fc, fr, gun] of sc.cast) place(state, who(k), c, r, fc, fr, gun);
  Object.assign(p.grenades, { frag: 1, smoke: 1 });
  p.armor = 100; p.helm = true; p.money = Math.max(p.money, 3150);
  if (sc.core) { // a teammate's smoke sits in front of Hall Gate; a Saltreeve behind it cannot see out
    if (sc.core === 'carry') Object.assign(state.core, { state: 'carried', carrier: p.id });
    else Object.assign(state.core, { state: 'planted', site: 'B', fuse: 30, carrier: -1, x: p.pos.x - Math.sin(p.yaw) * 1.2, y: 0, z: p.pos.z - Math.cos(p.yaw) * 1.2 });
    state.round.planted = sc.core === 'armed';
    p.kit = true;
    Object.assign(state.smokes[0], { live: true, x: 10.5 * state.map.cell, y: 0, z: 7.8 * state.map.cell, age: 2 });
  }
  for (const [k, react] of sc.fire ?? []) Object.assign(who(k).brain, { target: p.id, reactTimer: react, errYaw: 0.02, errPitch: 0.01, aimHead: false, lastSeenId: p.id, lastSeenTime: 1e9 });
  const f = who(sc.cast[1][0]), ey = p.pos.y + eyeOf(p);
  if (sc.fire) ctx.input.face(yawTo(p.pos.x, p.pos.z, f.pos.x, f.pos.z) + 0.02, Math.atan2(f.pos.y + 1.25 - ey, Math.hypot(f.pos.x - p.pos.x, f.pos.z - p.pos.z)));
  else ctx.input.face(p.yaw + sc.look[0], sc.look[1]);
  run(ctx, sc.ticks, (i) => { p.cmd.fire = i >= (sc.shoot ?? 1e9); p.cmd.use = !!sc.core; }, sc.end ? 0 : 3);
  if (sc.end) { // the same round played out: banner, scores, the camera up over the site
    autopilot(ctx, (s) => s.round.phase === 'over' && s.time - s.round.endedAt > 2.2);
    ctx.hud.showBoard(true);
    run(ctx, 2, () => {});
  }
  if (sc.buy) ctx.hud.toggleBuy(true);
}

const ctx = window.__brineworks, name = new URLSearchParams(location.search).get('shot');
document.getElementById('overlay').hidden = true;
ctx.state.player.brain = createBrain(0.7, 'entry');
stage(ctx, SCENES[name] ?? SCENES[1]);
ctx.hud.update();
requestAnimationFrame(() => { ctx.hud.update(); window.__shotReady = true; });
