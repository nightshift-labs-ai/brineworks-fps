// Originality check: fails if any judged file in game/ (everything but vendor/ and *.min.js) uses a
// name from a commercial shooter, a well-known map callout, or a name of the sibling entry.
// usage: node tools/check-names.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../game', import.meta.url).pathname;
// Whole words, any case.
const WORDS = [
  'ak', 'ak-47', 'm4', 'm4a1', 'awp', 'glock', 'deagle', 'desert eagle', 'usp', 'kevlar', 'c4', 'spike', 'terrorists?',
  'counter-terrorists?', 'counter-strike', 'dust', 'dust2', 'mirage', 'inferno', 'nuke', 'overpass', 'ancient', 'anubis',
  'vertigo', 'fire in the hole', 'bomb has been planted', 'long', 'short', 'catwalk', 'mid', 'mid doors', 'tunnels?',
  'banana', 'apartments', 'apps', 'heaven', 'hell', 'pit', 'connector', 'jungle', 'palace', 'ramp', 'goose', 'xbox',
  'pillar', 'market',
  // the sibling entry's names
  'cinder', 'tidewatch', 'lockmere', 'kestrel', 'heron', 'osprey', 'swift', 'shard', 'veil', 'glare', 'cutter',
  'plate vest', 'anvil', 'bramble', 'tallow', 'moth', 'sable', 'kiln', 'soot', 'hale', 'wren', 'orca', 'lumen', 'pike',
  // names crowded in this contest's field (operator's survey) and famous game characters: keep ours distinct
  'wardens?', 'watch', 'armour\\+helm', 'evaporator hall', 'hall gate', 'dock gate', 'quay', 'rook', 'vale', 'harrow', 'tamsin', 'pell', 'morrow', 'marrow', 'ilse', 'ilsa', 'sorrel',
  'craddock', 'wick', 'quill', 'talan', 'nessa', 'kael', 'lancer', 'halberd', 'halyard', 'hornet', 'tamper', 'helios', 'rivet',
  'ballast', 'vultures?', 'saltline', 'cinderline', 'dustline', 'sandline', 'yard', 'depot', 'foundry', 'ember',
];
const CARTRIDGE = /(?<![\d.])\.(338|308|50|45|22)\b|\b(5\.56|7\.62)\b|\b9 ?mm\b/i; // real cartridge names, not decimals
const CASED = ['CT', 'de_']; // exact case (CT as a word, de_ as a map prefix)
const word = new RegExp(`\\b(${WORDS.join('|')})\\b`, 'i');
const cased = new RegExp(`\\bCT\\b|\\bde_[a-z]`);
const windowWord = /(?<![.\w])Window\b/; // the callout; the DOM's window object is fine

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'vendor') yield* files(path); }
    else if (!name.endsWith('.min.js')) yield path;
  }
}

let bad = 0;
for (const path of files(root)) {
  readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
    const m = line.match(word) ?? line.match(cased) ?? line.match(windowWord) ?? line.match(CARTRIDGE);
    if (m) { bad++; console.log(`${relative(root, path)}:${i + 1}: "${m[0]}"  ${line.trim().slice(0, 100)}`); }
  });
}
console.log(bad ? `FAIL: ${bad} banned name(s)` : `OK: no banned names (${WORDS.length + CASED.length + 1} patterns)`);
process.exit(bad ? 1 : 0);
