// What bots can know: sight (view cone + line of sight) and hearing (noises with a radius).
// Noises are delivered straight into the listening bots' memories, so nothing is queued.
import { BOT } from './config.js';
import { clearLine } from './collide.js';
import { eyeOf, heightOf } from './actors.js';

export const NOISE = { STEP: 16, SHOT: 48, RELOAD: 9, LAND: 12 };

export function makeNoise(state, source, radius) {
  const r2 = radius * radius;
  for (const bot of state.actors) {
    if (!bot.isBot || !bot.alive || bot.team === source.team) continue;
    const dx = bot.pos.x - source.pos.x, dz = bot.pos.z - source.pos.z;
    if (dx * dx + dz * dz > r2) continue;
    const mem = bot.brain;
    mem.heardX = source.pos.x;
    mem.heardZ = source.pos.z;
    mem.heardTime = state.time;
  }
}

// Can `a` see `b` right now? View cone (or very close), range, then eye-to-head or eye-to-chest ray.
export function canSee(state, a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > BOT.viewRange * BOT.viewRange) return false;
  if (d2 > 4) {
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    const cos = (dx * fx + dz * fz) / Math.sqrt(d2);
    if (cos < Math.cos(BOT.fov * 0.5)) return false;
  }
  const ex = a.pos.x, ey = a.pos.y + eyeOf(a), ez = a.pos.z;
  const h = heightOf(b);
  return clearLine(state.map, ex, ey, ez, b.pos.x, b.pos.y + h - 0.15, b.pos.z)
    || clearLine(state.map, ex, ey, ez, b.pos.x, b.pos.y + h * 0.65, b.pos.z);
}
