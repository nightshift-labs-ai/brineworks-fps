# NOTES (working log for the build agent)

## Status
- M1 done: plumbing (LICENSE, main.ts, vendored three.js + makefun-threejs.ts, import map), complete
  small game: pointer-lock look, WASD/jump/crouch/walk with acceleration + friction + collision,
  pistol/SMG/rifle with spread, recoil pattern, magazine/reserve/reload, head/torso/leg hitboxes,
  5v5 bots (routes, holds, sight, hearing, bursts), rounds (freeze, clock, elimination/time),
  halves + match restart, economy + basic buy menu, HUD (health, armour, ammo, clock, score, pips,
  kill feed, radar, hit marker, damage direction), staged screenshots 1-3 (temporary).

## Next
- M2: kill feed exists; add damage numbers? recoil feedback polish, viewmodel look, walk/crouch accuracy tuning.
- M3: Fuse Core plant/defuse at A/B, plant/defuse timers, bomb carrier, bot objective play,
  grenades (frag + smoke), more weapons (shotgun, marksman), rotations on sound/callouts.
- M4: art pass, audio (WebAudio), title/round-end polish, final screenshots.
- M5: code review vs criterion 5, judge guide update.

## Known issues
- Round banner overlaps the scoreboard when both show.
- Pistol viewmodel reads as a dark block; needs lighting/scale work.

## How to test
- Serve: `python3 -m http.server 8792 --bind 127.0.0.1 --directory game` (background).
- Sim only: `node tools/simtest.mjs [seed] [minutes]`; map check: `node tools/sightlines.mjs`.
- Browser play test: `tools/playtest.sh [seed]` (12 checks, fails on console errors).
- Screenshot: `tools/shoot.sh "?shot=1&seed=7" /abs/path/out.jpg`.
- Package: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` twice, compare dossier bytes.

## Source budget (judge reads 160 KiB of source text)
- M1 total: 128 KB of source (index.html first). Keep the final total under ~155 KB: compact CSS,
  short comments, no duplicated helpers. Check with the package step (dossier "Source files" line).
