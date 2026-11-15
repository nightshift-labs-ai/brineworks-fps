// Capture staged screenshots: node tools/shoot.mjs <url> <out.jpg> [quality]
// Injects tools/stage.js into the page, waits for window.__shotReady (set by it), prints renderer and console errors.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/agent/makefun-tools/node_modules/')('playwright');
const [url, out, quality = '80'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__brineworks, null, { timeout: 60000 });
await page.addScriptTag({ path: new URL('stage.js', import.meta.url).pathname, type: 'module' }); // stages the scene
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000, polling: 250 }).catch((e) => errors.push('not ready: ' + e.message));
await page.waitForTimeout(300);
await page.screenshot({ path: out, type: out.endsWith('.png') ? 'png' : 'jpeg', quality: out.endsWith('.png') ? undefined : +quality });
console.log(JSON.stringify({ ms: Date.now() - t0, errors: errors.slice(0, 12) }));
await browser.close();
