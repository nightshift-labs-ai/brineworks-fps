// Money: round pay with the loss bonus, the buy rules the menu and bots share, the bots' buy calls.
import { ECON, WEAPONS, GRENADES, GEAR, OBJECTIVE, SIDE, ROUND } from './config.js';
import { giveWeapon, pay } from './actors.js';

// Menu order, keys 1-9 (everyone already carries the Cleat).
export const SHOP = ['skiff', 'bollard', 'hawser', 'capstan', 'vest', 'helm', 'kit', 'frag', 'smoke'].map((id, i) => ({ id, key: String(i + 1) }));
const DEFS = { ...WEAPONS, ...GRENADES, ...GEAR };
export const itemDef = (item) => DEFS[item.id];

export function canBuy(state, a, { id }) {
  const def = DEFS[id];
  if (!state.round.buyOpen || !a.alive || a.money < def.price) return false;
  if (id === 'vest') return a.armor < 100;
  if (id === 'helm') return !a.helm && a.armor > 0; // only on top of a vest
  if (id === 'kit') return !a.kit && state.teams[a.team].side === def.side;
  if (GRENADES[id]) return a.grenades[id] < 1;
  return a.slots[0]?.id !== id;
}

export function buy(state, a, item) {
  if (!canBuy(state, a, item)) return false;
  const id = item.id;
  a.money -= DEFS[id].price;
  if (id === 'vest') a.armor = 100;
  else if (id === 'helm') a.helm = true;
  else if (id === 'kit') a.kit = true;
  else if (GRENADES[id]) a.grenades[id]++;
  else giveWeapon(a, id);
  return true;
}

export function lossPay(team) { return ECON.lossBase + ECON.lossStep * team.lossStreak; }

export function payRound(state, winnerTeam, reason) {
  for (const team of state.teams) {
    const won = team.id === winnerTeam;
    let amount = won ? (reason === 'detonated' || reason === 'defused' ? ECON.objectiveWin : ECON.win) : lossPay(team);
    if (!won && team.side === SIDE.ATTACK && state.round.planted) amount += OBJECTIVE.plantBonus;
    team.lossStreak = won ? Math.max(0, team.lossStreak - 1) : Math.min((ECON.lossMax - ECON.lossBase) / ECON.lossStep, team.lossStreak + 1);
    team.lastPay = amount;
    for (const a of state.actors) if (a.team === team.id) pay(a, amount);
  }
}

// A bot's shopping under its team's call (pistol, save, force or full): gun, armour, grenades, kit.
export function botShop(state, a, call, marksman) {
  const get = (id) => buy(state, a, { id }), primary = a.slots[0]?.id;
  if (call === 'pistol') { get('vest'); return; }
  if (call === 'save') { if (a.money >= 1600) get('vest'); return; }
  if (primary !== 'hawser' && primary !== 'capstan') {
    if (call === 'full' && marksman && a.money >= WEAPONS.capstan.price + GEAR.vest.price) get('capstan');
    else if (call === 'full' && a.money >= WEAPONS.hawser.price + GEAR.vest.price) get('hawser');
    else if (!primary) get(state.rng() < 0.6 ? 'skiff' : 'bollard');
  }
  if (a.money >= 600) get('vest');
  if (a.money >= 900) get('helm');
  if (a.money >= 700) get('smoke');
  if (a.money >= 500) get('frag');
  if (a.money >= 350 && state.teams[a.team].side === SIDE.DEFEND) get('kit');
}

// The team's buy call: full when it can afford rifles, force on a losing streak, else save.
export function teamCall(state, team) {
  const n = state.round.number;
  if (n === 1 || n === ROUND.half + 1) return 'pistol';
  let sum = 0, count = 0;
  for (const a of state.actors) if (a.team === team.id && a.isBot) { sum += a.money; count++; }
  const avg = count ? sum / count : 0;
  return avg >= 3700 ? 'full' : avg >= 1900 && team.lossStreak >= 2 ? 'force' : 'save';
}
