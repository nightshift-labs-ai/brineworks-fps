// Radar: the whole map drawn once from the grid onto an offscreen canvas, then each frame the
// player's team with facing cones, any enemy a teammate has eyes on, the team's last heard enemy
// noise (a fading ring) and the Fuse Core.
import { TEAMS, SIDE } from '../sim/config.js';

export function createRadar(state, canvas) {
  const map = state.map;
  const scale = Math.floor(Math.min(canvas.width / map.w, canvas.height / map.h));
  const ox = (canvas.width - map.w * scale) / 2, oy = (canvas.height - map.h * scale) / 2;
  const base = document.createElement('canvas');
  base.width = canvas.width; base.height = canvas.height;
  const b = base.getContext('2d');
  for (let r = 0; r < map.h; r++) {
    for (let c = 0; c < map.w; c++) {
      const ch = String.fromCharCode(map.kind[r * map.w + c]);
      b.fillStyle = ch === '#' || ch === 'H' ? 'rgba(20,18,22,0.85)'
        : ch === 'X' || ch === 'x' || ch === '-' ? 'rgba(120,105,90,0.9)'
          : ch === 'A' || ch === 'B' ? 'rgba(239,201,76,0.55)' : 'rgba(205,195,176,0.35)';
      b.fillRect(ox + c * scale, oy + r * scale, scale, scale);
    }
  }
  b.font = `bold ${scale * 4}px system-ui, sans-serif`;
  b.fillStyle = 'rgba(239,201,76,0.95)';
  b.textAlign = 'center';
  b.textBaseline = 'middle';
  for (const site of Object.values(map.sites)) b.fillText(site.name, ox + (site.x / map.cell) * scale, oy + (site.z / map.cell) * scale);
  const ctx = canvas.getContext('2d');

  function dot(a, color, size) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + (a.pos.x / map.cell) * scale - size / 2, oy + (a.pos.z / map.cell) * scale - size / 2, size, size);
  }

  function spotted(enemy) {
    for (const a of state.actors) if (a.alive && a.isBot && a.team !== enemy.team && a.brain.target === enemy.id) return true;
    return false;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    const p = state.player, intel = state.intel[p.team];
    // The team's last heard enemy noise: a ring that fades over 4 s.
    const heard = 1 - (state.time - intel.heardTime) / 4;
    if (heard > 0) {
      ctx.strokeStyle = `rgba(255,90,74,${heard.toFixed(2)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ox + (intel.heardX / map.cell) * scale, oy + (intel.heardZ / map.cell) * scale, 4 + (1 - heard) * 6, 0, 7); ctx.stroke();
    }
    // Teammates with a short facing cone; enemies only while a teammate has eyes on them.
    for (const a of state.actors) {
      if (!a.alive || a === p) continue;
      if (a.team === p.team) { cone(a, 'rgba(255,255,255,0.22)', 16); dot(a, TEAMS[a.team].css, 5); }
      else if (spotted(a)) dot(a, '#ff4d4d', 6);
    }
    // The Fuse Core: attackers always know where it is; defenders once it is armed. It pulses.
    const core = state.core;
    if (core.state !== 'carried' && (core.state === 'planted' || state.teams[p.team].side === SIDE.ATTACK)) {
      const r = 3 + (core.state === 'planted' ? 2 * Math.abs(Math.sin(state.time * 6)) : 1);
      ctx.fillStyle = '#efc94c';
      ctx.beginPath(); ctx.arc(ox + (core.x / map.cell) * scale, oy + (core.z / map.cell) * scale, r, 0, 7); ctx.fill();
    }
    if (p.alive) {
      cone(p, 'rgba(255,255,255,0.35)', 22);
      const x = ox + (p.pos.x / map.cell) * scale, y = oy + (p.pos.z / map.cell) * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // A view cone (60 degrees) of length len pixels from an actor's radar position.
  function cone(a, color, len) {
    const x = ox + (a.pos.x / map.cell) * scale, y = oy + (a.pos.z / map.cell) * scale, dir = -a.yaw - Math.PI / 2;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, len, dir - 0.52, dir + 0.52); ctx.closePath(); ctx.fill();
  }

  return { draw };
}
