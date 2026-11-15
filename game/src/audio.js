// Sound from the event ring. A cue fades over its HEARING range, through walls over HEARING.muffle of it
// (the rule the bots hear by, senses.js noiseAt), so the player hears what they hear; panned by bearing.
import { HEARING } from './sim/config.js';
import { drain, EV } from './sim/events.js';
import { clearLine } from './sim/collide.js';

const SHOT_HZ = [1900, 1500, 1000, 650, 550]; // by weapon index
const KIND = { [EV.SHOT]: 'shot', [EV.BLAST]: 'shot', [EV.STEP]: 'step', [EV.BOUNCE]: 'bounce', [EV.CORE]: 'work', [EV.RELOAD]: 'reload', [EV.DRY]: 'reload' };

export function createAudio(state) {
  let ctx = null, out, noise, pan = 0, cursor = state.events.head;

  // Browsers allow sound only after a gesture: main.js calls this in the click that locks the pointer.
  function start() {
    if (ctx) return ctx.resume();
    ctx = new AudioContext();
    (out = ctx.createGain()).connect(ctx.destination);
    out.gain.value = 0.5;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    noise.getChannelData(0).forEach((_, i, d) => { d[i] = Math.random() * 2 - 1; });
  }

  // source -> envelope from `level` to silence over `len` s -> current pan -> out
  function sound(src, level, len, at) {
    const g = ctx.createGain(), p = ctx.createStereoPanner();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    p.pan.value = pan;
    src.connect(g).connect(p).connect(out);
  }
  function hiss(level, len, type, hz, at = ctx.currentTime) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = noise; f.type = type; f.frequency.value = hz;
    sound(src.connect(f), level, len, at);
    src.start(at, Math.random() * 0.5, len);
  }
  function tone(level, len, from, to, at = ctx.currentTime) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + len);
    sound(o, level, len, at);
    o.start(at); o.stop(at + len);
  }

  // Loudness of a `kind` noise at x, y, z for the player (0 unheard); sets pan (right: cos yaw, -sin yaw).
  function heard(kind, x, y, z) {
    const p = state.player, dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz), r = HEARING[kind];
    pan = d < 1 ? 0 : (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d;
    const clear = d < r * HEARING.muffle || clearLine(state.map, p.pos.x, p.pos.y + 1.2, p.pos.z, x, y + 1.2, z);
    return Math.max(0, 1 - d / (clear ? r : r * HEARING.muffle));
  }

  function play(e) {
    const t = e.type, kind = KIND[t];
    if (t === EV.CORE && (e.v === 2 || e.v === 3)) { // armed or disarmed: everyone hears it
      pan = 0;
      return tone(0.4, 0.5, e.v === 2 ? 440 : 660, e.v === 2 ? 880 : 330);
    }
    const at = t === EV.RELOAD || t === EV.DRY ? state.actors[e.a].pos : e, v = kind && heard(kind, at.x, at.y, at.z);
    if (!v) return;
    if (t === EV.SHOT) { hiss(v, e.v === 4 ? 0.3 : 0.15, 'bandpass', SHOT_HZ[e.v]); tone(v, 0.08, 120, 40); }
    else if (t === EV.STEP) hiss(v / 2, 0.04, 'lowpass', 500);
    else if (t === EV.BLAST) { hiss(v, 0.6, 'lowpass', 400); tone(v, 0.4, 90, 30); }
    else if (t === EV.BOUNCE) tone(v * 0.3, 0.03, 2400, 1200);
    else if (t === EV.CORE) { if (e.v === 4) tone(v / 2, 0.06, 880, 880); } // the fuse beep
    else { // a click; a reload also seats the magazine
      tone(v * 0.4, 0.02, 2200, 900);
      if (t === EV.RELOAD) tone(v * 0.4, 0.03, 1400, 600, ctx.currentTime + 0.2);
    }
  }

  // Once per frame: play what happened since; before start() only keep up with the ring.
  function update() { cursor = ctx ? drain(state.events, cursor, play) : state.events.head; }

  return { start, update };
}
