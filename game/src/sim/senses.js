// What bots can know: sight (cone, range, line of sight, smoke) and hearing (noises, muffled by walls).
import { BOT, HEARING } from './config.js';
import { clearLine } from './collide.js';
import { eyeOf, heightOf } from './actors.js';
import { smokeBlocks } from './grenades.js';

// A noise of `kind` goes straight into the memory of every enemy bot within HEARING[kind].
export function makeNoise(state, source, kind) {
  noiseAt(state, source.team, source.pos.x, source.pos.y, source.pos.z, kind);
}

export function noiseAt(state, team, x, y, z, kind) {
  const radius = HEARING[kind];
  for (const bot of state.actors) {
    if (!bot.isBot || !bot.alive || bot.team === team) continue;
    const d = Math.hypot(bot.pos.x - x, bot.pos.z - z);
    if (d > radius || (d > radius * HEARING.muffle && !clearLine(state.map, x, y + 1.2, z, bot.pos.x, bot.pos.y + 1.2, bot.pos.z))) continue;
    const mem = bot.brain, intel = state.intel[bot.team]; // intel: the team's last heard enemy (the radar marks it)
    mem.heardX = intel.heardX = x; mem.heardZ = intel.heardZ = z; mem.heardTime = intel.heardTime = state.time;
    mem.heardKind = kind;
  }
}

// Can `a` see `b` right now? View cone (or very close), range, then eye-to-head or eye-to-chest ray.
export function canSee(state, a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
  if (d2 > BOT.viewRange * BOT.viewRange) return false;
  if (d2 > 4 && (dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw)) / Math.sqrt(d2) < Math.cos(BOT.fov * 0.5)) return false;
  const ex = a.pos.x, ey = a.pos.y + eyeOf(a), ez = a.pos.z, h = heightOf(b);
  if (smokeBlocks(state, ex, ey, ez, b.pos.x, b.pos.y + h * 0.65, b.pos.z)) return false;
  return clearLine(state.map, ex, ey, ez, b.pos.x, b.pos.y + h - 0.15, b.pos.z)
    || clearLine(state.map, ex, ey, ez, b.pos.x, b.pos.y + h * 0.65, b.pos.z);
}
