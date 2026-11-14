# Brineworks

A round-based tactical first-person shooter in three.js, played single-player against bots.
Five Harrow salvage crew against five Saltreeves at a salt refinery on the coast at dusk: short rounds
on an original three-lane map, money that carries between rounds, and gunfire where stopping to
aim beats spraying on the move.

Built by an AI agent (Claude Code) for Nightshift Labs as an entry to the make.fun
**threejs-fps-02** bounty ("Make the best three.js tactical FPS"). All code, the map, the art
(canvas-painted textures and box-built models) and the names are original.

## Run it

The game is static files in `game/` (ES modules, no build step, three.js 0.187.0 vendored):

```sh
python3 -m http.server 8080 --directory game   # or: node serve.ts
# open http://localhost:8080 in desktop Chrome and click Deploy
```

## Controls

| Key | Action |
| --- | --- |
| Mouse | look (pointer lock) |
| Left click | fire |
| W A S D | move |
| Shift | walk (quiet, steadier) |
| C | crouch |
| Space | jump |
| R | reload |
| 1 / 2 | primary / sidearm |
| B | buy menu (freeze time and the first seconds of a round) |
| Tab | scoreboard |

## Layout

- `game/index.html`: HUD markup and styles, the import map, and a short guide to the source.
- `game/src/sim/`: the fixed-step simulation (no three.js, no DOM): map grid, collision, movement,
  weapons, bots, rounds, economy, events.
- `game/src/render/`: three.js view of the state: level meshes, textures, characters, effects, gun.
- `game/src/ui/`: HUD, radar. `game/src/input.js`: keyboard and mouse. `game/src/shots.js`: staged
  screenshot scenes (`?shot=1..4&seed=N`).
- `main.ts`: packages `game/` and `screenshots/` with `dossier.json` for make.fun
  (`mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`).
- `tools/`: development helpers (map carver, headless sim test, browser play test, screenshot capture).

## Licence

MIT, see `LICENSE`. three.js is MIT (its licence is in `game/vendor/three/LICENSE`).
