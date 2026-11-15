// Every texture is painted on a canvas at load from a fixed seed: no image files.
import * as THREE from 'three';
import { createRng } from '../sim/util.js';
import { PALETTE } from './palette.js';

const rect = (ctx, style, x, y, w, h) => { ctx.fillStyle = style; ctx.fillRect(x, y, w, h); };
const gradient = (g, stops) => { for (const [at, color] of stops) g.addColorStop(at, color); return g; };
const radial = (ctx, x, y, r, stops) => rect(ctx, gradient(ctx.createRadialGradient(x, y, 0, x, y, r), stops), x - r, y - r, r * 2, r * 2);

// Fill `base`, draw(ctx, rand), then add a grey grain of +-noise/2.
function paint(w, seed, base, draw, noise = 0, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), rand = createRng(seed);
  rect(ctx, base, 0, 0, w, h);
  draw(ctx, rand);
  if (noise) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rand() - 0.5) * noise; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  return Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace, anisotropy: 4 });
}

// Formwork concrete, one tile per wall height (canvas bottom = wall foot).
const concrete = (ctx, rand) => {
  for (let x = 0; x < 256; x += 64) for (let y = 0; y < 256; y += 128) {
    rect(ctx, `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.04})`, x, y, 64, 128);
    rect(ctx, '#2a323833', x, y, 1, 128);
    rect(ctx, '#2a323833', x, y, 64, 1);
    for (let i = 0; i < 4; i++) rect(ctx, '#2d373e55', x + 15 + (i & 1) * 32, y + 30 + (i >> 1) * 64, 3, 3);
  }
  for (let i = 0; i < 3; i++) {
    const x = 20 + rand() * 216, y = 60 + rand() * 110;
    rect(ctx, '#3c444a80', x - 2, y - 2, 5, 5);
    rect(ctx, '#80543c2a', x, y + 3, 2, 14 + rand() * 30);
  }
  rect(ctx, gradient(ctx.createLinearGradient(0, 256, 0, 210), [[0, '#343c4048'], [1, '#343c4000']]), 0, 210, 256, 46);
  rect(ctx, '#ffffff4d', 0, 0, 256, 5);
};

// Corrugated sheet, near white so lane tints show true.
const cladding = (ctx) => {
  for (let x = 0; x < 256; x += 16) {
    rect(ctx, gradient(ctx.createLinearGradient(x, 0, x + 16, 0), [[0, '#00000040'], [0.45, '#ffffff22'], [1, '#00000040']]), x, 0, 16, 256);
  }
  for (let y = 0; y < 256; y += 128) {
    rect(ctx, '#19202673', 0, y, 256, 3);
    for (let x = 8; x < 256; x += 32) { rect(ctx, '#1e262c99', x, y + 6, 3, 3); rect(ctx, '#6e4a3826', x, y + 9, 2, 22); }
  }
};

const crate = (ctx) => {
  ctx.strokeStyle = '#2c353b';
  ctx.lineWidth = 9; ctx.strokeRect(5, 5, 118, 118);
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(10, 118); ctx.lineTo(118, 10); ctx.stroke();
  rect(ctx, PALETTE.paint, 14, 14, 26, 8);
  ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#2c353bcc'; ctx.fillText('BW-07', 70, 112);
};

const ground = (ctx, rand) => {
  for (let i = 0; i < 2600; i++) rect(ctx, `rgba(255,255,255,${0.35 + rand() * 0.6})`, rand() * 512, rand() * 512, 1 + rand(), 1 + rand());
  for (let i = 0; i < 24; i++) rect(ctx, '#7d8a9010', rand() * 512, rand() * 512, 40 + rand() * 90, 30 + rand() * 60);
  for (let i = 0; i <= 2; i++) { rect(ctx, '#5e6a7059', i * 256 - 1, 0, 2, 512); rect(ctx, '#5e6a7059', 0, i * 256 - 1, 512, 2); }
  ctx.strokeStyle = '#5a666c40';
  for (let i = 0; i < 60; i++) {
    let x = rand() * 512, y = rand() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 34; y += (rand() - 0.5) * 34; ctx.lineTo(x, y); }
    ctx.stroke();
  }
};

const grating = (ctx) => { for (let i = 0; i < 128; i += 8) { rect(ctx, '#7a8186', i, 0, 3, 128); rect(ctx, '#7a8186', 0, i, 128, 2); } };

const hazard = (ctx) => {
  ctx.fillStyle = '#20262b';
  for (let i = -128; i < 256; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i - 112, 128); ctx.lineTo(i - 128, 128); ctx.fill(); }
};

export function createTextures() {
  const t = {
    wall: paint(256, 11, PALETTE.concrete, concrete, 6),
    clad: paint(256, 23, '#e9eceb', cladding, 8),
    crate: paint(128, 41, '#8d9ba5', crate, 10),
    ground: paint(512, 61, PALETTE.ground, ground, 10),
    grating: paint(128, 71, '#3e464b', grating, 12),
    hazard: paint(128, 1, PALETTE.paint, hazard),
  };
  for (const k in t) t[k].wrapS = t[k].wrapT = THREE.RepeatWrapping;
  return t;
}

export const signTexture = (lines) => paint(256, 0, '#22313a', (ctx) => {
  rect(ctx, PALETTE.paint, 0, 118, 256, 10);
  ctx.fillStyle = '#e8ecee'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((text, i) => { ctx.font = `bold ${i ? 26 : 48}px monospace`; ctx.fillText(text, 128, 118 * (i ? 0.78 : lines.length > 1 ? 0.36 : 0.5)); });
}, 0, 128);

export const siteDecal = (letter) => paint(256, 3, '#0000', (ctx) => {
  ctx.globalAlpha = 0.85; ctx.strokeStyle = ctx.fillStyle = PALETTE.paint;
  ctx.lineWidth = 12; ctx.strokeRect(14, 14, 228, 228);
  ctx.font = 'bold 170px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 136);
});

export const holeTexture = () => paint(64, 5, '#0000', (ctx) => radial(ctx, 32, 32, 30, [[0, '#0a0806'], [0.3, '#191410e6'], [0.6, '#3c322859'], [1, '#0000']]));

let dot = null; // shared: flashes, sparks, the sun
export const softDot = () => dot ??= paint(64, 7, '#0000', (ctx) => radial(ctx, 32, 32, 32, [[0, '#fff'], [0.4, '#fff9'], [1, '#fff0']]));

export const glow = (color) => new THREE.SpriteMaterial({ map: softDot(), color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

export const puffTexture = () => paint(128, 83, '#0000', (ctx, rand) => {
  for (let i = 0; i < 18; i++) {
    const a = rand() * 6.28, r = rand() * 34, v = (200 + rand() * 55) | 0;
    radial(ctx, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 18 + rand() * 22, [[0, `rgba(${v},${v},${v},.9)`], [0.6, `rgba(${v},${v},${v},.5)`], [1, '#fff0']]);
  }
});

export const skyTexture = () => paint(512, 97, '#000', (ctx, rand) => {
  rect(ctx, gradient(ctx.createLinearGradient(0, 0, 0, 512), PALETTE.sky), 0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const y = 160 + rand() * 88, w = 60 + rand() * 220, x = rand() * 512;
    ctx.fillStyle = `rgba(255,${190 + rand() * 40 | 0},${150 + rand() * 40 | 0},${0.05 + (y - 160) / 88 * 0.16})`;
    ctx.fillRect(x, y, w, 1 + rand() * 3);
    ctx.fillRect(x - 512, y, w, 1 + rand() * 3);
  }
});
