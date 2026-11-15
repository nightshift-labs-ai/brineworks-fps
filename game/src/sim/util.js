// Small helpers shared by the sim and the view: seeded random numbers, angles, distances.
export function createRng(seed) { // mulberry32: a seed replays the same match
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.pick = (list) => list[Math.floor(next() * list.length)];
  return next;
}

export function wrapAngle(x) { // into (-PI, PI]
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

export const yawTo = (ax, az, bx, bz) => Math.atan2(ax - bx, az - bz); // facing yaw from a to b (-z is yaw 0)
export const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
export const lerp = (a, b, t) => a + (b - a) * t;
