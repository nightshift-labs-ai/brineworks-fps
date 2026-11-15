// Screenshot staging for ?shot=N&seed=S. tools/shoot.mjs injects this file into the game page as a module
// (imports resolve from game/index.html), so it drives the same module instances as the game through
// window.__brineworks: the sim plays the match with the player slot on the bot brain up to the scene's
// round, the cast below is placed for the frame, and the real sim runs the moment (bots think, guns fire,
// the HUD and view read the events as in play). Not part of the judged game/.
import { DT, WEAPONS } from './src/sim/config.js';
import { giveWeapon, eyeOf, heightOf } from './src/sim/actors.js';
import { createBrain, think } from './src/sim/bots.js';
import { yawTo } from './src/sim/util.js';
import { EV, emit } from './src/sim/events.js';
import { radio } from './src/sim/coach.js';

// cast: [who, col, row, faces col, faces row, gun]; who: p player, m0.. teammates, f0.. opponents.
// side: the player's side (0 attack, 1 defend); phase: 'freeze' stages in buy time, else live with clock < clock.
// fire: opponents already engaging the player [who, reaction s, aim low]. script(i, s): per tick, s = { ctx, p, who, aim }.
// radio: the two team-radio lines of the scene, [who, text], each one the game itself says in such a round
// (bots.js / coach.js wording); everyone else is silent for the scene, and older lines are cleared.
const SCENES = {
  // Conveyor Court: crouched by the low wall, the player drops one Saltreeve with a headshot, then trades
  // with a second one 7 m out against the lit west wall (his muzzle flash, our hit marker).
  1: { side: 0, round: 5, clock: 91, ticks: 36, core: 'mate', hide: ['damage'],
    cast: [['p', 32, 26, 28, 25, 'hawser'], ['f0', 28, 24, 32, 26, 'hawser'], ['f1', 29, 25, 32, 26, 'cleat']],
    fire: [['f1', 0.55, -0.1]], // his first shot lands in the drawn frames, low: the player survives the trade
    radio: [['m1', 'gunfire at Conveyor Court'], ['m0', 'go B now']], // heard from the cut; the coach's call
    script(i, s) {
      s.p.cmd.crouch = true;
      if (i === 11) s.aim('f0', 'head');
      if (i >= 20) s.aim('f1', 'waist'); // low on the torso: the marker clears his muzzle flash
      s.p.cmd.fire = i === 12 || i === 31;
    } },
  // Buy time in the defenders' yard, the low sun across the cladding, teammates armed differently.
  2: { side: 1, round: 7, phase: 'freeze', ticks: 12, buy: true, money: 2350, bare: true,
    cast: [['p', 25, 1, 27, 8], ['m0', 25, 5, 24, 12, 'skiff'], ['m1', 29, 5, 28, 9, 'bollard'], ['m2', 27, 7, 27, 12, 'hawser']],
    script(i, s) { s.aim(null, 0.05, 27.5, 8); } },
  // Arming on B: a teammate arms the Fuse Core on the pad while the player covers from behind; the smoke
  // closes Boiler Gate 12 m out, a Saltreeve works round its edge, Skerry has him spotted.
  3: { side: 0, round: 4, clock: 97, core: 'm0', hide: ['hint'], ticks: 40, smoke: [10.5, 6.6],
    cast: [['p', 7, 17, 9, 8, 'hawser'], ['m0', 9, 11, 12, 11, 'hawser'], ['m1', 11, 12, 12, 8, 'skiff'], ['f0', 12, 8, 8, 13, 'hawser']],
    radio: [['m1', 'footsteps at Boiler Gate'], ['m1', 'contact, Boiler Gate']],
    fire: [['f0', 4]], // the smoke's edge hides him: no clear shot either way inside the scene (any clear line
    // past the cloud picks the arming Carrick, the nearest target, and ends the arm)
    script(i, s) { s.aim(null, -0.14, 9, 9); } },
  // A retake of A won by a teammate's disarm with the kit, 2.7 m ahead, looking south down the lane past the
  // pad over two downed Saltreeves: the window turns teal, the banner names the disarm; the match goes on.
  4: { side: 1, round: 7, clock: 95, core: 'armed', site: 'A', ticks: 234, end: 0.017, dead: ['f0', 'f1'],
    cast: [['p', 48, 8, 48, 20, 'hawser'], ['m0', 49.6, 10.7, 48.9, 10.3, 'hawser'], ['m1', 46, 15, 47, 20, 'skiff'], ['f0', 47, 13, 51, 13, 'hawser'], ['f1', 46.3, 12.6, 51, 12.6, 'skiff']],
    radio: [['m0', 'they are on A, rotate']], // the first living bot calls it (coach.js firstBot); Ozzy (m0) says 'disarming, cover me' himself
    script(i, s) { s.aim(null, -0.28, 48, 20); } },
};

