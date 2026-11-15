// Round and match flow: freeze (buy) -> live -> over -> next round; halves; first to 6; new match.
import { DT, ROUND, ECON, SIDE } from './config.js';
import { respawn } from './actors.js';
import { payRound, botShop, teamCall } from './economy.js';
import { planRound, reviewRound } from './coach.js';
import { emit, EV } from './events.js';
import { resetCore } from './objective.js';

export function startMatch(state) {
  for (const t of state.teams) { t.score = 0; t.side = t.id; t.lossStreak = 0; }
  for (const a of state.actors) { a.alive = false; a.money = ECON.start; a.kills = 0; a.deaths = 0; }
  state.match.winner = -1; state.match.history.length = 0; state.round.number = 0;
  startRound(state);
}

function startRound(state) {
  const round = state.round;
  if (++round.number === ROUND.half + 1) { // sides swap: everyone restarts with the sidearm and start money
    for (const t of state.teams) { t.side = 1 - t.side; t.lossStreak = 0; }
    for (const a of state.actors) { a.alive = false; a.money = ECON.start; }
  }
  Object.assign(round, { phase: 'freeze', timer: ROUND.freeze, clock: ROUND.live, winner: -1, reason: '', buyOpen: true, planted: false });
  for (const n of state.nades) n.live = false;
  for (const s of state.smokes) s.live = false;
  const used = [0, 0], calls = state.teams.map((t) => teamCall(state, t));
  for (const a of state.actors) {
    const side = state.teams[a.team].side, spawns = state.map.spawns[side];
    respawn(a, spawns[used[side]++ % spawns.length], side === SIDE.ATTACK ? 0 : Math.PI);
    a.cmd.yaw = a.yaw; a.cmd.pitch = 0;
    if (a.isBot) botShop(state, a, calls[a.team], a.brain.role === 'marksman');
  }
  const attackers = state.actors.filter((a) => state.teams[a.team].side === SIDE.ATTACK);
  resetCore(state, (attackers.includes(state.player) ? state.player : state.rng.pick(attackers)).id);
  for (const t of state.teams) planRound(state, t, calls[t.id]);
  emit(state.events, EV.ROUND, -1, -1, 0);
}

export function aliveCount(state, team) {
  let n = 0;
  for (const a of state.actors) if (a.alive && a.team === team) n++;
  return n;
}

export function updateRound(state) {
  const round = state.round;
  round.timer -= DT;
  if (round.phase === 'freeze') {
    if (round.timer <= 0) { round.phase = 'live'; round.timer = 0; }
  } else if (round.phase === 'live') {
    // Once armed the clock stops: attackers win on detonation or every defender down; defenders must disarm.
    const atk = state.teams[0].side === SIDE.ATTACK ? 0 : 1, def = 1 - atk, core = state.core.state;
    if (core !== 'planted') round.clock -= DT;
    round.buyOpen = ROUND.live - round.clock < ROUND.buyWindow && core !== 'planted';
    if (core === 'detonated') endRound(state, atk, 'detonated');
    else if (core === 'defused') endRound(state, def, 'defused');
    else if (aliveCount(state, def) === 0) endRound(state, atk, 'eliminated');
    else if (aliveCount(state, atk) === 0 && core !== 'planted') endRound(state, def, 'eliminated');
    else if (round.clock <= 0 && core !== 'planted') endRound(state, def, 'time');
  } else if (round.timer <= 0) {
    if (round.phase === 'matchover') startMatch(state);
    else if (state.match.winner >= 0) { round.phase = 'matchover'; round.timer = ROUND.matchOver; }
    else startRound(state);
  }
}

function endRound(state, winner, reason) {
  const round = state.round;
  round.phase = 'over'; round.timer = ROUND.over; round.endedAt = state.time;
  round.winner = winner; round.reason = reason; round.buyOpen = false;
  state.teams[winner].score++;
  state.match.history.push(winner);
  payRound(state, winner, reason);
  reviewRound(state, winner);
  if (state.teams[winner].score >= ROUND.winsNeeded) state.match.winner = winner;
  emit(state.events, EV.ROUND, winner, -1, 1);
}
