// The scroll script. One entry per resting point: the clock plays to `t` (the moment the scene is fully on
// screen), then holds there for HOLD_VH of scrolling so it can be read before the next wipe.
// `t` is seconds on the film's global timeline (see Film in reel.jsx).
export const HOLD_VH = 30;
const playVh = dt => 22 + 14 * dt;

export const CHAPTERS = ['Hook', 'Your desktop', 'How it works', 'What you get', 'Good to know', 'Your turn', 'Install', 'Done'];

// [chapter index, t, caption]
const RAW = [
  [0, 1.35, 'ShellTint colours your browser with your desktop’s colours.'],
  [0, 2.85, 'Your desktop shell builds a full colour palette from your wallpaper.'],
  [0, 3.95, 'Your browser ignores it. ShellTint fixes that.'],
  [1, 4.8, 'It reads GNOME and KDE Plasma colours…'],
  [1, 6.0, '…and shell themes: Dux Shell (formerly DMS), Caelestia, Noctalia and end-4…'],
  [1, 6.95, '…or any pywal or matugen colour file. It finds the right one automatically.'],
  [2, 8.0, '1 · Read. A small helper on your computer reads the palette your shell wrote.'],
  [2, 9.3, '2 · Expand. Five colours become a full set of Material colours.'],
  [2, 10.4, '3 · Recolour. Catppuccin’s website styles are rebuilt with your palette.'],
  [2, 11.75, 'The shell writes its colours to a file when you change theme.'],
  [2, 12.6, 'The helper, a small Python program, watches that file and expands it.'],
  [2, 13.45, 'The builder recompiles Catppuccin’s website styles with your palette.'],
  [2, 14.3, 'Palette and styles stay in ~/.cache/shelltint. Nothing leaves your computer.'],
  [2, 15.15, 'The extension asks the helper for them through the browser’s native messaging.'],
  [2, 16.0, 'It colours the toolbar (Firefox) and the pages you open, no reload needed.'],
  [2, 16.9, 'Change your wallpaper and the whole chain runs again in about a second.'],
  [3, 18.68, 'Firefox-based browsers: the toolbar, tabs and menus take your shell’s colours.'],
  [3, 20.05, '130+ websites restyled: YouTube, GitHub, X, Reddit, Wikipedia and more.'],
  [3, 20.75, 'Change the wallpaper in your shell…'],
  [3, 21.65, '…and the toolbar and every open tab recolour within seconds…'],
  [3, 22.6, '…with no reload and nothing to click.'],
  [4, 24.0, 'ShellTint collects no data. Everything is read and built on your computer.'],
  [4, 25.5, 'Add your own CSS per site, back up and restore, and light and dark follow your shell.'],
  [5, 27.5, 'Your turn: pick a palette and watch the colours change.'],
  [6, 30.5, 'Step 1: run the installer. It sets up the helper and lets the extension into your browsers.'],
  [6, 31.6, 'Step 2: install the extension, from addons.mozilla.org or the Chromium zip.'],
  [6, 32.8, 'Step 3: restart the browser. Settings → Overview should say the helper is connected.'],
  [7, 36.0, 'ShellTint by Jazzmedo. MIT licence.'],
];

export const BEATS = RAW.map(([chapter, t, caption]) => ({ chapter, t, caption }));

// Scroll segments, in vh: [t from, t to, length]. Play to each beat, then hold.
const SEGMENTS = [];
let prev = 0;
const starts = [];   // vh at which each beat's hold begins (the clock has just reached beat.t)
let total = 0;
for (const b of BEATS) {
  SEGMENTS.push([prev, b.t, playVh(b.t - prev)]);
  total += SEGMENTS.at(-1)[2];
  starts.push(total);
  SEGMENTS.push([b.t, b.t, HOLD_VH]);
  total += HOLD_VH;
  prev = b.t;
}
export const TOTAL_VH = total;
export const BEAT_VH = starts;

// Scroll progress 0..1 across the pinned range → film time.
export function warp(progress) {
  let v = progress * TOTAL_VH;
  for (const [a, b, h] of SEGMENTS) {
    if (v <= h) return a + ((b - a) * v) / h;
    v -= h;
  }
  return BEATS.at(-1).t;
}

// Index of the beat a given film time belongs to (the next resting point at or after t).
export function beatAt(t) {
  const i = BEATS.findIndex(b => t <= b.t + 1e-6);
  return i === -1 ? BEATS.length - 1 : i;
}
