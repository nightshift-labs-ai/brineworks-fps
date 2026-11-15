// Fails when any screenshot is older than the newest file under game/ (retake them last), or when
// one breaks the gate's rules (3-4 files, PNG/JPEG, <= 256 KiB, long side <= 1280, short side >= 480).
// usage: node tools/check-shots.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname;
let newest = 0, newestFile = '';
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.mtimeMs > newest) { newest = st.mtimeMs; newestFile = p; }
  }
})(join(repo, 'game'));
const shots = readdirSync(join(repo, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
let bad = shots.length < 3 || shots.length > 4 ? [`${shots.length} screenshots (need 3-4)`] : [];
for (const name of shots) {
  const p = join(repo, 'screenshots', name), buf = readFileSync(p), st = statSync(p);
  let w = 0, h = 0;
  if (buf[0] === 0x89) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
  else for (let i = 2; i < buf.length;) { // JPEG: find the SOF marker
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
    i += 2 + len;
  }
  if (st.mtimeMs < newest) bad.push(`${name} is older than ${newestFile.slice(repo.length)}`);
  if (buf.length > 262144) bad.push(`${name} is ${buf.length} bytes`);
  if (Math.max(w, h) > 1280 || Math.min(w, h) < 480) bad.push(`${name} is ${w}x${h}`);
  console.log(`${name}  ${w}x${h}  ${buf.length} bytes`);
}
for (const b of bad) console.log('FAIL: ' + b);
console.log(bad.length ? 'FAIL' : 'OK');
process.exit(bad.length ? 1 : 0);
