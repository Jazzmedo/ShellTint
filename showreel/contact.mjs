// Contact sheet: one frame per beat, tiled for review.
// node contact.mjs  ->  render/thumbs/*.png + render/sheet-1.png, sheet-2.png

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const FILM = arg('film') ?? 'index', DUR = Number(arg('dur') ?? 30);
const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const THUMBS = path.join(HERE, 'render/thumbs');
mkdirSync(THUMBS, { recursive: true });

import http from 'node:http';
import { readFile } from 'node:fs/promises';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  res.end(await readFile(p));
});
await new Promise(r => server.listen(8322, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: '/usr/local/bin/helium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:8322/showreel/film/${FILM}.html`);
await page.evaluate(() => window.filmReady);

const times = [];
for (let b = 0; b < DUR * 2; b++) times.push(b * 0.5);
times.push(DUR - 0.1);
for (let i = 0; i < times.length; i++) {
  await page.evaluate(tt => window.seek(tt), times[i]);
  await page.screenshot({ path: path.join(THUMBS, `${String(i).padStart(2, '0')}.png`) });
}
await browser.close();
server.close();

// two sheets of 30 (6x5), thumbs scaled to 480x270
for (let s = 0; s < 2; s++) {
  const from = s * 30, count = Math.min(30, times.length - from);
  const inputs = [];
  let concat = '';
  for (let i = 0; i < count; i++) {
    inputs.push('-i', path.join(THUMBS, `${String(from + i).padStart(2, '0')}.png`));
    concat += `[${i}:v]`;
  }
  await exec('ffmpeg', ['-y', ...inputs, '-filter_complex',
    `${concat}concat=n=${count}:v=1:a=0,scale=480:270,tile=6x5[out]`,
    '-map', '[out]', '-frames:v', '1',
    path.join(HERE, `render/sheet-${s + 1}.png`)], { cwd: HERE });
}
console.log('sheets written: render/sheet-1.png, render/sheet-2.png');
