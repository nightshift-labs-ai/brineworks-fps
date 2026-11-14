// Saltline packager (Node 22, standard library + the kit's vendor/makefun-threejs.ts only).
// Copies the static game (game/) and its screenshots (screenshots/) into the output directory
// and writes dossier.json with make.fun's buildDossier. Same input, same bytes, every run:
// stale copies from an earlier run are removed first so nothing extra leaks into the output.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyFresh(name: string): void {
  const from = join(repo, name);
  const to = join(outDir, name);
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
copyFresh('game');
copyFresh('screenshots');

// The scorer's caps: text_max_bytes shapes the dossier text; the others refuse what the gate would refuse.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`dossier.json: ${dossier.length} bytes -> ${outDir}`);
