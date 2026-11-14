// Round and match flow: freeze (buy) -> live (clock runs) -> over (result shown) -> next round,
// teams swap sides at half time, first to ROUND.winsNeeded takes the match, then a new match starts.
import { DT, ROUND, ECON, SIDE } from './config.js';
import { respawn } from './actors.js';
import { payRound, botShop } from './economy.js';
import { planRound } from './bots.js';
import { emit, EV } from './events.js';

export function startMatch(state) {
  for (const t of state.teams) { t.score = 0; t.side = t.id; t.lossStreak = 0; }
  for (const a of state.actors) { a.alive = false; a.money = ECON.start; a.kills = 0; a.deaths = 0; }
  state.match.winner = -1;
  state.round.number = 0;
  startRound(state);
}

export function startRound(state) {
  const round = state.round;
  round.number++;
  if (round.number === ROUND.half + 1) swapSides(state);
  round.phase = 'freeze';
  round.timer = ROUND.freeze;
  round.clock = ROUND.live;
  round.winner = -1;
  round.reason = '';
  round.buyOpen = true;
  const used = [0, 0];
  for (const a of state.actors) {
    const side = state.teams[a.team].side;
    const spawns = state.map.spawns[side];
    const spawn = spawns[used[side]++ % spawns.length];
    respawn(a, spawn, side === SIDE.ATTACK ? 0 : Math.PI);
    a.cmd.yaw = a.yaw; a.cmd.pitch = 0;
    if (a.isBot) botShop(state, a);
  }
  for (const t of state.teams) planRound(state, t.id, t.side === SIDE.ATTACK);
  emit(state.events, EV.ROUND, -1, -1, 0);
}

function swapSides(state) {
  for (const t of state.teams) { t.side = 1 - t.side; t.lossStreak = 0; }
  for (const a of state.actors) { a.alive = false; a.money = ECON.start; }
}

export function aliveCount(state, team) {
  let n = 0;
  for (const a of state.actors) if (a.alive && a.team === team) n++;
  return n;
}

export function teamOnSide(state, side) { return state.teams[0].side === side ? 0 : 1; }

export function updateRound(state) {
  const round = state.round;
  switch (round.phase) {
    case 'freeze':
      round.timer -= DT;
      if (round.timer <= 0) { round.phase = 'live'; round.timer = 0; }
      break;
    case 'live': {
      round.clock -= DT;
      round.buyOpen = ROUND.live - round.clock < ROUND.buyWindow;
      const alive0 = aliveCount(state, 0), alive1 = aliveCount(state, 1);
      if (alive0 === 0 || alive1 === 0) endRound(state, alive0 === 0 ? 1 : 0, 'eliminated');
      else if (round.clock <= 0) endRound(state, teamOnSide(state, SIDE.DEFEND), 'time');
      break;
    }
    case 'over':
      round.timer -= DT;
      if (round.timer <= 0) {
        if (state.match.winner >= 0) { round.phase = 'matchover'; round.timer = ROUND.matchOver; }
        else startRound(state);
      }
      break;
    case 'matchover':
      round.timer -= DT;
      if (round.timer <= 0) startMatch(state);
      break;
  }
}

export function endRound(state, winner, reason) {
  const round = state.round;
  round.phase = 'over';
  round.timer = ROUND.over;
  round.winner = winner;
  round.reason = reason;
  round.buyOpen = false;
  state.teams[winner].score++;
  payRound(state, winner);
  if (state.teams[winner].score >= ROUND.winsNeeded) state.match.winner = winner;
  emit(state.events, EV.ROUND, winner, -1, 1);
}
