// The fixed-step simulation: step(state) advances the world exactly DT (no clock, DOM or three.js).
import { DT } from './config.js';
import { createState } from './state.js';
import { startMatch, updateRound } from './round.js';
import { think } from './bots.js';
import { updateCoach } from './coach.js';
import { moveActor, separateActors } from './movement.js';
import { updateWeapon } from './weapons.js';
import { updateCore, isWorking } from './objective.js';
import { updateNades } from './grenades.js';

export function createGame(seed) {
  const state = createState(seed);
  startMatch(state);
  return state;
}

export function step(state) {
  state.tick++;
  state.events.time = state.time += DT;
  updateRound(state);
  const frozen = state.round.phase === 'freeze', actors = state.actors;
  if (state.round.phase === 'live') updateCoach(state);
  for (const a of actors) if (a.alive && a.isBot) think(state, a);
  for (const a of actors) {
    if (a.alive) moveActor(state, a, a.cmd, frozen || isWorking(state, a));
    else { a.prev.x = a.pos.x; a.prev.y = a.pos.y; a.prev.z = a.pos.z; }
  }
  separateActors(state);
  for (const a of actors) if (a.alive) updateWeapon(state, a, a.cmd, !frozen && !isWorking(state, a));
  updateNades(state);
  if (!frozen) updateCore(state);
}
