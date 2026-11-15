// The HUD: the only writer of the DOM overlay, writing each value only when it changes.
import { TEAMS, WEAPONS, WEAPON_ORDER, GRENADES, SIDE, ROUND } from '../sim/config.js';
import { SHOP, itemDef, canBuy, lossPay } from '../sim/economy.js';
import { spreadOf } from '../sim/weapons.js';
import { placeName } from '../sim/map.js';
import { drain, EV } from '../sim/events.js';
import { yawTo } from '../sim/util.js';
import { createRadar } from './radar.js';

const PHASES = ['live', 'freeze', 'over', 'matchover'];
const CORE_STATES = ['carried', 'dropped', 'planted', 'defused', 'detonated'];
const HEADERS = { rivet: 'Sidearm', skiff: 'Primary', vest: 'Gear', frag: 'Grenades' }; // buy menu sections
const REASONS = { time: 'Time ran out', detonated: 'The Fuse Core detonated', defused: 'The Fuse Core was disarmed' };
const make = (parent, tag, n) => Array.from({ length: n }, () => parent.appendChild(document.createElement(tag)));

export function createHud(state, camera) {
  const el = {};
  for (const n of document.querySelectorAll('#hud, #hud [id]')) el[n.id] = n;
  // Text is built only when the value behind it changed, so update() allocates nothing per frame.
  const cache = new Map();
  const changed = (key, value) => { if (cache.get(key) === value) return false; cache.set(key, value); return true; };
  const show = (node, value) => { if (changed(node, value)) node.textContent = value; };
  const toggle = (node, cls, on) => { if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on); };

  const pips = [0, 1].map((t) => make(el[`pips${t}`], 'i', 5).map((i) => { i.style.background = TEAMS[t].css; return i; }));
  const history = make(el.round, 'i', ROUND.winsNeeded * 2 - 1);
  const feedRows = make(el.feed, 'li', 5), radioRows = make(el.radio, 'li', 4), feed = [], radio = [];
  const buyRows = SHOP.map((item) => {
    if (HEADERS[item.id]) make(el['buy-list'], 'h3', 1)[0].textContent = HEADERS[item.id];
    const [li] = make(el['buy-list'], 'li', 1), def = itemDef(item);
    li.innerHTML = `<kbd>${item.key}</kbd><span>${def.name}</span><b>$${def.price}</b>`;
    return li;
  });
  const boardRows = make(el['board-body'], 'tr', state.actors.length);
  boardRows[state.player.id].className = 'me';
  for (const t of [0, 1]) { el[`name${t}`].textContent = TEAMS[t].name; el[`name${t}`].style.color = TEAMS[t].css; }
  const scores = [el.score0, el.score1], sides = [el.side0, el.side1], radar = createRadar(state, el.radar);
  let cursor = state.events.head, hitTime = -99, hurtTime = -99, hurtAngle = 0, killTime = -99, buyOpen = false, boardOpen = false;

  // Newest first: the kill feed and the team radio strip; no html clears the list.
  function push(list, rows, html) {
    if (html) list.unshift(html); else list.length = 0;
    if (list.length > rows.length) list.pop();
    for (let i = 0; i < rows.length; i++) rows[i].innerHTML = list[i] ?? '';
  }

  function onEvent(e) {
    const p = state.player;
    if (e.type === EV.HIT) {
      if (e.a === p.id && e.b !== p.id) { hitTime = e.t; toggle(el.hitmarker, 'head', e.w === 1); }
      if (e.b === p.id) { hurtTime = e.t; hurtAngle = yawTo(p.pos.x, p.pos.z, e.x, e.z); }
    } else if (e.type === EV.KILL) {
      const k = e.a >= 0 ? state.actors[e.a] : null, v = state.actors[e.b];
      const weapon = e.v === GRENADES.frag.index ? GRENADES.frag.name : e.v >= 0 ? WEAPONS[WEAPON_ORDER[e.v]].name : 'Fuse Core';
      const who = (a) => `<b style="color:${TEAMS[a.team].css}">${a.name}</b>`;
      push(feed, feedRows, `${k === p || v === p ? '<i class="mine"></i>' : ''}${k ? who(k) : ''}<em>${weapon}</em>${e.w ? '<span class="hs">HS</span>' : ''}${who(v)}`);
      if (k === p) killTime = e.t;
    } else if (e.type === EV.ROUND && !e.v) { push(feed, feedRows); push(radio, radioRows); } // a new round: clean strips
    else if (e.type === EV.RADIO && e.b === p.team) push(radio, radioRows, `<b>${state.actors[e.a].name}:</b> ${e.text}`);
  }

  function update() {
    cursor = drain(state.events, cursor, onEvent);
    const p = state.player, round = state.round, core = state.core, w = p.slots[p.active];
    show(el.hp, Math.max(0, p.hp));
    toggle(el.hp.parentNode, 'low', p.hp <= 25);
    show(el.armor, Math.round(p.armor));
    show(el['armor-label'], p.helm ? 'ARMOUR+HELM' : 'ARMOUR');
    if (changed('money', p.money)) el.money.textContent = '$' + p.money;
    if (w) {
      show(el.mag, w.mag);
      if (changed('res', w.reserve)) el.reserve.textContent = '/ ' + w.reserve;
      if (changed('wpn', w.id) | changed('rel', p.reloadTimer > 0)) el.weapon.textContent = WEAPONS[w.id].name + (p.reloadTimer > 0 ? '  reloading' : ''); // | updates both keys
      toggle(el.ammo, 'empty', w.mag === 0);
    }
    if (changed('frag', p.grenades.frag)) el.frag.textContent = 'G FRAG ' + p.grenades.frag;
    if (changed('smoke', p.grenades.smoke)) el.smoke.textContent = 'F SMOKE ' + p.grenades.smoke;
    toggle(el.frag, 'off', !p.grenades.frag);
    toggle(el.smoke, 'off', !p.grenades.smoke);
    toggle(el.spanner, 'off', !p.kit);
    const armed = core.state === 'planted';
    const secs = Math.max(0, Math.ceil(round.phase === 'freeze' ? round.timer : armed ? core.fuse : round.clock));
    if (changed('clock', armed ? -secs - 1 : secs)) el.clock.textContent = (armed ? 'CORE ' : '') + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    toggle(el.clock, 'freeze', round.phase === 'freeze');
    toggle(el.clock, 'urgent', armed || (round.phase === 'live' && round.clock < 15));
    for (let t = 0; t < 2; t++) {
      const team = state.teams[t];
      if (!changed(scores[t], team.score * 2 + team.side)) continue;
      scores[t].textContent = team.score;
      sides[t].textContent = team.side === SIDE.ATTACK ? 'attack' : 'defend';
    }
    let n0 = 0, n1 = 0;
    for (const a of state.actors) toggle(pips[a.team][a.team ? n1++ : n0++], 'dead', !a.alive);
    for (let i = 0; i < history.length; i++) {
      const won = state.match.history[i * 2] ?? -1;
      if (changed(history[i], won)) history[i].style.background = won < 0 ? '' : TEAMS[won].css;
    }
    // Crosshair gap = the live spread cone projected to pixels.
    if (w && p.alive) {
      const gap = Math.round(Math.min(80, 3 + Math.tan(spreadOf(p, WEAPONS[w.id])) / Math.tan((camera.fov * Math.PI) / 360) * (innerHeight / 2)));
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
    show(el.spectate, !p.alive && round.phase !== 'freeze' ? 'You are down: watching your team' : '');
    show(el.hint, round.buyOpen && p.alive && !buyOpen ? 'B  requisition' : '');
    if (buyOpen && !round.buyOpen) toggleBuy(false);
    if (buyOpen) {
      if (changed('buyMoney', p.money)) el['buy-money'].textContent = '$' + p.money;
      for (let i = 0; i < SHOP.length; i++) toggle(buyRows[i], 'off', !canBuy(state, p, SHOP[i]));
      const left = Math.max(0, Math.ceil((round.phase === 'freeze' ? round.timer : round.clock - ROUND.live) + ROUND.buyWindow));
      if (changed('buyFoot', left)) el['buy-foot'].textContent = `Loss pay next round: $${lossPay(state.teams[p.team])}\nKeys 1-0 buy, B or Esc close. Buying closes in ${left} s.`;
    }
    const board = boardOpen || round.phase === 'matchover';
    if (board) {
      for (const a of state.actors) {
        if (!changed(boardRows[a.id], a.money * 4096 + a.kills * 64 + a.deaths * 2 + (a.alive ? 1 : 0))) continue;
        boardRows[a.id].innerHTML = `<td style="color:${TEAMS[a.team].css}">${a.name}</td><td>${a.alive ? '' : 'down'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>`;
      }
    }
    toggle(el.board, 'open', board);
    radar.draw();
  }

  // The arm/disarm bar while a teammate works the core; the Fuse Core line, rebuilt only when the core's state changes.
  function objective(p, core) {
    const worker = core.worker >= 0 && core.progress > 0 ? state.actors[core.worker] : null, pct = Math.floor(core.progress * 100);
    const ours = !!worker && worker.team === p.team;
    toggle(el.progress, 'on', ours);
    if (ours && changed('prog', pct + worker.id * 1000)) {
      el.progress.style.setProperty('--p', pct + '%');
      el['progress-label'].textContent = `${core.state === 'planted' ? 'DISARMING' : 'ARMING'} ${pct}%${worker.kit ? '  KIT' : ''}${worker === p ? '' : '  ' + worker.name}`;
    }
    const live = state.round.phase === 'live' && p.alive;
    if (!changed('obj', (live ? 1 : 0) + (core.state === 'carried' ? core.carrier * 10 + 10 : CORE_STATES.indexOf(core.state) * 2))) return;
    const attacking = state.teams[p.team].side === SIDE.ATTACK;
    el.objective.textContent = !live ? ''
      : core.state === 'planted' ? `Core armed at ${core.site}: ${attacking ? 'hold the site' : 'hold E on it to disarm'}`
        : core.state === 'carried' && core.carrier === p.id ? 'You carry the Fuse Core: hold E on site A or B to arm it'
          : core.state === 'dropped' ? (attacking ? 'Fuse Core dropped: pick it up' : 'They dropped the Fuse Core')
            : core.state === 'carried' && attacking ? `${state.actors[core.carrier].name} carries the Fuse Core` : '';
  }

  function banner(round) {
    if (!changed('banner', round.phase === 'live' ? -1 : round.number * 4 + PHASES.indexOf(round.phase))) return;
    const p = state.player, attacking = state.teams[p.team].side === SIDE.ATTACK;
    let title = '', sub = '';
    if (round.phase === 'freeze') {
      title = `Round ${round.number}`;
      sub = (round.number === ROUND.half + 1 ? 'Sides switched. ' : '') + (attacking ? 'Attack: arm the Fuse Core on site A or B' : 'Defend: keep the Fuse Core off both sites');
    } else if (round.phase === 'matchover') {
      title = state.match.winner === p.team ? 'Match won' : 'Match lost';
      sub = `${state.teams[0].score} - ${state.teams[1].score}. A new match starts shortly.`;
    } else if (round.phase === 'over') {
      title = `${TEAMS[round.winner].name} take the round`;
      sub = `${REASONS[round.reason] ?? `${TEAMS[1 - round.winner].name} eliminated`}.  Round +$${state.teams[p.team].lastPay}${p.earned ? `, kills +$${p.earned}` : ''}`;
    }
    toggle(el.banner, 'win', round.winner === p.team);
    el['banner-title'].textContent = title;
    el['banner-sub'].textContent = sub;
    toggle(el.banner, 'on', title !== '');
    toggle(el.hud, 'banner', title !== '');
  }

  function toggleBuy(open) {
    buyOpen = (open ?? !buyOpen) && state.round.buyOpen;
    toggle(el.buy, 'open', buyOpen);
    toggle(el.hud, 'buying', buyOpen);
  }

  return { update, toggleBuy, isBuyOpen: () => buyOpen, showBoard: (on) => { boardOpen = on; } };
}
