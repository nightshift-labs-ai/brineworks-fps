# NOTES (working log for the build agent)

Game: **Brineworks**, a 5v5 round-based tactical FPS at a salt refinery on a cold coast at dusk.
Rakers (vermilion) vs Saltreeves (cobalt); you play with the Rakers, who attack first. Sides swap
after round 5; first to 6 wins. Objective: the Fuse Core (carry, arm on site A or B, fuse, disarm).

## Status (2026-11-15, main)
- C1: pointer-lock look, WASD/jump/crouch/walk, five guns with magazine/reserve/reload/dry fire,
  5v5 bots that move, see and shoot, rounds (freeze/live/over), halves, match restart, HUD
  (health, armour, money, ammo, clock, score, round pips, radar, kill feed, radio strip).
- C2: head/torso/leg hitboxes, per-weapon head multiplier, armour + helm, spread from
  speed/air/crouch/bloom drawn by the crosshair, recoil pattern, accel/friction, step-up collision.
- C3: Fuse Core (arm 3 s, fuse 38 s, disarm 7 s or 3.5 s with the Spanner kit, blast); economy with
  loss pay, objective pay, kill rewards; buy menu grouped with the loss-pay line; frag + smoke;
  coach.js team plans (site choice that remembers failures, staged executes, rush, lurker, defence
  setups, one rotation per round); bots: routes, holds, pre-aim, hearing muffled by walls, retake,
  lobbed grenades, team radio lines from real events. All-bot balance: attack wins ~45%.
- C4: salt-coast palette, canvas textures, stencilled signs, lamps, brine pans, skyline, PMREM
  environment light, two-tone guns, team-readable soldiers, hero Fuse Core, smoke clouds.
- C5: sim/ has no three.js/DOM; one state; event ring with sim-time stamps; pooled effects; A*
  scratch object; HUD writes on change. Screenshot staging lives in tools/stage.js (outside the
  judged game/), injected by tools/shoot.mjs through main.js's dev hook (`window.__brineworks`).

## Done (prompts 7-10, operator reviews of 28d09ae, b52fd2e)
- Events carry `t` (sim time); the HUD times hits from it, clears feed/radio each round; the damage
  cue is a short edge wedge. Feed max 4 rows, radio 2, rows leave after 10 s.
- Staging moved to tools/stage.js (no judged bytes); scenes are scripted tick by tick (see below).
- Sim review fixes: route/hold/lurk reset each round, lurker release, retakes without the human,
  X drops the core, core snaps to walkable ground, helm needs a vest, survivors keep the kit,
  predictBurst() (own-side frag damage 40% -> 4%), dry gun -> sidearm, G/F latch, no keys while
  paused, dead events removed, prev copied once per step.
- Look: tracers kept off the lens, short (2.5 m at 420 m/s) and thin; low warm sun, exposure 0.9,
  darker salt-stained ground, gravel roofs with a coping, salt flat to the fog, lane accents,
  sign text fit, lumpy smoke dome, 3/4 round-end camera; smaller two-tone viewmodel lower right.
- HUD: bar alone while arming/disarming ('ARMING FUSE CORE n%', KIT only when disarming),
  match-win banner, docked board, two-value changed() cache, class captions (Hawser · bullpup rifle).
- Audio: game/src/audio.js plays shots, steps, reloads, beeps, blasts, bounces from the event ring,
  muffled through walls by the bots' hearing rule; starts in the pointer-lock click.
- Pointer lock: lock() catches a refused re-lock and says 'Click again to resume'.
- Names: bots Carrick, Skerry, Ozzy, Brandt / Haldane, Kesh, Fenn, Lowrie, Dunmore; teams Rakers /
  Saltreeves; weapons Cleat, Skiff, Hawser, Bollard, Capstan; the field's names are banned.

## Budget (tools/budget.mjs 158)
- Source 161,398 bytes (157.6 KiB); dossier text 163,823 of 163,840 (no cut). No headroom: every
  addition is paid for by a trim (a trim pass found ~0.5 KB without losing "why" comments; the sun
  halo was dropped for the plan line).

## Done since prompt 10
- Names R/T/S/Y: bots, weapons (class captions), kit tag, callouts (Boiling House, Boiler Gate,
  Jetty Gate, Slipway); old names banned in check-names.
- J/W/I screenshots restaged; E smaller viewmodel; F short tracers; K one palette (rust, teal,
  salt-white, rose brine), canvas salt loads; L lamps as housing + lens + glow, fog in the horizon
  colour; U plan line pinned above the radio; N Fuse Core as a case with window and handle, pistol
  turned with a gunmetal slide; review 12e radar ring; banner 'Next round in 5 s'.

## Next (each needs bytes: trade before adding)
- M skyline silhouettes, O salt bloom/rust streaks (texture only), P round indicator + health bars,
  Q callout signs (data), X loadout row, Z HUD plates; U radar route lines, merged radio lines.

## Screenshots (retake LAST before each commit: `tools/shoot-all.sh`, then look at each)
- 1 cover `?shot=1&seed=9` Conveyor Court headshot firefight; 2 buy time in the defenders' yard
  `?shot=2&seed=7`; 3 arming on B under smoke `?shot=3&seed=7`; 4 disarm win `?shot=4&seed=7`
  (shots.json). `python3 tools/sheet.py` makes a 2x2 contact sheet.
- `node tools/check-shots.mjs` checks size and dimensions.

## Decisions
- ASCII grid map + grid A* (validated by tools/sightlines.mjs); routes/holds are named waypoints.
- sim/ render/ ui/ layout; team plans in sim/coach.js.
- Names are our own; tools/check-names.mjs bans CS names/callouts, the sibling entry's names,
  words crowded in the field and names of famous game characters.
- Budget rule: tools/budget.mjs 158 must print OK (every file shown, no cut line).

## How to test
- Serve: `python3 -m http.server 8792 --bind 127.0.0.1 --directory game` (background); other
  ports via `PORT=... tools/playtest.sh` / `tools/shoot.sh`.
- `node tools/simtest.mjs [seed] [minutes] [--bots]` (balance TALLY), `node tools/sightlines.mjs`.
- `tools/playtest.sh [seed]` (12 checks, fails on console errors).
- `node tools/check-names.mjs`; `node tools/budget.mjs 158`.
- Package: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` twice, compare sha256.
