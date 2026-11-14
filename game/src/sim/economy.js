// Money: round rewards (win, loss with a growing loss bonus) and the buy rules shared by the
// player's buy menu and the bots' shopping. Kill rewards are paid in actors.js when a kill lands.
import { ECON, WEAPONS } from './config.js';
import { giveWeapon } from './actors.js';

export const SHOP = [
  { id: 'wasp', key: '1' },
  { id: 'kestrel', key: '2' },
  { id: 'pike', key: '3' },
  { id: 'armor', key: '4', name: 'Plate vest', price: 650 },
];

export function priceOf(item) { return item.price ?? WEAPONS[item.id].price; }

export function canBuy(state, a, item) {
  if (!state.round.buyOpen || !a.alive || a.money < priceOf(item)) return false;
  if (item.id === 'armor') return a.armor < 100;
  const owned = a.slots[WEAPONS[item.id].slot === 'primary' ? 0 : 1];
  return !owned || owned.id !== item.id;
}

export function buy(state, a, item) {
  if (!canBuy(state, a, item)) return false;
  a.money -= priceOf(item);
  if (item.id === 'armor') a.armor = 100;
  else giveWeapon(a, item.id);
  return true;
}

export function payRound(state, winnerTeam) {
  for (const team of state.teams) {
    const won = team.id === winnerTeam;
    const amount = won ? ECON.win : Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * team.lossStreak);
    team.lossStreak = won ? 0 : team.lossStreak + 1;
    team.lastPay = amount;
    for (const a of state.actors) if (a.team === team.id) a.money = Math.min(ECON.max, a.money + amount);
  }
}

// Bots shop by budget: armour first, then the best gun they can afford while keeping a little back.
export function botShop(state, a) {
  const item = (id) => SHOP.find((s) => s.id === id);
  if (a.money >= 3350 && !(a.slots[0] && a.slots[0].id === 'kestrel')) buy(state, a, item('kestrel'));
  if (a.money >= 650 + 200 && a.armor < 50) buy(state, a, item('armor'));
  if (!a.slots[0] && a.money >= 1250 + 400) buy(state, a, item('wasp'));
}
