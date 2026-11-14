// The HUD: plain DOM over the canvas, written only when a value changes (cached per key).
// Health, armour, money, ammo and grenades, the round clock (the core's fuse once armed), score
// with alive pips, the Fuse Core status and arm/disarm progress, kill feed, a crosshair drawn from
// the weapon's real spread cone, hit marker, damage direction, scope, banners, buy menu, scores.
import { TEAMS, WEAPONS, WEAPON_ORDER, GRENADES, SIDE, ROUND } from '../sim/config.js';
import { SHOP, itemDef, canBuy } from '../sim/economy.js';
import { spreadOf } from '../sim/weapons.js';
import { drain, EV } from '../sim/events.js';
import { createRadar } from './radar.js';

const $ = (id) => document.getElementById(id);
const FEED_SIZE = 5;
const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const REASONS = { eliminated: 'eliminated', time: 'Time ran out', detonated: 'The Fuse Core detonated', defused: 'The Fuse Core was disarmed' };

export function createHud(state, camera) {
  const el = {};
  for (const id of ['hp', 'armor', 'money', 'mag', 'reserve', 'weapon', 'nades', 'clock', 'score0', 'score1', 'name0', 'name1',
    'side0', 'side1', 'pips0', 'pips1', 'crosshair', 'hitmarker', 'damage', 'banner', 'banner-title', 'banner-sub', 'feed',
    'buy', 'buy-list', 'buy-money', 'board', 'board-body', 'hint', 'spectate', 'objective', 'progress', 'scope']) el[id] = $(id);
  const cache = new Map();
  const set = (node, key, value) => { if (cache.get(key) !== value) { cache.set(key, value); node.textContent = value; } };
  const style = (node, key, prop, value) => { if (cache.get(key) !== value) { cache.set(key, value); node.style.setProperty(prop, value); } };
  const toggle = (node, key, cls, on) => { if (cache.get(key) !== on) { cache.set(key, on); node.classList.toggle(cls, on); } };

  // Fixed DOM, built once: alive pips, kill feed rows, buy rows, scoreboard rows.
  const pips = [el.pips0, el.pips1].map((box) => Array.from({ length: 5 }, () => box.appendChild(document.createElement('i'))));
  const feedRows = Array.from({ length: FEED_SIZE }, () => el.feed.appendChild(document.createElement('li')));
  const feed = Array.from({ length: FEED_SIZE }, () => ({ time: -99, mine: false, killerTeam: 0, victimTeam: 0, killer: '', victim: '', weapon: '', head: false }));
  let feedHead = 0;
  const buyRows = SHOP.map((item) => {
    const li = el['buy-list'].appendChild(document.createElement('li'));
    li.innerHTML = `<kbd>${item.key}</kbd><span>${itemDef(item).name}</span><b>$${itemDef(item).price}</b>`;
    return li;
  });
  const boardRows = state.actors.map(() => el['board-body'].appendChild(document.createElement('tr')));
  for (const t of [0, 1]) { el[`name${t}`].textContent = TEAMS[t].name; el[`name${t}`].style.color = TEAMS[t].css; }
  const radar = createRadar(state, $('radar'));

  let cursor = state.events.head;
  let hitTime = -99, hurtTime = -99, hurtAngle = 0, killTime = -99;
  let buyOpen = false, boardOpen = false;

  function onEvent(e) {
    const p = state.player;
    if (e.type === EV.HIT) {
      if (e.a === p.id && e.b !== p.id) { hitTime = state.time; el.hitmarker.classList.toggle('head', e.w === 1); }
      if (e.b === p.id) { hurtTime = state.time; hurtAngle = Math.atan2(-(e.x - p.pos.x), -(e.z - p.pos.z)); }
    } else if (e.type === EV.KILL) {
      const k = e.a >= 0 ? state.actors[e.a] : null, v = state.actors[e.b];
      const row = feed[feedHead];
      feedHead = (feedHead + 1) % FEED_SIZE;
      row.time = state.time;
      row.killer = k ? k.name : ''; row.victim = v.name;
      row.killerTeam = k ? k.team : v.team; row.victimTeam = v.team;
      row.weapon = e.v === GRENADES.frag.index ? GRENADES.frag.name : e.v >= 0 ? WEAPONS[WEAPON_ORDER[e.v]].name : 'Fuse Core';
      row.head = e.w === 1;
      row.mine = (k && k.id === p.id) || v.id === p.id;
      if (k && k.id === p.id) killTime = state.time;
      drawFeed();
    }
  }

  function drawFeed() {
    for (let i = 0; i < FEED_SIZE; i++) {
      const row = feed[(feedHead - 1 - i + FEED_SIZE * 2) % FEED_SIZE];
      const li = feedRows[i];
      if (row.time < 0) continue;
      li.className = row.mine ? 'mine' : '';
      li.innerHTML = `<b style="color:${TEAMS[row.killerTeam].css}">${row.killer}</b> <em>${row.weapon}${row.head ? ' &#x2299;' : ''}</em> <b style="color:${TEAMS[row.victimTeam].css}">${row.victim}</b>`;
    }
  }

  function update() {
    cursor = drain(state.events, cursor, onEvent);
    const p = state.player, round = state.round, core = state.core;
    const w = p.slots[p.active];
    set(el.hp, 'hp', String(Math.max(0, p.hp)));
    toggle(el.hp.parentNode, 'lowhp', 'low', p.hp <= 25);
    set(el.armor, 'armor', String(Math.round(p.armor)));
    set(el.money, 'money', `$${p.money}`);
    if (w) {
      set(el.mag, 'mag', String(w.mag));
      set(el.reserve, 'res', `/ ${w.reserve}`);
      set(el.weapon, 'wpn', p.reloadTimer > 0 ? `${WEAPONS[w.id].name}  reloading` : WEAPONS[w.id].name);
      toggle(el.mag.parentNode, 'empty', 'empty', w.mag === 0);
    }
    set(el.nades, 'nades', `G frag ${p.grenades.frag}   F smoke ${p.grenades.smoke}`);

    // Clock: freeze countdown, round clock, or the armed core's fuse.
    const armed = core.state === 'planted';
    const secs = Math.max(0, Math.ceil(round.phase === 'freeze' ? round.timer : armed ? core.fuse : round.clock));
    set(el.clock, 'clock', clockText(secs));
    toggle(el.clock, 'freeze', 'freeze', round.phase === 'freeze');
    toggle(el.clock, 'urgent', 'urgent', armed || (round.phase === 'live' && round.clock < 15));
    for (const t of [0, 1]) {
      set(el[`score${t}`], `score${t}`, String(state.teams[t].score));
      set(el[`side${t}`], `side${t}`, state.teams[t].side === SIDE.ATTACK ? 'ATTACK' : 'DEFEND');
    }
    let n0 = 0, n1 = 0;
    for (const a of state.actors) toggle(pips[a.team][a.team === 0 ? n0++ : n1++], `pip${a.id}`, 'dead', !a.alive);

    // Crosshair gap = the live spread cone projected to pixels.
    if (w && p.alive) {
      const px = Math.tan(spreadOf(p, WEAPONS[w.id])) / Math.tan((camera.fov * Math.PI) / 360) * (window.innerHeight / 2);
      style(el.crosshair, 'gap', '--gap', `${Math.round(Math.min(80, 3 + px))}px`);
    }
    toggle(el.crosshair, 'xhide', 'hidden', !p.alive || p.scoped);
    toggle(el.scope, 'scope', 'on', p.alive && p.scoped);
    toggle(el.hitmarker, 'hiton', 'on', state.time - hitTime < 0.12);
    toggle(el.hitmarker, 'killon', 'kill', state.time - killTime < 0.35);
    const hurt = Math.max(0, 1 - (state.time - hurtTime) / 0.9);
    style(el.damage, 'hurt', 'opacity', hurt.toFixed(2));
    if (hurt > 0) style(el.damage, 'hurtA', '--angle', `${(((p.yaw - hurtAngle) * 180) / Math.PI).toFixed(0)}deg`);

    objective(p, core);
    banner(round);
    set(el.spectate, 'spec', p.alive || round.phase === 'freeze' ? '' : 'You are down: watching your team');
    set(el.hint, 'hint', round.buyOpen && p.alive && !buyOpen ? 'B  requisition' : '');

    if (buyOpen && !round.buyOpen) toggleBuy(false);
    if (buyOpen) {
      set(el['buy-money'], 'buyMoney', `$${p.money}`);
      for (let i = 0; i < SHOP.length; i++) toggle(buyRows[i], `buy${i}`, 'off', !canBuy(state, p, SHOP[i]));
    }
    if (boardOpen || round.phase === 'matchover') drawBoard();
    toggle(el.board, 'boardon', 'open', boardOpen || round.phase === 'matchover');
    radar.draw();
  }

  // One line on the Fuse Core for the player's side, plus the arm/disarm progress bar.
  function objective(p, core) {
    const attacking = state.teams[p.team].side === SIDE.ATTACK;
    let text = '';
    if (core.state === 'planted') text = attacking ? `Core armed at ${core.site}: hold the site` : `Core armed at ${core.site}: hold E on it to disarm`;
    else if (core.state === 'carried' && core.carrier === p.id) text = 'You carry the Fuse Core: hold E on site A or B to arm it';
    else if (core.state === 'dropped') text = attacking ? 'Fuse Core dropped: pick it up' : 'They dropped the Fuse Core';
    else if (core.state === 'carried' && attacking) text = `${state.actors[core.carrier].name} carries the Fuse Core`;
    set(el.objective, 'obj', state.round.phase === 'live' && p.alive ? text : '');
    const working = core.worker === p.id && core.progress > 0;
    toggle(el.progress, 'prog', 'on', working);
    if (working) style(el.progress, 'progv', '--p', `${(core.progress * 100).toFixed(0)}%`);
  }

  function banner(round) {
    let title = '', sub = '';
    const p = state.player;
    const attacking = state.teams[p.team].side === SIDE.ATTACK;
    if (round.phase === 'freeze') {
      title = `Round ${round.number}`;
      sub = attacking ? 'Attack: arm the Fuse Core on site A or B' : 'Defend: keep the Fuse Core off both sites';
      if (round.number === ROUND.half + 1) sub = `Sides switched. ${sub}`;
    } else if (round.phase === 'over' || round.phase === 'matchover') {
      const won = round.winner === p.team;
      if (round.phase === 'matchover') {
        title = state.match.winner === p.team ? 'Match won' : 'Match lost';
        sub = `${state.teams[0].score} - ${state.teams[1].score}. A new match starts shortly.`;
      } else {
        title = `${TEAMS[round.winner].name} take the round`;
        const why = round.reason === 'eliminated' ? `${TEAMS[1 - round.winner].name} eliminated` : REASONS[round.reason];
        sub = `${why}   +$${state.teams[p.team].lastPay}`;
      }
      toggle(el.banner, 'bannerwin', 'win', won);
    }
    set(el['banner-title'], 'bt', title);
    set(el['banner-sub'], 'bs', sub);
    toggle(el.banner, 'banneron', 'on', title !== '');
  }

  function drawBoard() {
    for (const a of state.actors) {
      const html = `<td style="color:${TEAMS[a.team].css}">${a.name}</td><td>${a.alive ? '' : 'down'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>`;
      if (cache.get(boardRows[a.id]) !== html) { cache.set(boardRows[a.id], html); boardRows[a.id].innerHTML = html; }
    }
  }

  function toggleBuy(open) {
    buyOpen = (open ?? !buyOpen) && state.round.buyOpen;
    el.buy.classList.toggle('open', buyOpen);
  }

  return { update, toggleBuy, isBuyOpen: () => buyOpen, showBoard: (on) => { boardOpen = on; } };
}
