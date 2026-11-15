// Automated play test in headless Chromium (software WebGL). Drives the real game through the
// ?test hook: movement (acceleration, crouch, jump, wall collision), firing, magazine, reload,
// then lets bots play several rounds in real time and fast-forward, failing on console errors.
// usage: tools/playtest.sh [seed]
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/agent/makefun-tools/node_modules/')('playwright');
const seed = process.argv[2] ?? '3';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`http://127.0.0.1:${process.env.PORT ?? 8792}/index.html?test&seed=${seed}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__brineworks, null, { timeout: 30000 });
await page.evaluate(() => { document.getElementById('overlay').hidden = true; window.__brineworks.run(true); });
await page.waitForTimeout(1500);

const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); };

const r = await page.evaluate(() => {
  const { state, step, run } = window.__brineworks;
  run(false);
  const p = state.player, cmd = p.cmd;
  const out = {};
  const tick = (n, set) => { for (let i = 0; i < n; i++) { if (set) set(cmd); step(state); } };
  const idle = (c) => { c.moveX = c.moveZ = 0; c.fire = c.jump = c.reload = c.crouch = c.walk = false; c.slot = -1; };
  while (state.round.phase !== 'live') tick(1, idle);
  out.phase = state.round.phase;
  // acceleration: speed after 3 ticks is well below top speed, after 40 ticks near it
  const start = { x: p.pos.x, z: p.pos.z };
  tick(3, (c) => { idle(c); c.moveZ = 1; });
  out.speed3 = Math.hypot(p.vel.x, p.vel.z);
  tick(37, (c) => { idle(c); c.moveZ = 1; });
  out.speed40 = Math.hypot(p.vel.x, p.vel.z);
  tick(30, idle);
  out.speedStop = Math.hypot(p.vel.x, p.vel.z);
  out.moved = Math.hypot(p.pos.x - start.x, p.pos.z - start.z);
  // crouch
  tick(30, (c) => { idle(c); c.crouch = true; });
  out.crouch = p.crouch;
  tick(30, idle);
  // jump
  tick(1, (c) => { idle(c); c.jump = true; });
  let peak = 0;
  for (let i = 0; i < 60; i++) { tick(1, idle); peak = Math.max(peak, p.pos.y); }
  out.jumpPeak = peak;
  // collision: run west into the spawn wall for 4 s; must stay inside walkable cells
  tick(240, (c) => { idle(c); c.yaw = Math.PI / 2; c.moveZ = 1; });
  const cell = Math.floor(p.pos.z / state.map.cell) * state.map.w + Math.floor(p.pos.x / state.map.cell);
  out.insideWall = state.map.height[cell] > 1.3;
  // firing: semi-auto pistol empties its magazine, dry fire triggers reload, reload refills
  const w = p.slots[p.active];
  out.weapon = w.id;
  const mag0 = w.mag, res0 = w.reserve;
  for (let i = 0; i < mag0; i++) { tick(1, (c) => { idle(c); c.fire = true; }); tick(14, idle); }
  out.magAfter = w.mag;
  tick(1, (c) => { idle(c); c.fire = true; }); // dry fire starts the reload
  out.reloading = p.reloadTimer > 0;
  tick(200, idle);
  out.mag0 = mag0; out.magReloaded = w.mag; out.res0 = res0; out.resAfter = w.reserve;
  out.punchAfterRest = p.punchPitch;
  return out;
});
check('round goes live', r.phase === 'live');
check('acceleration ramps', r.speed3 < 2.5 && r.speed40 > 4.5, `${r.speed3.toFixed(2)} -> ${r.speed40.toFixed(2)}`);
check('friction stops', r.speedStop < 0.05, r.speedStop.toFixed(3));
check('crouch', r.crouch > 0.99);
check('jump', r.jumpPeak > 0.9 && r.jumpPeak < 1.4, r.jumpPeak.toFixed(2));
check('wall collision', !r.insideWall);
check('magazine empties, dry fire reloads', r.magAfter === 0 && r.reloading, `mag ${r.magAfter}`);
check('reload refills from reserve', r.magReloaded === r.mag0 && r.resAfter < r.res0, `${r.magReloaded}/${r.resAfter} from ${r.mag0}/${r.res0}`);
check('recoil recovers', Math.abs(r.punchAfterRest) < 0.005, r.punchAfterRest.toFixed(4));

// Real-time play with rendering, then fast-forward the sim, then render again.
await page.evaluate(() => window.__brineworks.run(true));
await page.waitForTimeout(6000);
const mid = await page.evaluate(() => {
  const { state, step, run } = window.__brineworks;
  run(false);
  const before = state.round.number;
  let roundsEnded = 0, matches = 0, last = state.round.phase, travel = 0;
  for (let i = 0; i < 60 * 60 * 8; i++) {
    step(state);
    for (const a of state.actors) if (a.isBot && a.alive) travel += Math.hypot(a.pos.x - a.prev.x, a.pos.z - a.prev.z);
    if (state.round.phase !== last) { last = state.round.phase; if (last === 'over') roundsEnded++; if (last === 'matchover') matches++; }
  }
  run(true);
  return { moved: Math.round(travel / 8), roundsEnded, matches, before, after: state.round.number, scores: state.teams.map((t) => t.score), kills: state.actors.reduce((n, a) => n + a.kills, 0), phase: state.round.phase, clock: state.round.clock, core: state.core.state, fuse: state.core.fuse, site: state.core.site };
});
await page.waitForTimeout(4000);
check('bots move', mid.moved >= 200, `bots travel ${mid.moved} m per minute`);
check('rounds end and restart', mid.roundsEnded >= 3, JSON.stringify(mid));
check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await page.screenshot({ path: '/home/agent/makefun/fps2/tools/playtest.jpg', type: 'jpeg', quality: 70 });
await browser.close();
let failed = 0;
for (const c of checks) { console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail}`); if (!c.ok) failed++; }
process.exit(failed ? 1 : 0);
