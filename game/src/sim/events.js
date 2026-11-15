// The event ring: the sim writes preallocated records stamped with their sim time t; view, HUD and audio
// read with their own cursors.
export const EV = {
  SHOT: 1, // a shooter, xyz muzzle, xyz2 tracer end, v weapon index
  IMPACT: 2, // xyz point, xyz2 face normal, v cell kind
  HIT: 3, // a attacker, b victim, v damage, w part (1 head 2 torso 3 legs), x/z damage source
  KILL: 4, // a killer, b victim, v weapon index (100 frag), w 1 = headshot
  RELOAD: 5, STEP: 6, DRY: 7, // a actor (STEP: xyz position)
  ROUND: 8, // v 0 start / 1 end, a winning team
  CORE: 9, // a actor, v 0 dropped 1 picked up 2 armed 3 disarmed 4 beep 5 work started
  BLAST: 10, // xyz centre, v radius, a thrower (-1: the core)
  BOUNCE: 11, // a thrower, xyz grenade
  RADIO: 12, // a speaking bot, b its team, text the line
};

const SIZE = 512;

export function createEvents() {
  const record = () => ({ type: 0, t: 0, a: -1, b: -1, v: 0, w: 0, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0, text: '' });
  return { head: 0, time: 0, list: Array.from({ length: SIZE }, record) }; // time: set by step()
}

export function emit(events, type, a = -1, b = -1, v = 0, w = 0, x = 0, y = 0, z = 0) {
  const e = events.list[events.head++ % SIZE];
  e.type = type; e.t = events.time; e.a = a; e.b = b; e.v = v; e.w = w; e.x = x; e.y = y; e.z = z;
  e.x2 = e.y2 = e.z2 = 0;
  e.text = '';
  return e;
}

export function drain(events, cursor, visit) {
  for (let i = Math.max(cursor, events.head - SIZE); i < events.head; i++) visit(events.list[i % SIZE]);
  return events.head;
}
