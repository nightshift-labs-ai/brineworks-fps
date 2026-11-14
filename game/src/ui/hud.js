// The HUD: plain DOM over the canvas, written only when a value changes. Health, armour, money,
// ammo, round clock and score with alive pips, kill feed, dynamic crosshair (drawn from the real
// spread), hit marker, damage direction, round banners, buy menu and scoreboard.
import { TEAMS, WEAPONS, WEAPON_ORDER, SIDE, ROUND } from '../sim/config.js';
import { SHOP, priceOf, canBuy } from '../sim/economy.js';
import { spreadOf } from '../sim/weapons.js';
import { drain, EV } from '../sim/events.js';
import { createRadar } from './radar.js';

const $ = (id) => document.getElementById(id);
const FEED_SIZE = 5;

export function createHud(state, camera) {
  const el = {
    health: $('hp'), armor: $('armor'), money: $('money'), mag: $('mag'), reserve: $('reserve'), weapon: $('weapon'),
    clock: $('clock'), score0: $('score0'), score1: $('score1'), name0: $('name0'), name1: $('name1'),
    side0: $('side0'), side1: $('side1'), pips0: $('pips0'), pips1: $('pips1'),
    cross: $('crosshair'), hit: $('hitmarker'), damage: $('damage'), banner: $('banner'), bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'), feed: $('feed'), buy: $('buy'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    board: $('board'), boardBody: $('board-body'), hint: $('hint'), spectate: $('spectate'),
  };
  const cache = new Map();
  const set = (node, key, value) => { if (cache.get(key) !== value) { cache.set(key, value); node.textContent = value; } };
  const style = (node, key, prop, value) => { if (cache.get(key) !== value) { cache.set(key, value); node.style.setProperty(prop, value); } };
  const toggle = (node, key, cls, on) => { if (cache.get(key) !== on) { cache.set(key, on); node.classList.toggle(cls, on); } };

  // Fixed DOM, built once: alive pips, kill feed rows, buy rows, scoreboard rows.
  const pips = [el.pips0, el.pips1].map((box) => Array.from({ length: 5 }, () => box.appendChild(document.createElement('i'))));
  const feedRows = Array.from({ length: FEED_SIZE }, () => el.feed.appendChild(document.createElement('li')));
  const feed = Array.from({ length: FEED_SIZE }, () => ({ text: '', time: -99, mine: false, killerTeam: 0, victimTeam: 0, killer: '', victim: '', weapon: '', head: false }));
  let feedHead = 0;
  const buyRows = SHOP.map((item) => {
    const li = document.createElement('li');
    const name = item.name ?? WEAPONS[item.id].name;
    li.innerHTML = `<kbd>${item.key}</kbd><span>${name}</span><b>$${priceOf(item)}</b>`;
    li.dataset.item = item.id;
    el.buyList.appendChild(li);
    return li;
  });
  const boardRows = state.actors.map(() => el.boardBody.appendChild(document.createElement('tr')));
  for (const t of [0, 1]) { el[`name${t}`].textContent = TEAMS[t].name; el[`name${t}`].style.color = TEAMS[t].css; }
  const radar = createRadar(state, $('radar'));

  let cursor = state.events.head;
  let hitTime = -99, hurtTime = -99, hurtAngle = 0, killTime = -99;
  let buyOpen = false, boardOpen = false;

  function onEvent(e) {
    const p = state.player;
    if (e.type === EV.HIT) {
      if (e.a === p.id) { hitTime = state.time; el.hit.classList.toggle('head', e.w === 1); }
      if (e.b === p.id) {
        hurtTime = state.time;
        hurtAngle = Math.atan2(-(e.x - p.pos.x), -(e.z - p.pos.z));
      }
    } else if (e.type === EV.KILL) {
      const k = e.a >= 0 ? state.actors[e.a] : null, v = state.actors[e.b];
      const row = feed[feedHead];
      feedHead = (feedHead + 1) % FEED_SIZE;
      row.time = state.time;
      row.killer = k ? k.name : ''; row.victim = v.name;
      row.killerTeam = k ? k.team : v.team; row.victimTeam = v.team;
      row.weapon = e.v >= 0 ? WEAPONS[WEAPON_ORDER[e.v]].name : '';
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
      if (row.time < 0) { li.innerHTML = ''; continue; }
      li.className = row.mine ? 'mine' : '';
      li.innerHTML = `<b style="color:${TEAMS[row.killerTeam].css}">${row.killer}</b> <em>${row.weapon}${row.head ? ' &#x2299;' : ''}</em> <b style="color:${TEAMS[row.victimTeam].css}">${row.victim}</b>`;
    }
  }

  function update() {
    cursor = drain(state.events, cursor, onEvent);
    const p = state.player, round = state.round;
    const w = p.slots[p.active];
    set(el.health, 'hp', String(Math.max(0, p.hp)));
    toggle(el.health.parentNode, 'lowhp', 'low', p.hp <= 25);
    set(el.armor, 'armor', String(Math.round(p.armor)));
    set(el.money, 'money', `$${p.money}`);
    if (w) {
      set(el.mag, 'mag', String(w.mag));
      set(el.reserve, 'res', `/ ${w.reserve}`);
      set(el.weapon, 'wpn', p.reloadTimer > 0 ? `${WEAPONS[w.id].name} - reloading` : WEAPONS[w.id].name);
      toggle(el.mag.parentNode, 'empty', 'empty', w.mag === 0);
    }
    const secs = Math.max(0, Math.ceil(round.phase === 'freeze' ? round.timer : round.clock));
    set(el.clock, 'clock', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    toggle(el.clock, 'freeze', 'freeze', round.phase === 'freeze');
    toggle(el.clock, 'urgent', 'urgent', round.phase === 'live' && round.clock < 15);
    for (const t of [0, 1]) {
      set(el[`score${t}`], `score${t}`, String(state.teams[t].score));
      set(el[`side${t}`], `side${t}`, state.teams[t].side === SIDE.ATTACK ? 'ATTACK' : 'DEFEND');
    }
    let n0 = 0, n1 = 0;
    for (const a of state.actors) {
      const i = a.team === 0 ? n0++ : n1++;
      toggle(pips[a.team][i], `pip${a.id}`, 'dead', !a.alive);
    }

    // Crosshair gap follows the weapon's live spread cone (projected to pixels).
    const def = w ? WEAPONS[w.id] : null;
    if (def && p.alive) {
      const px = Math.tan(spreadOf(p, def)) / Math.tan((camera.fov * Math.PI) / 360) * (window.innerHeight / 2);
      style(el.cross, 'gap', '--gap', `${Math.round(Math.min(80, 3 + px))}px`);
    }
    toggle(el.cross, 'xhide', 'hidden', !p.alive);
    toggle(el.hit, 'hiton', 'on', state.time - hitTime < 0.12);
    toggle(el.hit, 'killon', 'kill', state.time - killTime < 0.35);
    const hurt = Math.max(0, 1 - (state.time - hurtTime) / 0.9);
    style(el.damage, 'hurt', 'opacity', hurt.toFixed(2));
    if (hurt > 0) style(el.damage, 'hurtA', '--angle', `${(((p.yaw - hurtAngle) * 180) / Math.PI).toFixed(0)}deg`);

    banner(round);
    set(el.spectate, 'spec', p.alive || round.phase === 'freeze' ? '' : 'You are down - watching your team');
    set(el.hint, 'hint', round.buyOpen && p.alive && !buyOpen ? 'B  buy menu' : '');

    if (buyOpen && !round.buyOpen) toggleBuy(false);
    if (buyOpen) {
      set(el.buyMoney, 'buyMoney', `$${p.money}`);
      SHOP.forEach((item, i) => toggle(buyRows[i], `buy${i}`, 'off', !canBuy(state, p, item)));
    }
    if (boardOpen || round.phase === 'over' || round.phase === 'matchover') drawBoard();
    toggle(el.board, 'boardon', 'open', boardOpen || round.phase === 'matchover');
    radar.draw();
  }

  function banner(round) {
    let title = '', sub = '';
    const p = state.player;
    const mySide = state.teams[p.team].side;
    if (round.phase === 'freeze') {
      title = `Round ${round.number}`;
      sub = mySide === SIDE.ATTACK ? 'Attack: wipe out the Wardens before the clock runs out' : 'Defend: hold the refinery until the clock runs out';
      if (round.number === ROUND.half + 1) sub = `Sides switched. ${sub}`;
    } else if (round.phase === 'over' || round.phase === 'matchover') {
      const won = round.winner === p.team;
      title = round.phase === 'matchover'
        ? (state.match.winner === p.team ? 'Match won' : 'Match lost')
        : `${TEAMS[round.winner].name} take the round`;
      sub = round.phase === 'matchover'
        ? `${state.teams[0].score} - ${state.teams[1].score}. A new match starts shortly.`
        : (round.reason === 'time' ? 'Time ran out' : `${TEAMS[1 - round.winner].name} eliminated`) + `   +$${state.teams[p.team].lastPay}`;
      toggle(el.banner, 'bannerwin', 'win', won);
    }
    set(el.bannerTitle, 'bt', title);
    set(el.bannerSub, 'bs', sub);
    toggle(el.banner, 'banneron', 'on', title !== '');
  }

  function drawBoard() {
    for (const a of state.actors) {
      const html = `<td style="color:${TEAMS[a.team].css}">${a.name}</td><td>${a.alive ? '' : 'down'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>`;
      if (cache.get(boardRows[a.id]) !== html) { cache.set(boardRows[a.id], html); boardRows[a.id].innerHTML = html; }
    }
  }

  function toggleBuy(open) {
    buyOpen = open ?? !buyOpen;
    if (buyOpen && !state.round.buyOpen) buyOpen = false;
    el.buy.classList.toggle('open', buyOpen);
    return buyOpen;
  }

  return {
    update,
    toggleBuy,
    isBuyOpen: () => buyOpen,
    showBoard: (on) => { boardOpen = on; },
    buyRowItem: (node) => node.closest('li')?.dataset.item,
  };
}
