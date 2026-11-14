// Source budget: packages the game with main.ts, then lists each source file in the order the
// judge's dossier shows it (index.html, then the pre-order import walk, then the rest by path),
// with a running total. Fails when the dossier hides anything or the source passes the limit.
// usage: node tools/budget.mjs [limitKiB=150]
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname;
const limit = Number(process.argv[2] ?? 150) * 1024;
const out = join(repo, 'out');
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [join(repo, 'main.ts')], { env: { ...process.env, MAKEFUN_OUTPUT_DIR: out }, stdio: 'ignore' });
const text = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8')).text;
const textBytes = Buffer.byteLength(text);
let total = 0;
for (const m of text.matchAll(/^### (\S+) \((\d+) lines, (\d+) bytes\)$/gm)) {
  total += Number(m[3]);
  console.log(`${String(m[3]).padStart(7)} ${String(total).padStart(8)}  ${m[1]}`);
}
const hidden = text.split('\n').filter((l) => /^\[.*(not shown|left out)/.test(l));
console.log(`\nsource ${total} bytes (${(total / 1024).toFixed(1)} KiB), dossier text ${textBytes} of 163840 bytes, limit ${limit / 1024} KiB`);
for (const l of hidden) console.log(`HIDDEN: ${l}`);
if (hidden.length || total > limit) { console.log('FAIL'); process.exit(1); }
console.log('OK');
