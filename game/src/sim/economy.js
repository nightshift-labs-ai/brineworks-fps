// Money: round pay (objective wins pay more; a losing streak raises the loss pay; arming the core
// pays even in defeat), the requisition rules shared by the player's buy menu and the bots, and the
// bots' team buy call (full buy, force, or save). Kill rewards are paid in actors.js kill().
import { ECON, WEAPONS, GRENADES, GEAR, OBJECTIVE, SIDE, ROUND } from './config.js';
import { giveWeapon } from './actors.js';

// The requisition list, in menu order; `key` is the menu hotkey.
export const SHOP = [
  { id: 'rivet', key: '1', group: 'Sidearm' }, { id: 'skiff', key: '2', group: 'Primary' },
  { id: 'bollard', key: '3', group: 'Primary' }, { id: 'ballast', key: '4', group: 'Primary' },
  { id: 'capstan', key: '5', group: 'Primary' }, { id: 'vest', key: '6', group: 'Gear' },
  { id: 'helm', key: '7', group: 'Gear' }, { id: 'kit', key: '8', group: 'Gear' },
  { id: 'frag', key: '9', group: 'Grenade' }, { id: 'smoke', key: '0', group: 'Grenade' },
];
const DEFS = { ...WEAPONS, ...GRENADES, ...GEAR };
export const itemDef = (item) => DEFS[item.id];

export function canBuy(state, a, item) {
  const def = DEFS[item.id];
  if (!state.round.buyOpen || !a.alive || a.money < def.price) return false;
  if (item.id === 'vest') return a.armor < 100;
  if (item.id === 'helm') return !a.helm;
  if (item.id === 'kit') return !a.kit && state.teams[a.team].side === def.side;
  if (GRENADES[item.id]) return a.grenades[item.id] < 1;
  const owned = a.slots[def.slot === 'primary' ? 0 : 1];
  return !owned || owned.id !== item.id;
}

export function buy(state, a, item) {
  if (!canBuy(state, a, item)) return false;
  a.money -= DEFS[item.id].price;
  if (item.id === 'vest') a.armor = 100;
  else if (item.id === 'helm') { a.helm = true; a.armor = Math.max(a.armor, 50); }
  else if (item.id === 'kit') a.kit = true;
  else if (GRENADES[item.id]) a.grenades[item.id]++;
  else giveWeapon(a, item.id);
  return true;
}

// What a team would be paid for losing the next round.
export function lossPay(team) { return Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * team.lossStreak); }

export function payRound(state, winnerTeam, reason) {
  for (const team of state.teams) {
    const won = team.id === winnerTeam;
    let amount = won ? (reason === 'detonated' || reason === 'defused' ? ECON.objectiveWin : ECON.win) : lossPay(team);
    if (!won && team.side === SIDE.ATTACK && state.round.planted) amount += OBJECTIVE.plantBonus;
    team.lossStreak = won ? Math.max(0, team.lossStreak - 1) : Math.min(4, team.lossStreak + 1);
    team.lastPay = amount;
    for (const a of state.actors) if (a.team === team.id) a.money = Math.min(ECON.max, a.money + amount);
  }
}

// Bots shop by a team call: full buy when the team can afford rifles, force when a losing streak
// makes saving pointless, otherwise save (sidearm and maybe a vest). Then armour, the role's gun
// (one marksman per team), grenades, and a disarm kit for defenders.
export function botShop(state, a, call, marksman) {
  const get = (id) => buy(state, a, SHOP.find((s) => s.id === id));
  const primary = a.slots[0] ? a.slots[0].id : '';
  if (call === 'pistol') { get('vest'); return; }
  if (call === 'save') { if (a.money >= 1600) get('vest'); return; }
  if (primary !== 'ballast' && primary !== 'capstan') {
    if (call === 'full' && marksman && a.money >= 4500 + 600) get('capstan');
    else if (call === 'full' && a.money >= 2600 + 600) get('ballast');
    else if (!primary) get(state.rng() < 0.6 ? 'skiff' : 'bollard');
  }
  if (a.money >= 600) get('vest');
  if (a.money >= 900) get('helm');
  if (a.money >= 700) get('smoke');
  if (a.money >= 500) get('frag');
  if (a.money >= 350 && state.teams[a.team].side === SIDE.DEFEND) get('kit');
}

// The team's buy call for this round, from its average money and losing streak.
export function teamCall(state, team) {
  const n = state.round.number;
  if (n === 1 || n === ROUND.half + 1) return 'pistol';
  let sum = 0, count = 0;
  for (const a of state.actors) if (a.team === team.id && a.isBot) { sum += a.money; count++; }
  const avg = count ? sum / count : 0;
  return avg >= 3700 ? 'full' : avg >= 1900 && team.lossStreak >= 2 ? 'force' : 'save';
}
