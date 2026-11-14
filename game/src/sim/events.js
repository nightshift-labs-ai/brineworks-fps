// Simulation -> presentation messages. The sim writes into a fixed ring of preallocated records and
// never waits for anyone; the view, HUD and audio each keep their own read cursor. Nothing allocates.
export const EV = {
  SHOT: 1, // a = shooter, (x,y,z) muzzle, (x2,y2,z2) end of tracer, v = weapon index
  IMPACT: 2, // (x,y,z) point, (x2,y2,z2) normal, v = cell kind
  HIT: 3, // a = attacker, b = victim, v = damage, w = 1 head / 2 torso / 3 legs, (x,y,z) point
  KILL: 4, // a = killer, b = victim, v = weapon index, w = 1 when headshot
  RELOAD: 5, // a = actor
  STEP: 6, // a = actor, (x,y,z) position
  DRY: 7, // a = actor (empty magazine click)
  ROUND: 8, // v = 0 start, 1 end; a = winning team
  JUMP: 9, // a = actor
  DRAW: 10, // a = actor, v = weapon index
  CORE: 11, // v = 0 dropped, 1 picked up, 2 armed, 3 disarmed, 4 beep, 5 work started; a = actor
  BLAST: 12, // (x,y,z) centre, v = radius, a = thrower (-1 for the core)
  THROW: 13, // a = actor, v = 0 frag / 1 smoke
  BOUNCE: 14, // x = grenade position
  SMOKE: 15, // (x,y,z) cloud centre
  RADIO: 16, // a = speaking bot, b = its team, text = the line
};

const SIZE = 512;

export function createEvents() {
  const list = [];
  for (let i = 0; i < SIZE; i++) list.push({ type: 0, a: -1, b: -1, v: 0, w: 0, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, text: '' });
  return { head: 0, list };
}

export function emit(events, type, a = -1, b = -1, v = 0, w = 0) {
  const e = events.list[events.head % SIZE];
  events.head++;
  e.type = type; e.a = a; e.b = b; e.v = v; e.w = w;
  e.x = e.y = e.z = e.x2 = e.y2 = e.z2 = 0;
  e.text = '';
  return e;
}

// Visit every event written since `cursor`; returns the new cursor.
export function drain(events, cursor, visit) {
  for (let i = Math.max(cursor, events.head - SIZE); i < events.head; i++) visit(events.list[i % SIZE]);
  return events.head;
}
