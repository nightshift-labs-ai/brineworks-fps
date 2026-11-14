// Radar: the whole map drawn once from the grid onto an offscreen canvas, then each frame the
// player's team and any enemy a teammate currently has eyes on.
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
    const p = state.player;
    for (const a of state.actors) {
      if (!a.alive || a === p) continue;
      if (a.team === p.team) dot(a, TEAMS[a.team].css, 5);
      else if (spotted(a)) dot(a, '#ff4d4d', 6);
    }
    // The Fuse Core: attackers always know where it is; defenders once it is armed.
    const core = state.core;
    if (core.state !== 'carried' && (core.state === 'planted' || state.teams[p.team].side === SIDE.ATTACK)) {
      ctx.fillStyle = state.time % 0.6 < 0.3 ? '#efc94c' : '#7a5f10';
      ctx.fillRect(ox + (core.x / map.cell) * scale - 4, oy + (core.z / map.cell) * scale - 4, 8, 8);
    }
    if (p.alive) {
      const x = ox + (p.pos.x / map.cell) * scale, y = oy + (p.pos.z / map.cell) * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-p.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  return { draw };
}
