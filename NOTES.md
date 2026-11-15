# NOTES (working log for the build agent)

Game: **Brineworks** (was Saltline), a 5v5 round-based tactical FPS at a salt refinery on a cold
coast at dusk. Harrow (attack first, vermilion) vs Saltreeves (cobalt). Objective: the Fuse Core.

## Status (2026-11-15)
- C1 complete: pointer-lock look, WASD/jump/crouch/walk, five guns with magazine/reserve/reload/dry
  fire, 5v5 bots that move, see and shoot, rounds (freeze/live/over), halves, match restart, HUD.
- C2: head/torso/leg hitboxes (finite cylinders), per-weapon head multiplier, armour + helm, spread
  from speed/air/crouch/bloom drawn by the crosshair, fixed spray pattern on the bullet, Quake-style
  accel/friction, step-up collision. Exact fire rates (cooldown carry).
- C3: Fuse Core (carry/drop/arm 3 s/fuse 38 s/disarm 7 s or 3.5 s with the Spanner kit/blast);
  economy with loss bonus, plant bonus, kill rewards, buy menu (10 items, grouped, loss-pay line);
  frag + smoke (smoke blocks bot sight); coach.js team plans (site choice that remembers failures,
  staged executes with stage points, rush on save rounds, lurker, defence setups 2-1-2/3-1-1/1-1-3,
  one rotation per round on two close sightings or a heard arming), bots: routes, holds, pre-aim
  edge for still holders, hearing (muffled through walls), stop-the-disarm, retake (nearest disarms,
  others cover), lobbed grenades with solved launch speed, team radio lines from real events
  (contacts by place name, holding X, heard footsteps/gunfire at X, go/rotate calls).
  All-bot balance: attackers win ~45% (9 seeds x 30 min).
- C4: salt-coast palette, canvas textures (formwork concrete, lane-tinted cladding, salt slabs,
  steel crates), stencilled signs at entrances, warm lamps, brine pans, hazard edging, skyline,
  PMREM environment light, bullpup/two-tone guns, team-readable soldiers, hero Fuse Core, smoke clouds.
- C5: sim/ has no three.js/DOM; one state; event ring; pooled effects; A* scratch object; HUD
  write-on-change; shots.js loaded by dynamic import only for ?shot/?test.

## Screenshots (retake LAST before each commit; `node tools/check-shots.mjs` checks freshness)
- 1 cover: `?shot=1&seed=9` (Conveyor Court firefight; real frag kills in the feed)
- 2 buy menu: `?shot=2&seed=7`; 3 arming on B under a smoke: `?shot=3&seed=7`;
  4 retake won, round end: `?shot=4&seed=7`. Names: 1-firefight.jpg .. 4-round-won.jpg (shots.json).

## Decisions vs DESIGN.md (sibling entry's design)
- Kept the ASCII grid map + grid A* (works, validated by tools/sightlines.mjs) instead of a node graph;
  routes/holds are named waypoints in the grid.
- Kept sim/ render/ ui/ layout (no core/ai split) but split team plans into sim/coach.js.
- Names are our own; tools/check-names.mjs bans CS names/callouts, the sibling's names and words
  crowded in the field (Wardens, -line titles, Yard, Kestrel...).
- Source budget: target was 145 KiB; the hard rule we hold is budget PASS (every file shown, no
  cut line). Reaching 145 KiB would mean dropping the radio/callouts, skyline or comments that
  explain the rules.

## How to test
- Serve: `python3 -m http.server 8792 --bind 127.0.0.1 --directory game` (background).
- `node tools/simtest.mjs [seed] [minutes] --bots` (balance TALLY), `node tools/sightlines.mjs`.
- `tools/playtest.sh [seed]` (12 checks, fails on console errors).
- `tools/shoot.sh "?shot=N&seed=S" /abs/out.jpg`; `node tools/check-shots.mjs`.
- `node tools/check-names.mjs`; `node tools/budget.mjs [KiB]` (dossier order, fails on any cut).
- Package: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` twice, compare sha256.

## Known issues / next
- Audio (WebAudio synth) not built; HUD and comments do not claim it.
- Bots sometimes over-chatty on radio; fine for evidence.
