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

## Done since the operator's review of 28d09ae (prompt 7)
- Item 2: events carry `t` (sim time); the HUD times hits/hurts/kills from it, clears the feed and
  radio on round start; the damage indicator is a short wedge near the edge (no ring, no stuck
  vignette in staged shots).
- Item 8: budget. Staging moved out of game/: source 150.6 KiB, dossier 156,538 of 163,840 bytes.
- Item 9: Rook -> Carrick, Vale -> Pell, Harrow -> Rakers; the old names are banned in
  tools/check-names.mjs.

## In progress (parallel worktree agents, merged one branch per commit)
- Sim (code review items 1, 5, 6, 9, 10, 11, 12, 13, 14, 15): route reset, lurker release, retake
  without waiting for the player, core drop (X), core snaps to walkable ground, helm/kit rules,
  frag burst prediction (own-side frag damage 40% -> 4%), dry gun -> sidearm, toss latch, dead events.
- Look (items 3, 4, 5 viewmodel, 6 smoke, 7 roofs/salt flat/camera): tracer clipping near the
  lens, darker values with a low warm sun, sign text fit, two-tone rifle, lumpy smoke.
- HUD (items 6, 7 HUD parts; review 4, 7, 10c, 12d, 12e, 13): arming hint, match-win banner,
  docked board, feed limits, reviewer NOTE, overlay text.
- Audio + pointer lock (review items 7, 8): WebAudio from the event ring, lock() with error hint.
- Then: restage shots 1, 3, 4 (prompt items 5-7), rename weapons (done: Hawser, Cleat; the old names are banned) (an entry on the
  board is titled BALLAST).

## Screenshots (retake LAST before each commit: `tools/shoot-all.sh`, then look at each)
- 1 cover `?shot=1&seed=9` Conveyor Court firefight; 2 buy menu `?shot=2&seed=7`;
  3 arming on B under smoke `?shot=3&seed=7`; 4 round end `?shot=4&seed=7` (shots.json).
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
