// What bots can know: sight (cone, range, line of sight, smoke) and hearing (noises, muffled by walls).
import { BOT, HEARING, GRENADES } from './config.js';
import { clearLine } from './collide.js';
import { eyeOf, heightOf } from './actors.js';

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

const SMOKE = GRENADES.smoke;

// A cloud's radius now (sight and the view's puffs): it grows over 1.2 s and shrinks over its last 2 s.
export function smokeRadius(s) {
  return SMOKE.radius * Math.min(1, s.age / 1.2) * Math.min(1, (SMOKE.duration - s.age) / 2);
}

export function smokeBlocks(state, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len2 = dx * dx + dy * dy + dz * dz;
  for (const s of state.smokes) {
    if (!s.live) continue;
    const r = smokeRadius(s), cy = s.y + 1.2;
    const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (cy - ay) * dy + (s.z - az) * dz) / len2));
    if ((ax + dx * t - s.x) ** 2 + (ay + dy * t - cy) ** 2 + (az + dz * t - s.z) ** 2 < r * r) return true;
  }
  return false;
}
