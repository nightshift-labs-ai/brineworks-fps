// Procedural textures painted on canvases at load (no image files): sun-bleached concrete,
// corrugated refinery cladding, crate planks, salt-crusted ground, deck grating, hazard paint.
// A fixed seed keeps every texture identical between runs (and between screenshots).
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Speckle the whole canvas with per-pixel noise of +-amount (keeps the base colour's hue).
function grain(ctx, size, amount, rand) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Soft blotches (stains, salt crust, water marks).
function blotches(ctx, size, count, color, maxR, rand) {
  for (let i = 0; i < count; i++) {
    const x = rand() * size, y = rand() * size, r = maxR * (0.3 + rand() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function finish(c, repeat = true) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function concrete(seed, base, stain) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 26, stain, 70, rand);
  // formwork seams and tie holes
  ctx.fillStyle = 'rgba(40,30,25,0.22)';
  ctx.fillRect(0, 126, size, 3);
  ctx.fillRect(126, 0, 2, size);
  for (const [x, y] of [[40, 60], [214, 60], [40, 190], [214, 190]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
  // rain streaks from the top
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    ctx.fillStyle = `rgba(60,45,35,${0.05 + rand() * 0.08})`;
    ctx.fillRect(x, 0, 1 + rand() * 3, 40 + rand() * 160);
  }
  grain(ctx, size, 26, rand);
  return finish(c);
}

function cladding(seed, base, rust) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // corrugation: vertical ridges
  for (let x = 0; x < size; x += 16) {
    const g = ctx.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 16, size);
  }
  blotches(ctx, size, 18, rust, 50, rand);
  // panel joints and rust runs below rivets
  ctx.fillStyle = 'rgba(20,15,12,0.45)';
  ctx.fillRect(0, 0, size, 3);
  for (let x = 8; x < size; x += 32) {
    ctx.fillStyle = 'rgba(30,20,15,0.6)';
    ctx.fillRect(x, 6, 3, 3);
    ctx.fillStyle = rust;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, 9, 2, 20 + rand() * 50);
    ctx.globalAlpha = 1;
  }
  grain(ctx, size, 18, rand);
  return finish(c);
}

function crate(seed, base, dark) {
  const size = 128, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 21) {
    ctx.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.1})`;
    ctx.fillRect(0, y, size, 20);
    ctx.fillStyle = dark;
    ctx.fillRect(0, y + 20, size, 1);
  }
  ctx.strokeStyle = dark;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(size - 8, size - 8); ctx.stroke();
  grain(ctx, size, 30, rand);
  return finish(c);
}

function ground(seed) {
  const size = 512, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, size, size);
  blotches(ctx, size, 40, 'rgba(255,250,240,0.35)', 90, rand); // salt crust
  blotches(ctx, size, 30, 'rgba(110,80,60,0.18)', 70, rand); // damp patches
  // slab joints every 3 m (texture spans 6 m)
  ctx.fillStyle = 'rgba(70,55,45,0.35)';
  for (let i = 0; i <= 2; i++) { ctx.fillRect(i * 256 - 1, 0, 3, size); ctx.fillRect(0, i * 256 - 1, size, 3); }
  for (let i = 0; i < 70; i++) { // cracks
    let x = rand() * size, y = rand() * size;
    ctx.strokeStyle = 'rgba(60,45,35,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rand() - 0.5) * 30; y += (rand() - 0.5) * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  grain(ctx, size, 22, rand);
  return finish(c);
}

function grating(seed) {
  const size = 128, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#3b3d3c';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#6c706b';
  for (let i = 0; i < size; i += 8) { ctx.fillRect(i, 0, 3, size); ctx.fillRect(0, i, size, 2); }
  blotches(ctx, size, 10, 'rgba(160,80,40,0.35)', 30, rand);
  grain(ctx, size, 20, rand);
  return finish(c);
}

function hazard() {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = PALETTE.paint;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#26221f';
  for (let i = -size; i < size * 2; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i + 16, 0); ctx.lineTo(i + 16 - size, size); ctx.lineTo(i - size, size);
    ctx.fill();
  }
  return finish(c);
}

// Painted site marking: a ring and the site letter, seen from above.
export function siteDecal(letter) {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.strokeStyle = PALETTE.paint;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 12;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  ctx.font = 'bold 170px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.paint;
  ctx.fillText(letter, size / 2, size / 2 + 8);
  return finish(c, false);
}

// Small round mark with a dark core: bullet holes.
export function holeTexture() {
  const size = 64;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(10,8,6,1)');
  g.addColorStop(0.3, 'rgba(25,20,16,0.9)');
  g.addColorStop(0.6, 'rgba(60,50,40,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, false);
}

// Soft round sprite for particles, flashes and smoke.
export function softDot() {
  const size = 64;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, false);
}

// Vertical sky gradient for the background sphere.
export function skyTexture() {
  const [c, ctx] = canvas(256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(0.42, PALETTE.skyMid);
  g.addColorStop(0.5, PALETTE.horizon);
  g.addColorStop(0.56, PALETTE.sea);
  g.addColorStop(1, PALETTE.sea);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTextures() {
  return {
    wall: concrete(11, PALETTE.concrete, 'rgba(150,110,80,0.25)'),
    rustClad: cladding(23, PALETTE.rust, 'rgba(70,30,15,0.5)'),
    tealClad: cladding(37, PALETTE.teal, 'rgba(120,60,30,0.45)'),
    crate: crate(41, PALETTE.wood, '#4a2f1c'),
    container: cladding(53, PALETTE.steel, 'rgba(120,60,30,0.4)'),
    ground: ground(61),
    grating: grating(71),
    hazard: hazard(),
  };
}