function run(ctx, n, script, drawn = 3, cast = null) { // n ticks; only the last `drawn` are rendered (effects in flight)
  for (let i = 0; i < n; i++) {
    ctx.input.fill(ctx.state.player.cmd);
    script(i);
    ctx.step(ctx.state);
    // Only the cast's shots draw tracers: stray fire elsewhere on the map would cross the frame as lines.
    if (cast) for (const e of ctx.state.events.list) if (e.type === EV.SHOT && !cast.has(ctx.state.actors[e.a])) e.type = 0;
    if (i >= n - drawn) ctx.view.render(1, DT, ctx.input.look);
  }
}

function autopilot(ctx, done) {
  const { state } = ctx, p = state.player;
  p.isBot = true;
  for (let i = 0; i < 60 * 60 * 40 && !done(state); i++) { if (p.alive) think(state, p); ctx.step(state); }
  p.isBot = false;
  ctx.view.render(1, 1, ctx.input.look); // consume the fast-forward's events: the scene starts clean
  ctx.view.render(1, 1, ctx.input.look); // and settle the gun's sway from the jump in look
}

function place(state, a, c, r, fc, fr, gun) {
  const S = state.map.cell;
  a.alive = true; a.hp = 100;
  a.pos.x = a.prev.x = (c + 0.5) * S; a.pos.z = a.prev.z = (r + 0.5) * S; a.pos.y = a.prev.y = state.map.height[Math.floor(r) * state.map.w + Math.floor(c)];
  a.vel.x = a.vel.z = a.pitch = a.cmd.pitch = 0;
  a.yaw = a.prevYaw = a.cmd.yaw = yawTo(c, r, fc, fr);
  if (gun) giveWeapon(a, gun);
  a.drawTimer = 0;
  if (a.brain) Object.assign(a.brain, { plan: 'hold', holdX: a.pos.x, holdZ: a.pos.z, lookX: (fc + 0.5) * S, lookZ: (fr + 0.5) * S, target: -1 });
}

