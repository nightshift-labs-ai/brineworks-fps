// Sound, all of it from the sim's event ring: shots, footsteps, reloads, the Fuse Core's beeps, blasts and
// grenade bounces. Each cue fades over its HEARING range and, through walls, over HEARING.muffle of it: the
// rule senses.js noiseAt() gives the bots, so the player hears what they hear. Panned by bearing.
import { HEARING } from './sim/config.js';
import { drain, EV } from './sim/events.js';
import { clearLine } from './sim/collide.js';

const SHOT_HZ = [1900, 1500, 1000, 650, 550]; // by weapon index: pistol, SMG, rifle, shotgun, scoped rifle

export function createAudio(state) {
  let ctx = null, out = null, noise = null, pan = 0, cursor = state.events.head;

  // Browsers allow sound only after a gesture: main.js calls this in the click that locks the pointer.
  function start() {
    if (ctx) return ctx.resume();
    ctx = new AudioContext();
    out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // An envelope from `level` down to silence over `len` s at the current pan; returns its input.
  function voice(level, len, at) {
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    p.pan.value = pan;
    g.connect(p).connect(out);
    return g;
  }
  function hiss(level, len, type, hz, at = ctx.currentTime) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noise; f.type = type; f.frequency.value = hz;
    src.connect(f).connect(voice(level, len, at));
    src.start(at, Math.random() * 0.5, len);
  }
  function tone(level, len, from, to, at = ctx.currentTime) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + len);
    o.connect(voice(level, len, at));
    o.start(at); o.stop(at + len);
  }

  // Loudness of a `kind` noise at x, y, z for the player (0: unheard); sets pan from its bearing.
  function heard(kind, x, y, z) {
    const p = state.player, dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz);
    const clear = d < HEARING[kind] * HEARING.muffle || clearLine(state.map, p.pos.x, p.pos.y + 1.2, p.pos.z, x, y + 1.2, z);
    pan = d < 1 ? 0 : (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d; // camera right is (cos yaw, -sin yaw)
    return Math.max(0, 1 - d / (HEARING[kind] * (clear ? 1 : HEARING.muffle)));
  }

  function play(e) {
    const who = state.actors[e.a];
    let v;
    switch (e.type) {
      case EV.SHOT:
        if (!(v = heard('shot', e.x, e.y, e.z))) return;
        hiss(v, e.v === 4 ? 0.3 : 0.15, 'bandpass', SHOT_HZ[e.v]);
        tone(v, 0.08, 120, 40);
        break;
      case EV.STEP:
        if ((v = heard('step', e.x, e.y, e.z))) hiss(v * 0.5, 0.04, 'lowpass', 500);
        break;
      case EV.RELOAD: case EV.DRY: // a click, and the seat of a magazine
        if (!(v = heard('reload', who.pos.x, who.pos.y, who.pos.z))) return;
        tone(v * 0.4, 0.02, 2200, 900);
        if (e.type === EV.RELOAD) tone(v * 0.4, 0.03, 1400, 600, ctx.currentTime + 0.2);
        break;
      case EV.CORE: // v 4 beep, 2 armed, 3 disarmed
        if (e.v === 4 && (v = heard('work', e.x, e.y, e.z))) tone(v * 0.5, 0.06, 880, 880);
        else if (e.v === 2 || e.v === 3) tone(0.4, 0.5, e.v === 2 ? 440 : 660, e.v === 2 ? 880 : 330);
        break;
      case EV.BLAST:
        if (!(v = heard('shot', e.x, e.y, e.z))) return;
        hiss(v, 0.6, 'lowpass', 400);
        tone(v, 0.4, 90, 30);
        break;
      case EV.BOUNCE:
        if ((v = heard('bounce', e.x, e.y, e.z))) tone(v * 0.3, 0.03, 2400, 1200);
    }
  }

  // Once per frame: play what happened since; before start() only keep up with the ring.
  function update() { cursor = ctx ? drain(state.events, cursor, play) : state.events.head; }

  return { start, update };
}
