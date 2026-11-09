// Render the film: node render.mjs [--fps=60] [--start=0] [--end=30] [--out=render/frames]
// Serves the repo root over http (so film/ can fetch beats.json and the repo fonts),
// then paints every frame through window.seek(t) and screenshots it.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';


const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');            // repo root
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [, k, v] = a.match(/^--([a-z]+)=(.*)$/) || [];
  return k ? [k, v] : [];
}));
const FPS = Number(args.fps ?? 60);
const START = Number(args.start ?? 0);
const END = Number(args.end ?? 30);
const OUT = path.join(HERE, args.out ?? 'render/frames');

const server = http.createServer(async (req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  res.end(await readFile(p));
});
await new Promise(r => server.listen(8321, '127.0.0.1', r));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/local/bin/helium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

await page.goto(`http://127.0.0.1:8321/showreel/film/${args.film ?? 'index'}.html`);
await page.evaluate(() => window.filmReady);
console.log('film ready');

const n0 = Math.round(START * FPS), n1 = Math.round(END * FPS);
const t0 = Date.now();
for (let n = n0; n < n1; n++) {
  const t = n / FPS;
  await page.evaluate(tt => window.seek(tt), t);
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(5, '0')}.png`) });
  if ((n - n0) % 60 === 0) {
    const rate = (n - n0 + 1) / ((Date.now() - t0) / 1000);
    console.log(`frame ${n}/${n1}  (${rate.toFixed(1)} fps)`);
  }
}
await browser.close();
server.close();
console.log(`done: ${n1 - n0} frames -> ${OUT}`);
