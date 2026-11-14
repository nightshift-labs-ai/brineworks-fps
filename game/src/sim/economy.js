// Money: round rewards (win, loss with a growing loss bonus) and the buy rules shared by the
// player's buy menu and the bots' shopping. Kill rewards are paid in actors.js when a kill lands.
import { ECON, WEAPONS, GRENADES, OBJECTIVE, SIDE } from './config.js';
import { giveWeapon } from './actors.js';

export const SHOP = [
  { id: 'brute', key: '1' },
  { id: 'wasp', key: '2' },
  { id: 'kestrel', key: '3' },
  { id: 'heron', key: '4' },
  { id: 'armor', key: '5', name: 'Plate vest', price: 650 },
  { id: 'frag', key: '6' },
  { id: 'smoke', key: '7' },
];

const DEFS = { ...WEAPONS, ...GRENADES, armor: { name: 'Plate vest', price: 650 } };
export const itemDef = (item) => DEFS[item.id];

export function canBuy(state, a, item) {
  if (!state.round.buyOpen || !a.alive || a.money < DEFS[item.id].price) return false;
  if (item.id === 'armor') return a.armor < 100;
  if (GRENADES[item.id]) return a.grenades[item.id] < 1;
  const owned = a.slots[WEAPONS[item.id].slot === 'primary' ? 0 : 1];
  return !owned || owned.id !== item.id;
}

export function buy(state, a, item) {
  if (!canBuy(state, a, item)) return false;
  a.money -= DEFS[item.id].price;
  if (item.id === 'armor') a.armor = 100;
  else if (GRENADES[item.id]) a.grenades[item.id]++;
  else giveWeapon(a, item.id);
  return true;
}

export function payRound(state, winnerTeam) {
  for (const team of state.teams) {
    const won = team.id === winnerTeam;
    let amount = won ? ECON.win : Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * team.lossStreak);
    if (!won && team.side === SIDE.ATTACK && state.round.planted) amount += OBJECTIVE.plantBonus;
    team.lossStreak = won ? 0 : team.lossStreak + 1;
    team.lastPay = amount;
    for (const a of state.actors) if (a.team === team.id) a.money = Math.min(ECON.max, a.money + amount);
  }
}

// Bots shop by budget: a rifle when rich (sometimes the marksman rifle), armour, a cheap gun on
// a thin round, then grenades with what is left.
export function botShop(state, a) {
  const get = (id) => buy(state, a, SHOP.find((s) => s.id === id));
  if (!a.slots[0] || a.slots[0].id === 'brute' || a.slots[0].id === 'wasp') {
    if (a.money >= 5200 && state.rng() < 0.2) get('heron');
    else if (a.money >= 3400) get('kestrel');
  }
  if (a.money >= 850 && a.armor < 50) get('armor');
  if (!a.slots[0] && a.money >= 1700) get(state.rng() < 0.5 ? 'wasp' : 'brute');
  if (a.money >= 900) get('smoke');
  if (a.money >= 900) get('frag');
}
