// Radar: the map drawn once onto an offscreen canvas; each frame the team with facing cones, enemies a
// teammate has eyes on, the team's last heard enemy noise (a fading ring) and the Fuse Core.
import { TEAMS, SIDE } from '../sim/config.js';

export function createRadar(state, canvas) {
  const map = state.map, { width, height } = canvas;
  const scale = Math.floor(Math.min(width / map.w, height / map.h));
  const ox = (width - map.w * scale) / 2, oy = (height - map.h * scale) / 2;
  const sx = (x) => ox + (x / map.cell) * scale, sy = (z) => oy + (z / map.cell) * scale; // world to radar pixels
  const base = document.createElement('canvas');
  base.width = width; base.height = height;
  const b = base.getContext('2d');
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const ch = String.fromCharCode(map.kind[r * map.w + c]);
      b.fillStyle = '#H'.includes(ch) ? 'rgba(20,18,22,0.85)' : 'Xx-'.includes(ch) ? 'rgba(120,105,90,0.9)'
        : 'AB'.includes(ch) ? 'rgba(239,201,76,0.55)' : 'rgba(205,195,176,0.35)';
      b.fillRect(ox + c * scale, oy + r * scale, scale, scale);
    }
  }
  b.font = `bold ${scale * 4}px system-ui, sans-serif`;
  b.fillStyle = 'rgba(239,201,76,0.95)';
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  for (const site of Object.values(map.sites)) b.fillText(site.name, sx(site.x), sy(site.z));
  const ctx = canvas.getContext('2d');

  function dot(a, color, size) {
    ctx.fillStyle = color;
    ctx.fillRect(sx(a.pos.x) - size / 2, sy(a.pos.z) - size / 2, size, size);
  }

  // A 60 degree view cone, len pixels deep.
  function cone(a, color, len) {
    const x = sx(a.pos.x), y = sy(a.pos.z), dir = -a.yaw - Math.PI / 2;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, dir - 0.52, dir + 0.52); ctx.closePath(); ctx.fill();
  }

  function spotted(enemy) {
    for (const a of state.actors) if (a.alive && a.isBot && a.team !== enemy.team && a.brain.target === enemy.id) return true;
    return false;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(base, 0, 0);
    const p = state.player, intel = state.intel[p.team], core = state.core;
    const heard = 1 - (state.time - intel.heardTime) / 4; // the ring fades over 4 s
    if (heard > 0) {
      ctx.strokeStyle = `rgba(255,90,74,${heard.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(intel.heardX), sy(intel.heardZ), 4 + (1 - heard) * 6, 0, 7); ctx.stroke();
    }
    // Teammates with a small facing cone; enemies only while a teammate has eyes on them.
    for (const a of state.actors) {
      if (!a.alive || a === p) continue;
      if (a.team === p.team) { cone(a, 'rgba(255,255,255,0.22)', 16); dot(a, TEAMS[a.team].css, 5); }
      else if (spotted(a)) dot(a, '#ff4d4d', 6);
    }
    // The Fuse Core: attackers always know where it is; defenders once it is armed. It pulses.
    if (core.state !== 'carried' && (core.state === 'planted' || state.teams[p.team].side === SIDE.ATTACK)) {
      ctx.fillStyle = '#efc94c';
      ctx.beginPath(); ctx.arc(sx(core.x), sy(core.z), 3 + (core.state === 'planted' ? 2 * Math.abs(Math.sin(state.time * 6)) : 1), 0, 7); ctx.fill();
    }
    if (p.alive) {
      cone(p, 'rgba(255,255,255,0.35)', 22);
      ctx.translate(sx(p.pos.x), sy(p.pos.z));
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
      ctx.resetTransform();
    }
  }

  return { draw };
}
