// The HUD, the only writer of #hud: each text and class is written only when it changes.
import { TEAMS, TEAM_SIZE, WEAPONS, WEAPON_ORDER, GRENADES, SIDE, ROUND } from '../sim/config.js';
import { SHOP, itemDef, canBuy, lossPay } from '../sim/economy.js';
import { spreadOf } from '../sim/weapons.js';
import { placeName } from '../sim/map.js';
import { drain, EV } from '../sim/events.js';
import { yawTo } from '../sim/util.js';
import { createRadar } from './radar.js';

const HEADERS = { skiff: 'Primary', vest: 'Gear', frag: 'Grenades' }; // buy menu sections
const ROW_LIFE = 10; // s a kill-feed or radio row stays up
const KIT = { frag: 'G FRAG ', smoke: 'F SMOKE ' }; // grenade counts in the ammo box, with their keys
const REASONS = { time: 'Time ran out', detonated: 'The Fuse Core detonated', defused: 'The Fuse Core was disarmed' };
const make = (parent, tag, n) => Array.from({ length: n }, () => parent.appendChild(document.createElement(tag)));

export function createHud(state, camera) {
  const el = {};
  for (const n of document.querySelectorAll('#hud, #hud [id]')) el[n.id] = n;
  const cache = new Map();
  const changed = (key, a, b = 0) => { // two values per key; NaN never matches, so the first call writes
    let r = cache.get(key);
    if (!r) cache.set(key, (r = [NaN, NaN]));
    if (r[0] === a && r[1] === b) return false;
    r[0] = a; r[1] = b;
    return true;
  };
  const show = (node, value) => { if (changed(node, value)) node.textContent = value; };
  const toggle = (node, cls, on) => { if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on); };

  const pips = [0, 1].map((t) => make(el[`pips${t}`], 'i', TEAM_SIZE).map((i) => { i.style.background = TEAMS[t].css; return i; }));
  const history = make(el.round, 'i', ROUND.winsNeeded * 2 - 1);
  const feedRows = make(el.feed, 'li', 4), radioRows = make(el.radio, 'li', 2), feed = [], radio = [];
  const buyRows = SHOP.map((item) => {
    if (HEADERS[item.id]) make(el['buy-list'], 'h3', 1)[0].textContent = HEADERS[item.id];
    const [li] = make(el['buy-list'], 'li', 1), def = itemDef(item);
    li.innerHTML = `<kbd>${item.key}</kbd><span>${def.name} <small>${def.cls ?? ''}</small></span><b>$${def.price}</b>`;
    return li;
  });
  const boardRows = make(el['board-body'], 'tr', state.actors.length);
  boardRows[state.player.id].className = 'me';
  for (const t of [0, 1]) { el[`name${t}`].textContent = TEAMS[t].name; el[`name${t}`].style.color = TEAMS[t].css; }
  const scores = [el.score0, el.score1], sides = [el.side0, el.side1], radar = createRadar(state, el.radar);
  let cursor = state.events.head, hitTime = -99, hurtTime = -99, hurtAngle = 0, killTime = -99, buyOpen = false, boardOpen = false;

  // Newest first: kill feed and radio; no html clears the list; rows leave after ROW_LIFE.
  function push(list, rows, html, t) {
    if (html && state.time - t > ROW_LIFE) return; // already stale when drained
    if (html) list.unshift({ html, t }); else list.length = 0;
    if (list.length > rows.length) list.pop();
    for (let i = 0; i < rows.length; i++) rows[i].innerHTML = list[i]?.html ?? '';
  }
  function expire(list, rows) {
    if (list.length && state.time - list[list.length - 1].t > ROW_LIFE) { list.pop(); rows[list.length].innerHTML = ''; }
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
      push(feed, feedRows, `${k === p || v === p ? '<i class="mine"></i>' : ''}${k ? who(k) : ''}<em>${weapon}</em>${e.w ? '<span class="hs">HS</span>' : ''}${who(v)}`, e.t);
      if (k === p) killTime = e.t;
    } else if (e.type === EV.ROUND && !e.v) { push(feed, feedRows); push(radio, radioRows); } // a new round: clean strips
    else if (e.type === EV.RADIO && e.b === p.team) push(radio, radioRows, `<b>${state.actors[e.a].name}:</b> ${e.text}`, e.t);
  }

  function update() {
    cursor = drain(state.events, cursor, onEvent);
    expire(feed, feedRows);
    expire(radio, radioRows);
    const p = state.player, round = state.round, core = state.core, w = p.slots[p.active];
    vitals(p, w);
    clockAndScore(round, core);
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
    show(el.plan, state.teams[p.team].plan.text); // pinned above the radio
    show(el.spectate, !p.alive && round.phase !== 'freeze' ? 'You are down: watching your team' : '');
    show(el.hint, round.buyOpen && p.alive && !buyOpen ? 'B  requisition' : '');
    if (buyOpen && !round.buyOpen) toggleBuy(false);
    if (buyOpen) {
      if (changed('buyMoney', p.money)) el['buy-money'].textContent = '$' + p.money;
      for (let i = 0; i < SHOP.length; i++) toggle(buyRows[i], 'off', !canBuy(state, p, SHOP[i]));
      const loss = lossPay(state.teams[p.team]);
      if (changed('buyFoot', loss)) el['buy-foot'].textContent = `Loss pay next round: $${loss}\nKeys 1-9 buy, B closes. Buying stays open ${ROUND.buyWindow} s into the round.`;
    }
    const board = boardOpen || round.phase === 'matchover';
    if (board) {
      for (const a of state.actors) {
        if (!changed(boardRows[a.id], a.money, a.kills * 1e4 + a.deaths * 2 + (a.alive ? 1 : 0))) continue;
        boardRows[a.id].innerHTML = `<td style="color:${TEAMS[a.team].css}">${a.name}</td><td>${a.alive ? '' : 'down'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>`;
      }
    }
    toggle(el.board, 'open', board);
    radar.draw();
  }

  function vitals(p, w) {
    show(el.hp, Math.max(0, p.hp));
    toggle(el.hp.parentNode, 'warn', p.hp < 50);
    toggle(el.hp.parentNode, 'low', p.hp <= 25);
    show(el.armor, Math.round(p.armor));
    show(el['armor-label'], p.helm ? 'VEST · HELM' : 'VEST');
    if (changed('money', p.money)) el.money.textContent = '$' + p.money;
    if (w) {
      show(el.mag, w.mag);
      if (changed('res', w.reserve)) el.reserve.textContent = '/ ' + w.reserve;
      if (changed('wpn', w.id, p.reloadTimer > 0)) el.weapon.innerHTML = `${WEAPONS[w.id].name} <small>${p.reloadTimer > 0 ? 'reloading' : WEAPONS[w.id].cls}</small>`;
      toggle(el.ammo, 'empty', w.mag === 0);
    }
    for (const k in KIT) {
      if (changed(k, p.grenades[k])) el[k].textContent = KIT[k] + p.grenades[k];
      toggle(el[k], 'off', !p.grenades[k]);
    }
    toggle(el.spanner, 'off', !p.kit);
  }

  function clockAndScore(round, core) {
    const armed = core.state === 'planted';
    const secs = Math.max(0, Math.ceil(round.phase === 'freeze' ? round.timer : armed ? core.fuse : round.clock));
    if (changed('clock', secs, armed)) el.clock.textContent = (armed ? 'CORE ' : '') + Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    toggle(el.clock, 'freeze', round.phase === 'freeze');
    toggle(el.clock, 'urgent', armed || (round.phase === 'live' && round.clock < 15));
    for (let t = 0; t < 2; t++) {
      const team = state.teams[t];
      if (!changed(scores[t], team.score, team.side)) continue;
      scores[t].textContent = team.score;
      sides[t].textContent = team.side === SIDE.ATTACK ? 'attack' : 'defend';
    }
    let n0 = 0, n1 = 0;
    for (const a of state.actors) toggle(pips[a.team][a.team ? n1++ : n0++], 'dead', !a.alive);
    for (let i = 0; i < history.length; i++) {
      const won = state.match.history[i] ?? -1;
      if (changed(history[i], won)) history[i].style.background = won < 0 ? '' : TEAMS[won].css;
    }
  }

  // The arm/disarm bar while a teammate works the core; the Fuse Core line, rebuilt on change.
  function objective(p, core) {
    const worker = core.worker >= 0 && core.progress > 0 ? state.actors[core.worker] : null, pct = Math.floor(core.progress * 100);
    const ours = !!worker && worker.team === p.team;
    toggle(el.progress, 'on', ours);
    if (ours && changed('prog', pct, worker.id)) {
      el.progress.style.setProperty('--p', pct + '%');
      el['progress-label'].textContent = `${worker === p ? '' : worker.name + '  '}${core.state === 'planted' ? 'DISARMING' : 'ARMING'} FUSE CORE ${pct}%${core.state === 'planted' && worker.kit ? '  KIT' : ''}`;
    }
    const live = state.round.phase === 'live' && p.alive && !ours; // the bar alone while our side works
    if (!changed('obj', core.state, live ? core.carrier : -2)) return;
    const attacking = state.teams[p.team].side === SIDE.ATTACK;
    el.objective.textContent = !live ? ''
      : core.state === 'planted' ? `Core armed at ${core.site}: ${attacking ? 'hold the site' : 'hold E on it to disarm'}`
        : core.state === 'carried' && core.carrier === p.id ? 'You carry the Fuse Core: hold E on site A or B to arm it'
          : core.state === 'dropped' ? (attacking ? 'Fuse Core dropped: pick it up' : 'They dropped the Fuse Core')
            : core.state === 'carried' && attacking ? `${state.actors[core.carrier].name} carries the Fuse Core` : '';
  }

  function banner(round) {
    if (!changed('banner', round.phase === 'live' ? -1 : round.number, round.phase)) return;
    const p = state.player, attacking = state.teams[p.team].side === SIDE.ATTACK;
    let title = '', sub = '';
    if (round.phase === 'freeze') {
      title = `Round ${round.number}`;
      sub = (round.number === ROUND.half + 1 ? 'Sides switched. ' : '') + (attacking ? 'Attack: arm the Fuse Core on site A or B' : 'Defend: keep the Fuse Core off both sites');
    } else if (round.phase === 'matchover') {
      title = state.match.winner === p.team ? 'Match won' : 'Match lost';
      sub = `${state.teams[0].score} - ${state.teams[1].score}. A new match starts shortly.`;
    } else if (round.phase === 'over') {
      title = `${TEAMS[round.winner].name} ${state.match.winner >= 0 ? `win the match ${state.teams[round.winner].score} - ${state.teams[1 - round.winner].score}` : 'take the round'}`;
      sub = `${REASONS[round.reason] ?? `${TEAMS[1 - round.winner].name} eliminated`}.  Round +$${state.teams[p.team].lastPay}${p.earned ? `, kills +$${p.earned}` : ''}. Next round in ${ROUND.over} s`;
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