function stage(ctx, sc) {
  const { state } = ctx, p = state.player, S = state.map.cell;
  autopilot(ctx, (s) => s.round.number >= sc.round && s.teams[p.team].side === sc.side && p.alive
    && (sc.phase === 'freeze' ? s.round.phase === 'freeze' : s.round.phase === 'live' && s.round.clock < sc.clock));
  // The cast comes from the living; the round's dead stay down where they fell, so pips and kill feed agree.
  // A scene's bodies (sc.dead) are opponents already down when there are any.
  // The fast-forward ran the player on a bot brain, so an attack plan split five: coach.js prints (n+1)>>1 and
  // n>>1 for n bots off the lurk, so with the four bots of play the second count is one lower.
  const plan = state.teams[p.team].plan;
  plan.text = plan.text.replace(/^(plan: \w, \d via [^,]+, )(\d)/, (_, a, n) => a + (n - 1));
  // A defence setup names five slots; with four bots the coach fills the first four (the fifth of each SETUPS
  // entry is the site with three, else B).
  const d = plan.text.match(/^setup: (\d) A, 1 tower, (\d) B$/);
  if (d) plan.text = `setup: ${d[1] - (d[1] === '3')} A, 1 tower, ${d[2] - (d[1] !== '3')} B`;
  const mySide = state.teams[p.team].side, side = (sd, alive) => state.actors.filter((a) => a !== p && a.alive === alive && state.teams[a.team].side === sd);
  const mates = side(mySide, true), foes = side(1 - mySide, true), fallen = side(1 - mySide, false), downBefore = new Set(fallen), picked = {};
  const who = (k) => (k === 'p' ? p : (picked[k] ??= k[0] === 'm' ? mates[+k[1]] : (sc.dead?.includes(k) && fallen.shift()) || foes[+k[1]]));
  const cast = new Set(sc.cast.map(([k]) => who(k)));
  // The living not cast wait in their own spawn, out of sight.
  [...mates, ...foes].forEach((a, i) => { const s = state.map.spawns[state.teams[a.team].side][i % 5]; if (!cast.has(a)) place(state, a, s.c, s.r, s.c, s.r + (state.teams[a.team].side ? -20 : 20)); }); // facing away from the map
  for (const [k, c, r, fc, fr, gun] of sc.cast) place(state, who(k), c, r, fc, fr, gun);
  if (sc.bare) Object.assign(p, { armor: 0, helm: false, kit: false }), Object.assign(p.grenades, { frag: 0, smoke: 0 });
  else { Object.assign(p.grenades, { frag: 1, smoke: 1 }); p.armor = 100; p.helm = true; p.kit = mySide === 1; } // the kit is the defenders'
  p.money = sc.money ?? Math.max(p.money, 3150); // exact when the scene sets it
  p.hp = sc.hp ?? 100;
  if (sc.core === 'carry' || sc.core === 'mate') Object.assign(state.core, { state: 'carried', carrier: (sc.core === 'mate' && mates.find((m) => !m.brain.lurk) || p).id }); // the lurker never carries
  if (sc.core === 'm0') Object.assign(state.core, { state: 'carried', carrier: who('m0').id, worker: who('m0').id, progress: 0.62 }); // mid-arm
  if (sc.core === 'armed') { // 2.7 m in front of the player, 0.6 m left, m0 most of the way through the disarm
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), m0 = who('m0');
    Object.assign(state.core, { state: 'planted', site: sc.site ?? 'B', fuse: 25, carrier: -1, y: 0, worker: m0.id, progress: 0.62 });
    state.core.x = p.pos.x + fx * 2.7 + fz * 0.6; state.core.z = p.pos.z + fz * 2.7 - fx * 0.6;
    m0.kit = true;
  }
  state.round.planted = sc.core === 'armed';
  if (sc.smoke) Object.assign(state.smokes[0], { live: true, x: sc.smoke[0] * S, y: 0, z: sc.smoke[1] * S, age: 2 });
  for (const k of sc.dead ?? []) { // bodies of an earlier fight; one still alive a moment ago gets his kill row
    const a = who(k), m = who('m1') ?? p;
    if (!downBefore.has(a)) emit(state.events, EV.KILL, m.id, a.id, WEAPONS[m.slots[m.active].id].index, 0).t = state.time;
    Object.assign(a, { alive: false, hp: 0, diedAt: -99 });
  }
  for (const a of [...mates, ...foes]) Object.assign(a.brain, { atHold: true, calledAt: 1e9 }); // silent: no arrival or contact calls
  for (const e of state.events.list) if (e.type === EV.RADIO) e.type = 0; // older lines (and the autopilot player's)
  const roundStart = Math.max(...state.events.list.filter((e) => e.type === EV.ROUND && !e.v).map((e) => e.t));
  for (const e of state.events.list) if (e.type === EV.KILL && e.t >= roundStart) e.t = state.time; // this round's kills stay in the feed (rows expire after 10 s)
  for (const [k, text] of sc.radio ?? []) radio(state, who(k), text);
  for (const [k, react, low = 0.01] of sc.fire ?? []) Object.assign(who(k).brain, { target: p.id, reactTimer: react, errYaw: 0.02, errPitch: low, aimHead: false, crouchSpray: false, lastSeenId: p.id, lastSeenTime: 1e9 });
  // Look at an actor's head, chest or waist, or (k null) at pitch `part` toward cell (c, r).
  const aim = (k, part, c, r) => {
    const ey = p.pos.y + eyeOf(p);
    if (!k) return ctx.input.face(yawTo(p.pos.x, p.pos.z, (c + 0.5) * S, (r + 0.5) * S), part);
    const a = who(k), y = a.pos.y + (part === 'head' ? heightOf(a) - 0.17 : heightOf(a) * (part === 'waist' ? 0.55 : 0.62));
    ctx.input.face(yawTo(p.pos.x, p.pos.z, a.pos.x, a.pos.z), Math.atan2(y - ey, Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z)));
  };
  const s = { ctx, p, who, aim };
  run(ctx, sc.ticks, (i) => sc.script(i, s), sc.end === undefined ? 3 : 0, new Set(sc.cast.map(([k]) => who(k))));
  if (sc.end !== undefined) { // the round played out to its end, captured `end` s after the banner
    autopilot(ctx, (st) => st.round.phase !== 'live');
    run(ctx, Math.round(sc.end / DT), () => {});
  }
  // The feed shows this round's newest four kills; anyone who died earlier this round (out of the frame) is back
  // at spawn for the HUD, so every dark pip has its row.
  const ev = state.events, kills = [];
  for (let i = Math.max(0, ev.head - ev.list.length); i < ev.head; i++) { const e = ev.list[i % ev.list.length]; if (e.type === EV.KILL && e.t >= roundStart) kills.push(e.b); }
  const listed = new Set(kills.slice(-4));
  for (const a of state.actors) if (!a.alive && a.diedAt >= roundStart && !listed.has(a.id)) Object.assign(a, { alive: true, hp: 100 });
  if (sc.buy) ctx.hud.toggleBuy(true);
  for (const id of sc.hide ?? []) document.getElementById(id).hidden = true; // the cover's wedge reads as a scoreboard tab; shot 3's buy hint as site B
}

const ctx = window.__brineworks, name = new URLSearchParams(location.search).get('shot');
document.getElementById('overlay').hidden = true;
ctx.state.player.brain = createBrain(0.7, 'entry');
stage(ctx, SCENES[name] ?? SCENES[1]);
ctx.hud.update();
requestAnimationFrame(() => { ctx.hud.update(); window.__shotReady = true; });
