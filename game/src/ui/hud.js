// The HUD: plain DOM over the canvas, each element written only by this module and only when its
// value changes (cached per key). Health, armour, money, ammo, grenades and kit, the round clock (the
// core's fuse once armed), score, alive pips, round history, the Fuse Core line and arm/disarm bar,
// kill feed, team radio, location, a crosshair drawn from the weapon's live spread cone, hit marker,
// damage direction, scope, banners with the money earned, the buy menu and the scoreboard.
import { TEAMS, WEAPONS, WEAPON_ORDER, GRENADES, SIDE, ROUND } from '../sim/config.js';
import { SHOP, itemDef, canBuy, lossPay } from '../sim/economy.js';
import { spreadOf } from '../sim/weapons.js';
import { placeName } from '../sim/map.js';
import { drain, EV } from '../sim/events.js';
import { createRadar } from './radar.js';

const $ = (id) => document.getElementById(id);
const ROWS = 5;
const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const PHASES = ['live', 'freeze', 'over', 'matchover'];
const CORE_STATES = ['carried', 'dropped', 'planted', 'defused', 'detonated'];
const REASONS = { time: 'Time ran out', detonated: 'The Fuse Core detonated', defused: 'The Fuse Core was disarmed' };

export function createHud(state, camera) {
  const el = {};
  for (const id of ['hud', 'hp', 'armor', 'armor-label', 'money', 'mag', 'reserve', 'weapon', 'frag', 'smoke', 'spanner', 'clock', 'round',
    'crosshair', 'hitmarker', 'damage', 'banner', 'banner-title', 'banner-sub', 'feed', 'radio', 'where', 'buy', 'buy-list', 'buy-money',
    'buy-foot', 'board', 'board-body', 'hint', 'spectate', 'objective', 'progress', 'progress-label', 'scope']) el[id] = $(id);
  // Write-on-change: text is only built when the value behind it changed, so update() allocates nothing.
  const cache = new Map();
  const changed = (key, value) => { if (cache.get(key) === value) return false; cache.set(key, value); return true; };
  const toggle = (node, cls, on) => { if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on); };

  // Fixed DOM, built once: pips, round history, feed and radio rows, buy rows, scoreboard rows.
  const pips = [0, 1].map((t) => Array.from({ length: 5 }, () => $(`pips${t}`).appendChild(document.createElement('i'))));
  const history = Array.from({ length: ROUND.winsNeeded * 2 - 1 }, () => el.round.appendChild(document.createElement('i')));
  const feedRows = Array.from({ length: ROWS }, () => el.feed.appendChild(document.createElement('li')));
  const radioRows = Array.from({ length: 4 }, () => el.radio.appendChild(document.createElement('li')));
  const feed = [], radio = [];
  let group = '';
  const buyRows = SHOP.map((item) => {
    if (item.group !== group) { group = item.group; el['buy-list'].appendChild(document.createElement('h3')).textContent = group; }
    const li = el['buy-list'].appendChild(document.createElement('li'));
    li.innerHTML = `<kbd>${item.key}</kbd><span>${itemDef(item).name}</span><b>$${itemDef(item).price}</b>`;
    return li;
  });
  const boardRows = state.actors.map(() => el['board-body'].appendChild(document.createElement('tr')));
  boardRows[state.player.id].className = 'me';
  const scores = [$('score0'), $('score1')], sides = [$('side0'), $('side1')];
  for (const t of [0, 1]) { $(`name${t}`).textContent = TEAMS[t].name; $(`name${t}`).style.color = TEAMS[t].css; }
  const radar = createRadar(state, $('radar'));

  let cursor = state.events.head;
  let hitTime = -99, hurtTime = -99, hurtAngle = 0, killTime = -99, buyOpen = false, boardOpen = false;

  // Newest first, at most ROWS kept: the kill feed and the radio strip.
  function push(list, rows, html) {
    list.unshift(html);
    if (list.length > rows.length) list.pop();
    for (let i = 0; i < rows.length; i++) rows[i].innerHTML = list[i] ?? '';
  }

  function onEvent(e) {
    const p = state.player;
    if (e.type === EV.HIT) {
      if (e.a === p.id && e.b !== p.id) { hitTime = state.time; el.hitmarker.classList.toggle('head', e.w === 1); }
      if (e.b === p.id) { hurtTime = state.time; hurtAngle = Math.atan2(-(e.x - p.pos.x), -(e.z - p.pos.z)); }
    } else if (e.type === EV.KILL) {
      const k = e.a >= 0 ? state.actors[e.a] : null, v = state.actors[e.b];
      const weapon = e.v === GRENADES.frag.index ? GRENADES.frag.name : e.v >= 0 ? WEAPONS[WEAPON_ORDER[e.v]].name : 'Fuse Core';
      const who = (a) => `<b style="color:${TEAMS[a.team].css}">${a.name}</b>`;
      const mine = (k && k.id === p.id) || v.id === p.id ? '<i class="mine"></i>' : '';
      push(feed, feedRows, `${mine}${k ? who(k) : ''}<em>${weapon}</em>${e.w ? '<span class="hs">HS</span> ' : ''}${who(v)}`);
      if (k && k.id === p.id) killTime = state.time;
    } else if (e.type === EV.RADIO && e.b === p.team) {
      push(radio, radioRows, `<b>${state.actors[e.a].name}:</b> ${e.text}`);
    }
  }

  function update() {
    cursor = drain(state.events, cursor, onEvent);
    const p = state.player, round = state.round, core = state.core, w = p.slots[p.active];
    if (changed('hp', p.hp)) el.hp.textContent = Math.max(0, p.hp);
    toggle(el.hp.parentNode, 'low', p.hp <= 25);
    if (changed('armor', Math.round(p.armor))) el.armor.textContent = Math.round(p.armor);
    if (changed('helm', p.helm)) el['armor-label'].textContent = p.helm ? 'ARMOUR+HELM' : 'ARMOUR';
    if (changed('money', p.money)) el.money.textContent = '$' + p.money;
    if (w) {
      if (changed('mag', w.mag)) el.mag.textContent = w.mag;
      if (changed('res', w.reserve)) el.reserve.textContent = '/ ' + w.reserve;
      // `|` (not `||`) so both caches update
      if (changed('wpn', w.id) | changed('rel', p.reloadTimer > 0)) el.weapon.textContent = WEAPONS[w.id].name + (p.reloadTimer > 0 ? '  reloading' : '');
      toggle(el.mag.parentNode, 'empty', w.mag === 0);
    }
    if (changed('frag', p.grenades.frag)) el.frag.textContent = 'G FRAG ' + p.grenades.frag;
    if (changed('smoke', p.grenades.smoke)) el.smoke.textContent = 'F SMOKE ' + p.grenades.smoke;
    toggle(el.frag, 'off', !p.grenades.frag);
    toggle(el.smoke, 'off', !p.grenades.smoke);
    toggle(el.spanner, 'off', !p.kit);

    // Clock: freeze countdown, round clock, or the armed core's fuse.
    const armed = core.state === 'planted';
    const secs = Math.max(0, Math.ceil(round.phase === 'freeze' ? round.timer : armed ? core.fuse : round.clock));
    if (changed('clock', armed ? -secs - 1 : secs)) el.clock.textContent = (armed ? 'CORE ' : '') + clockText(secs);
    toggle(el.clock, 'freeze', round.phase === 'freeze');
    toggle(el.clock, 'urgent', armed || (round.phase === 'live' && round.clock < 15));
    for (let t = 0; t < 2; t++) {
      const team = state.teams[t];
      if (changed(scores[t], team.score * 2 + team.side)) {
        scores[t].textContent = team.score;
        sides[t].textContent = team.side === SIDE.ATTACK ? 'ATTACK' : 'DEFEND';
      }
    }
    let n0 = 0, n1 = 0;
    for (const a of state.actors) toggle(pips[a.team][a.team === 0 ? n0++ : n1++], 'dead', !a.alive);
    const h = state.match.history;
    for (let i = 0; i < history.length; i++) {
      toggle(history[i], 'h', i * 2 < h.length && h[i * 2] === 0);
      toggle(history[i], 's', i * 2 < h.length && h[i * 2] === 1);
    }

    // Crosshair gap = the live spread cone projected to pixels.
    if (w && p.alive) {
      const gap = Math.round(Math.min(80, 3 + Math.tan(spreadOf(p, WEAPONS[w.id])) / Math.tan((camera.fov * Math.PI) / 360) * (window.innerHeight / 2)));
      if (changed('gap', gap)) el.crosshair.style.setProperty('--gap', gap + 'px');
    }
    toggle(el.crosshair, 'hidden', !p.alive || p.scoped);
    toggle(el.scope, 'on', p.alive && p.scoped);
    toggle(el.hitmarker, 'on', state.time - hitTime < 0.12);
    toggle(el.hitmarker, 'kill', state.time - killTime < 0.35);
    const hurt = Math.round(Math.max(0, 1 - (state.time - hurtTime) / 0.9) * 40) / 40;
    if (changed('hurt', hurt)) el.damage.style.opacity = hurt;
    const angle = Math.round(((p.yaw - hurtAngle) * 180) / Math.PI);
    if (hurt > 0 && changed('hurtA', angle)) el.damage.style.setProperty('--angle', angle + 'deg');

    const cell = Math.floor(p.pos.z / state.map.cell) * state.map.w + Math.floor(p.pos.x / state.map.cell);
    if (changed('cell', cell)) el.where.textContent = placeName(state.map, p.pos.x, p.pos.z);
    objective(p, core);
    banner(round);
    const down = !p.alive && round.phase !== 'freeze';
    if (changed('spec', down)) el.spectate.textContent = down ? 'You are down: watching your team' : '';
    const hint = round.buyOpen && p.alive && !buyOpen;
    if (changed('hint', hint)) el.hint.textContent = hint ? 'B  requisition' : '';

    if (buyOpen && !round.buyOpen) toggleBuy(false);
    if (buyOpen) {
      if (changed('buyMoney', p.money)) el['buy-money'].textContent = '$' + p.money;
      for (let i = 0; i < SHOP.length; i++) toggle(buyRows[i], 'off', !canBuy(state, p, SHOP[i]));
      const left = Math.max(0, Math.ceil(round.phase === 'freeze' ? round.timer + ROUND.buyWindow : round.clock - ROUND.live + ROUND.buyWindow));
      if (changed('buyFoot', left)) el['buy-foot'].textContent = `Loss pay next round: $${lossPay(state.teams[p.team])}\nKeys 1-0 buy, B or Esc close. Buying closes in ${left} s.`;
    }
    if (boardOpen || round.phase === 'matchover') drawBoard();
    toggle(el.board, 'open', boardOpen || round.phase === 'matchover');
    radar.draw();
  }

  // One line on the Fuse Core for the player's side (rebuilt only when the core's state changes).
  function objective(p, core) {
    progress(p, core);
    if (!changed('obj', (state.round.phase === 'live' && p.alive ? 1 : 0) + (core.state === 'carried' ? core.carrier * 10 + 10 : CORE_STATES.indexOf(core.state) * 2))) return;
    const attacking = state.teams[p.team].side === SIDE.ATTACK;
    let text = '';
    if (core.state === 'planted') text = attacking ? `Core armed at ${core.site}: hold the site` : `Core armed at ${core.site}: hold E on it to disarm`;
    else if (core.state === 'carried' && core.carrier === p.id) text = 'You carry the Fuse Core: hold E on site A or B to arm it';
    else if (core.state === 'dropped') text = attacking ? 'Fuse Core dropped: pick it up' : 'They dropped the Fuse Core';
    else if (core.state === 'carried' && attacking) text = `${state.actors[core.carrier].name} carries the Fuse Core`;
    el.objective.textContent = state.round.phase === 'live' && p.alive ? text : '';
  }

  function progress(p, core) {
    const worker = core.worker >= 0 && core.progress > 0 ? state.actors[core.worker] : null;
    const show = !!worker && worker.team === p.team;
    toggle(el.progress, 'on', show);
    if (!show || !changed('prog', Math.floor(core.progress * 100) + worker.id * 1000)) return;
    const pct = Math.floor(core.progress * 100);
    el.progress.style.setProperty('--p', pct + '%');
    el['progress-label'].textContent = `${core.state === 'planted' ? 'DISARMING' : 'ARMING'} ${pct}%${worker.kit ? '  KIT' : ''}${worker === p ? '' : '  ' + worker.name}`;
  }

  function banner(round) {
    if (!changed('banner', round.phase === 'live' ? -1 : round.number * 4 + PHASES.indexOf(round.phase))) return;
    let title = '', sub = '';
    const p = state.player, attacking = state.teams[p.team].side === SIDE.ATTACK;
    if (round.phase === 'freeze') {
      title = `Round ${round.number}`;
      sub = attacking ? 'Attack: arm the Fuse Core on site A or B' : 'Defend: keep the Fuse Core off both sites';
      if (round.number === ROUND.half + 1) sub = `Sides switched. ${sub}`;
    } else if (round.phase === 'over' || round.phase === 'matchover') {
      if (round.phase === 'matchover') {
        title = state.match.winner === p.team ? 'Match won' : 'Match lost';
        sub = `${state.teams[0].score} - ${state.teams[1].score}. A new match starts shortly.`;
      } else {
        title = `${TEAMS[round.winner].name} take the round`;
        const why = REASONS[round.reason] ?? `${TEAMS[1 - round.winner].name} eliminated`;
        sub = `${why}.  Round +$${state.teams[p.team].lastPay}${p.earned ? `, kills +$${p.earned}` : ''}`;
      }
      toggle(el.banner, 'win', round.winner === p.team);
    }
    el['banner-title'].textContent = title;
    el['banner-sub'].textContent = sub;
    toggle(el.banner, 'on', title !== '');
    toggle(el.hud, 'banner', title !== '');
  }

  function drawBoard() {
    for (const a of state.actors) {
      if (!changed(boardRows[a.id], a.money * 4096 + a.kills * 64 + a.deaths * 2 + (a.alive ? 1 : 0))) continue;
      boardRows[a.id].innerHTML = `<td style="color:${TEAMS[a.team].css}">${a.name}</td><td>${a.alive ? '' : 'down'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>`;
    }
  }

  function toggleBuy(open) {
    buyOpen = (open ?? !buyOpen) && state.round.buyOpen;
    el.buy.classList.toggle('open', buyOpen);
    el.hud.classList.toggle('buying', buyOpen);
  }

  return { update, toggleBuy, isBuyOpen: () => buyOpen, showBoard: (on) => { boardOpen = on; } };
}
