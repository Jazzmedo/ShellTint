// Copied from the `showreel` branch (film/reel.jsx) and driven by scroll instead of render.mjs.
// ShellTint 20s motion reel. Every style is derived from one motion value
// holding the current time, so a frame depends only on t (render.mjs seeks it).
// Clock-driven props (animate, initial, AnimatePresence, layout) are not used.
import { createContext, useContext, useState } from 'react';
import { motion, useTransform, useMotionValueEvent, easeInOut } from 'framer-motion';
import { time } from './time.js';

// Scenes read their clock from context, so a scene can be moved on the timeline with <Shift> without editing its own times.
const Clock = createContext(time);
export const useT = fn => useTransform(useContext(Clock), fn);
export function Shift({ by, children }) {
  const local = useTransform(useContext(Clock), t => t - by);
  return <Clock.Provider value={local}>{children}</Clock.Provider>;
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
const inOutQuart = p => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2);
export const outExpo = p => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const outCubic = p => 1 - (1 - p) ** 3;

// Closed-form spring: deterministic, no per-frame integration.
export function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}
// A value with several targets over time = one spring per change.
function track(t, keys, k = 170, d = 26) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}
function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const mix = (a, b, p) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], p))).join(',')})`; };

export const MONO = '"JetBrains Mono", "JetBrainsMono Nerd Font", monospace';
export const P = {
  // dusk, ocean, ember and grey tell the film's own story; the last four are the palettes the visitor can pick.
  dusk: { ink: '#15131c', panel: '#221e2e', violet: '#6a4fd8', lilac: '#b8a4f4', peach: '#f2a68a', cream: '#fbebd8' },
  grey: { ink: '#e3e3e6', panel: '#cfcfd4', violet: '#a9a9b0', lilac: '#bcbcc2', peach: '#9a9aa1', cream: '#3a3a40' },
  ocean: { ink: '#0c1b22', panel: '#14303a', violet: '#1f7a8c', lilac: '#7fd1c7', peach: '#f4d35e', cream: '#eaf6f2' },
  ember: { ink: '#1d110e', panel: '#331d17', violet: '#b3402a', lilac: '#e88a5a', peach: '#9fd08a', cream: '#fbeee0' },
  mocha: { ink: '#1e1e2e', panel: '#313244', violet: '#cba6f7', lilac: '#b4befe', peach: '#fab387', cream: '#cdd6f4' },
  gruvbox: { ink: '#282828', panel: '#3c3836', violet: '#d3869b', lilac: '#83a598', peach: '#fe8019', cream: '#ebdbb2' },
  tokyo: { ink: '#1a1b26', panel: '#24283b', violet: '#7aa2f7', lilac: '#bb9af7', peach: '#ff9e64', cream: '#c0caf5' },
  jozi: { ink: '#0f1424', panel: '#1b2238', violet: '#e63e8b', lilac: '#4cc9f0', peach: '#ffb703', cream: '#f1e9da' },
};
export const KEYS = Object.keys(P.dusk);
export function usePal(stops, delay = 0) {
  const clock = useContext(Clock);
  const ts = stops.map(s => s[0] + delay), out = {};
  for (const k of KEYS) out[k] = useTransform(clock, ts, stops.map(s => s[1][k]), { ease: easeInOut }); // eslint-disable-line
  return out;
}
export const abs = (left, top, width, height, rest) => ({ position: 'absolute', left, top, width, height, ...rest });

// ---------- building blocks ----------

// Springs in from an offset.
export function Rise({ at, y = 40, x = 0, from = 1, k = 170, d = 22, style, children }) {
  const opacity = useT(t => seg(t, at, at + 0.12));
  const ty = useT(t => y * (1 - spring(t - at, k, d)));
  const tx = useT(t => x * (1 - spring(t - at, k, d)));
  const scale = useT(t => lerp(from, 1, spring(t - at, k, d)));
  return <motion.div style={{ ...style, opacity, y: ty, x: tx, scale }}>{children}</motion.div>;
}

// Kinetic type: every character rises out of its own mask.
export function Chars({ text, at, size, color = P.dusk.cream, weight = 900, stagger = 0.028, k = 230, d = 21, style }) {
  return (
    <motion.div style={{ fontSize: size, fontWeight: weight, color, lineHeight: 1.0, letterSpacing: '-0.04em', whiteSpace: 'nowrap', ...style }}>
      {[...text].map((c, i) => <Char key={i} c={c} at={at + i * stagger} k={k} d={d} />)}
    </motion.div>
  );
}
function Char({ c, at, k, d }) {
  const y = useT(t => `${(1 - spring(t - at, k, d)) * 118}%`);
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.14em', marginBottom: '-0.14em', whiteSpace: 'pre' }}>
      <motion.span style={{ display: 'inline-block', y }}>{c}</motion.span>
    </span>
  );
}

// Scenes iris open from a point; later scenes sit above earlier ones.
const MAXR = 2300;
export function Scene({ a, b, enter, bg = P.dusk.ink, children }) {
  const visibility = useT(t => (t >= a && t < b + 0.7 ? 'visible' : 'hidden'));
  const clipPath = useT(t => {
    if (!enter) return 'none';
    const p = inOutQuart(seg(t, a, a + 0.6));
    return p >= 1 ? 'none' : `circle(${p * MAXR}px at ${enter[0]}px ${enter[1]}px)`;
  });
  // Only scenes near the playhead are mounted: the others have no motion values updating every frame.
  const clock = useContext(Clock);
  const near = t => t >= a - 2 && t < b + 1;
  const [on, setOn] = useState(() => near(clock.get()));
  useMotionValueEvent(clock, 'change', t => setOn(prev => (prev === near(t) ? prev : !prev)));
  // The extra fill layer lets the scene's colour run past the 16:9 frame inside the wipe, so no rectangle shows in wide or tall windows.
  return <motion.div style={{ ...abs(0, 0, 1920, 1080, { background: bg, isolation: 'isolate' }), visibility, clipPath }}><motion.div style={{ position: 'absolute', inset: -3000, background: bg }} />{on && children}</motion.div>;
}
export function IrisRing({ a, x, y, color }) {
  const R = t => inOutQuart(seg(t, a, a + 0.6)) * MAXR;
  const size = useT(t => 2 * R(t)), px = useT(t => x - R(t)), py = useT(t => y - R(t));
  const opacity = useT(t => (t >= a && t < a + 0.55 ? 1 - seg(t, a + 0.3, a + 0.55) : 0));
  return <motion.div style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, x: px, y: py, borderRadius: '50%', border: `18px solid ${color}`, opacity, pointerEvents: 'none' }} />;
}
// Expanding outline pulse.
export function Ping({ at, x, y, color, max = 900, dur = 0.7, w = 6 }) {
  const R = t => max * outExpo(seg(t, at, at + dur));
  const size = useT(t => 2 * R(t)), px = useT(t => x - R(t)), py = useT(t => y - R(t));
  const opacity = useT(t => (t >= at && t < at + dur ? 1 - seg(t, at, at + dur) : 0));
  return <motion.div style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, x: px, y: py, borderRadius: '50%', border: `${w}px solid ${color}`, opacity, pointerEvents: 'none' }} />;
}

// `bleed` lets the wallpaper run past the 1920x1080 frame, for the full-window scene.
export function Wallpaper({ pal, bleed }) {
  const w = bleed ? 3000 : 0;
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%" preserveAspectRatio="xMidYMax slice" style={{ display: 'block', overflow: bleed ? 'visible' : 'hidden', clipPath: bleed ? 'inset(0 -3000px)' : undefined }}>
      <motion.rect x={-w} width={1920 + 2 * w} height="1080" style={{ fill: pal.ink }} />
      {[['violet', 1000], ['lilac', 700], ['peach', 430], ['cream', 220]].map(([c, r]) => (
        <motion.circle key={c} cx="1180" cy="1000" r={r} style={{ fill: pal[c] }} />
      ))}
      <motion.path d={`M${-w} 860 H0 C320 760 620 900 960 850 S1600 760 1920 860 H${1920 + w} V1080 H${-w}Z`} style={{ fill: pal.panel }} />
      <motion.path d={`M${-w} 960 H0 C420 880 760 1010 1180 950 S1720 930 1920 980 H${1920 + w} V1080 H${-w}Z`} style={{ fill: pal.ink }} />
    </svg>
  );
}

// Schematic page layouts as [left, top, width, height, colour] in percent.
const grid = (cols, rows, x, y, w, h, gx, gy, colors) => Array.from({ length: cols * rows }, (_, i) =>
  [x + (i % cols) * (w + gx), y + Math.floor(i / cols) * (h + gy), w, h, colors[i % colors.length]]);
const lines = (x, y, w, n, step, c = 'violet') => Array.from({ length: n }, (_, i) => [x, y + i * step, w - (i * 7) % 18, 3.2, c]);
const MOCKS = {
  video: [[0, 0, 100, 11, 'panel'], [36, 3, 28, 5, 'ink'],
    ...grid(3, 2, 4, 16, 28.6, 26, 3.1, 14, ['violet', 'lilac', 'peach']),
    ...grid(3, 2, 4, 44, 22, 3.2, 9.7, 40, ['cream'])],
  code: [[0, 0, 100, 11, 'panel'], [4, 3, 16, 5, 'lilac'], [4, 18, 66, 8, 'panel'], [4, 28, 66, 1.4, 'violet'],
    ...lines(6, 34, 58, 8, 7.4), [75, 18, 21, 3.2, 'cream'], ...lines(75, 26, 21, 4, 6.5, 'lilac'),
    [75, 58, 7, 3.4, 'peach'], [82, 58, 8, 3.4, 'lilac'], [90, 58, 6, 3.4, 'violet']],
  feed: [[0, 0, 22, 100, 'panel'], ...lines(4, 12, 15, 6, 12, 'lilac'),
    ...[0, 1].flatMap(i => { const y = 8 + i * 46; return [[28, y, 5, 8, 'peach'], [35, y + 1, 26, 3.2, 'cream'], [35, y + 8, 50, 3.2, 'lilac'], [35, y + 15, 56, 22, i ? 'lilac' : 'violet']]; })],
  wiki: [[4, 6, 40, 7, 'cream'], [4, 16, 66, 0.8, 'lilac'], ...lines(4, 22, 66, 11, 6.2),
    [74, 6, 22, 70, 'panel'], [77, 10, 16, 26, 'violet'], ...lines(77, 42, 16, 4, 7, 'lilac')],
};
export function SiteMock({ kind, pal }) {
  return (
    <motion.div style={{ position: 'absolute', inset: 0, background: pal.ink }}>
      {MOCKS[kind].map(([l, t, w, h, c], i) => (
        <motion.div key={i} style={{ position: 'absolute', left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, borderRadius: 5, background: pal[c] }} />
      ))}
    </motion.div>
  );
}
export function Browser({ pal, w, h, url, tab, kind }) {
  return (
    <motion.div style={{ width: w, height: h, borderRadius: 22, overflow: 'hidden', background: pal.ink, display: 'flex', flexDirection: 'column' }}>
      <motion.div style={{ height: 66, background: pal.violet, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '0 22px', flex: 'none' }}>
        {[tab, 'Docs', 'Music'].map((t, i) => (
          <motion.div key={t} style={{ width: 250, height: 52, borderRadius: '14px 14px 0 0', background: i ? 'transparent' : pal.panel, color: pal.cream, fontSize: 25, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 13, padding: '0 20px' }}>
            <motion.span style={{ width: 16, height: 16, borderRadius: 8, background: pal.peach }} />{t}
          </motion.div>
        ))}
      </motion.div>
      <motion.div style={{ height: 72, background: pal.panel, display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px', flex: 'none' }}>
        {[0, 1, 2].map(i => <motion.span key={i} style={{ width: 30, height: 30, borderRadius: 15, background: pal.lilac }} />)}
        <motion.div style={{ flex: 1, height: 46, borderRadius: 23, background: pal.ink, color: pal.cream, fontFamily: MONO, fontSize: 25, display: 'flex', alignItems: 'center', padding: '0 26px' }}>{url}</motion.div>
        <motion.span style={{ width: 30, height: 30, borderRadius: 8, background: pal.peach }} />
      </motion.div>
      <div style={{ position: 'relative', flex: 1 }}><SiteMock kind={kind} pal={pal} /></div>
    </motion.div>
  );
}

function Cursor({ x, y, scale }) {
  return (
    <motion.svg width="64" height="64" viewBox="0 0 24 24" style={{ position: 'absolute', left: 0, top: 0, x, y, scale, zIndex: 70, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.45))', transformOrigin: '3px 2px' }}>
      <path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.7 L11 13.3 L18 13 Z" fill={P.dusk.cream} stroke={P.dusk.ink} strokeWidth="1.4" strokeLinejoin="round" />
    </motion.svg>
  );
}

// ---------- A 0-1.5s: the icon's nine dots ----------
export const DOTS = [[344.47, 337.41, 40, 'violet'], [496.73, 337.41, 52.78, 'violet'], [677.02, 337.41, 68.03, 'violet'],
  [344.47, 509, 40, 'lilac'], [496.73, 509, 52.78, 'lilac'], [677.02, 509, 68.03, 'lilac'],
  [344.47, 680.59, 40, 'peach'], [496.73, 680.59, 52.78, 'peach'], [677.02, 680.59, 68.03, 'cream']];
const IS = 1.4;
const dotXY = ([cx, cy, r]) => [960 + (cx - 512) * IS, 540 + (cy - 512) * IS, r * IS];
const CREAM_DOT = dotXY(DOTS[8]);
function ADot({ d, i }) {
  const [x, y, r] = dotXY(d);
  const at = 0.12 + i * 0.08;
  const scale = useT(t => {
    const bob = t > 0.9 && t < 1.4 ? 1 + 0.12 * Math.sin((t - 0.9) * Math.PI * 4 - i * 0.7) * (1 - seg(t, 1.2, 1.4)) : 1;
    const out = i === 8 ? 1 : 1 - inOutQuart(seg(t, 1.25 + i * 0.015, 1.5));
    return spring(t - at, 260, 13) * bob * out;
  });
  return <motion.div style={{ ...abs(x - r, y - r, 2 * r, 2 * r, { borderRadius: '50%', background: P.dusk[d[3]] }), scale }} />;
}
function A() {
  return (
    <Scene a={0} b={1.5}>
      <Ping at={0.55} x={960} y={540} color={P.dusk.lilac} />
      <Ping at={1.05} x={960} y={540} color={P.dusk.peach} />
      {DOTS.map((d, i) => <ADot key={i} d={d} i={i} />)}
    </Scene>
  );
}

// ---------- B 1.5-4s: colour drains out of the page ----------
function Disc({ x, y, r, c, at, i }) {
  const fill = useTransform(time, [0, 2.85, 3.25], [c, c, '#cfcfd4'], { ease: easeInOut });
  const scale = useT(t => spring(t - at, 150, 12));
  const dy = useT(t => Math.sin(t * 1.7 + i * 2) * 16);
  return <motion.div style={{ ...abs(x - r, y - r, 2 * r, 2 * r, { borderRadius: '50%' }), background: fill, scale, y: dy }} />;
}
function B() {
  const violetText = useTransform(time, [0, 2.9, 3.25], [P.dusk.violet, P.dusk.violet, '#8d8d96'], { ease: easeInOut });
  return (
    <Scene a={1.5} b={4} enter={[CREAM_DOT[0], CREAM_DOT[1]]} bg={P.dusk.cream}>
      <Disc x={1680} y={250} r={310} c={P.dusk.violet} at={1.75} i={0} />
      <Disc x={1480} y={800} r={220} c={P.dusk.lilac} at={1.9} i={1} />
      <Disc x={1800} y={720} r={130} c={P.dusk.peach} at={2.05} i={2} />
      <div style={{ position: 'absolute', left: 110, top: 100 }}><Chars text="YOUR DESKTOP" at={1.7} size={190} color={P.dusk.ink} /></div>
      <div style={{ position: 'absolute', left: 110, top: 290, display: 'flex', gap: 48 }}>
        <Chars text="HAS" at={1.98} size={190} color={P.dusk.ink} />
        <Chars text="COLOUR." at={2.1} size={190} color={violetText} />
      </div>
      <div style={{ position: 'absolute', left: 110, top: 590 }}><Chars text="YOUR BROWSER" at={2.9} size={190} color="#8d8d96" /></div>
      <div style={{ position: 'absolute', left: 110, top: 780 }}><Chars text="DOESN'T." at={3.1} size={190} color="#8d8d96" /></div>
    </Scene>
  );
}

// ---------- C 4-7s: desktops first, then shells, then files ----------
function DeCard({ x, at, color, name, sub, tag }) {
  const rot = useT(t => -90 * (1 - spring(t - at, 170, 18)));
  const op = useT(t => seg(t, at, at + 0.08));
  return (
    <motion.div style={{ ...abs(x, 150, 520, 300, { background: color, borderRadius: 28, padding: '26px 34px', transformPerspective: 1400, transformOrigin: '0 50%' }), rotateY: rot, opacity: op }}>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: P.dusk.ink }}>{tag}</div>
      <div style={{ fontSize: 118, fontWeight: 900, letterSpacing: '-0.05em', color: P.dusk.ink, marginTop: 56, whiteSpace: 'nowrap' }}>
        {name}{sub && <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.02em', marginLeft: 16 }}>{sub}</span>}
      </div>
    </motion.div>
  );
}
export const chipStyle = { fontFamily: MONO, fontSize: 44, fontWeight: 600, color: P.dusk.cream, background: P.dusk.panel, border: `2px solid ${P.dusk.violet}`, borderRadius: 60, padding: '0 40px', height: 96, display: 'flex', alignItems: 'center' };
function Bar({ i }) {
  const at = 4.35 + i * 0.07;
  const h = useT(t => spring(t - at, 150, 15) * (150 + 130 * (0.5 + 0.5 * Math.sin(t * 4.2 + i * 1.3))));
  return <motion.div style={{ ...abs(1390 + i * 82, 0, 62, 0, { borderRadius: 14, background: P.dusk[['violet', 'lilac', 'peach', 'cream', 'violet'][i]], top: 'auto', bottom: 630, height: h }) }} />;
}
function DuxChip() {
  return <Rise at={4.85} y={34} style={chipStyle}>Dux Shell</Rise>;
}
function C() {
  const labelStyle = { fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: '0.12em', color: P.dusk.lilac };
  return (
    <Scene a={4} b={7} enter={[1500, 870]}>
      <Rise at={4.05} y={20} style={{ ...abs(120, 92, 900, 40), ...labelStyle }}>DESKTOP ENVIRONMENTS</Rise>
      <DeCard x={120} at={4.1} color={P.dusk.lilac} name="GNOME" tag="01" />
      <DeCard x={670} at={4.25} color={P.dusk.peach} name="KDE" sub="Plasma" tag="02" />
      {[0, 1, 2, 3, 4].map(i => <Bar key={i} i={i} />)}
      <Rise at={4.75} y={20} style={{ ...abs(120, 510, 900, 40), ...labelStyle }}>SHELLS</Rise>
      <div style={{ position: 'absolute', left: 120, top: 566, display: 'flex', gap: 18 }}>
        <DuxChip />
        {['Caelestia', 'Noctalia', 'end-4'].map((s, i) => <Rise key={s} at={4.93 + i * 0.08} y={34} style={chipStyle}>{s}</Rise>)}
      </div>
      <Rise at={6.0} y={20} style={{ ...abs(120, 746, 900, 40), ...labelStyle }}>OR A COLOUR FILE</Rise>
      <div style={{ position: 'absolute', left: 120, top: 800, display: 'flex', gap: 18 }}>
        {['pywal', 'matugen'].map((s, i) => <Rise key={s} at={6.05 + i * 0.08} y={34} style={chipStyle}>{s}</Rise>)}
      </div>
      <div style={{ position: 'absolute', left: 120, top: 930 }}><Chars text="Detected automatically." at={6.3} size={76} weight={800} stagger={0.014} color={P.dusk.cream} /></div>
    </Scene>
  );
}

// ---------- D 7-9.5s: read -> expand -> recolour, pushed in by vertical wipes ----------
function Stage({ a, b, first, children }) {
  const visibility = useT(t => (t >= a && t < b + 0.45 ? 'visible' : 'hidden'));
  const y = useT(t => (first ? 0 : 1080 * (1 - outExpo(seg(t, a, a + 0.4)))) - 1080 * inOutQuart(seg(t, b, b + 0.4)));
  return <motion.div style={{ ...abs(0, 0, 1920, 1080), visibility, y }}>{children}</motion.div>;
}
function Head({ a, n, word }) {
  return (
    <>
      <Rise at={a + 0.05} y={20} style={{ ...abs(116, 78, 400, 40), fontFamily: MONO, fontSize: 30, fontWeight: 700, color: P.dusk.peach, letterSpacing: '0.12em' }}>STEP 0{n} / 03</Rise>
      <div style={{ position: 'absolute', left: 110, top: 118 }}><Chars text={word} at={a + 0.1} size={250} /></div>
    </>
  );
}
const FILE = [['primary', '#6a4fd8', 'violet'], ['secondary', '#b8a4f4', 'lilac'], ['tertiary', '#f2a68a', 'peach'], ['surface', '#15131c', 'ink'], ['on_surface', '#fbebd8', 'cream']];
function FileLine({ row, i, a }) {
  const at = a + 0.3 + i * 0.1;
  const str = `${row[0].padEnd(12)}${row[1]}`;
  const text = useT(t => str.slice(0, Math.floor(seg(t, at, at + 0.22) * str.length)));
  const sw = useT(t => spring(t - at - 0.18, 300, 14));
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 92, fontFamily: MONO, fontSize: 46, color: P.dusk.cream, whiteSpace: 'pre' }}>
      <motion.span style={{ flex: 1 }}>{text}</motion.span>
      <motion.span style={{ width: 66, height: 66, borderRadius: 16, background: P.dusk[row[2]], border: '2px solid #6c618f', scale: sw }} />
    </div>
  );
}
function D1() {
  const a = 7.0;
  const scan = useT(t => 40 + 470 * seg(t, a + 0.3, a + 0.85));
  const scanOp = useT(t => (t > a + 0.3 && t < a + 0.9 ? 1 : 0));
  const wp = useT(t => spring(t - a - 0.55, 150, 17));
  return (
    <Stage a={a} b={8.2} first>
      <Head a={a} n={1} word="READ" />
      <Rise at={a + 0.2} y={60} style={abs(110, 450, 1000, 560, { background: P.dusk.panel, borderRadius: 30, padding: '34px 44px', overflow: 'hidden' })}>
        {FILE.map((r, i) => <FileLine key={r[0]} row={r} i={i} a={a} />)}
        <motion.div style={{ ...abs(0, 0, 1000, 8, { background: P.dusk.peach, boxShadow: `0 0 50px ${P.dusk.peach}` }), y: scan, opacity: scanOp }} />
      </Rise>
      <motion.div style={{ ...abs(1200, 450, 610, 560, { borderRadius: 30, overflow: 'hidden', border: '4px solid #6c618f' }), scale: wp, opacity: wp }}><Wallpaper pal={P.dusk} /></motion.div>
    </Stage>
  );
}
const TONES = ['violet', 'lilac', 'peach', 'cream', 'ink'];
const tone = (c, j) => { const p = j / 7; return p < 0.5 ? mix('#0b0a10', P.dusk[c], p * 2) : mix(P.dusk[c], '#ffffff', (p - 0.5) * 1.7); };
function ToneCell({ r, j, a }) {
  const at = a + 0.25 + (r + j) * 0.03;
  const scale = useT(t => spring(t - at, 260, 15));
  return <motion.div style={{ ...abs(110 + j * 108, 470 + r * 108, 96, 96, { borderRadius: 18, background: tone(TONES[r], j) }), scale }} />;
}
function D2() {
  const a = 8.2;
  return (
    <Stage a={a} b={9.4}>
      <Head a={a} n={2} word="EXPAND" />
      {TONES.flatMap((_, r) => Array.from({ length: 8 }, (__, j) => <ToneCell key={`${r}${j}`} r={r} j={j} a={a} />))}
      <div style={{ position: 'absolute', left: 1080, top: 560 }}>
        <Chars text="5 colours" at={a + 0.4} size={104} weight={800} stagger={0.012} color={P.dusk.lilac} />
        <Chars text="→ a full Material" at={a + 0.5} size={104} weight={800} stagger={0.012} style={{ marginTop: 14 }} />
        <Chars text="colour set." at={a + 0.6} size={104} weight={800} stagger={0.012} color={P.dusk.peach} style={{ marginTop: 14 }} />
      </div>
    </Stage>
  );
}
const TILE_C = ['violet', 'lilac', 'peach', 'cream', 'violet', 'lilac'];
function FlipTile({ c, r, a }) {
  const at = a + 0.2 + c * 0.014 + r * 0.035;
  const p = t => seg(t, at, at + 0.26);
  const sx = useT(t => Math.abs(Math.cos(p(t) * Math.PI)));
  const bg = useT(t => (p(t) < 0.5 ? '#3a3748' : P.dusk[TILE_C[(c + r) % 6]]));
  const op = useT(t => seg(t, a, a + 0.06));
  return <motion.div style={{ ...abs(110 + c * 108, 470 + r * 80, 96, 66, { borderRadius: 14 }), background: bg, scaleX: sx, opacity: op }} />;
}
function D3() {
  const a = 9.4;
  return (
    <Stage a={a} b={10.6}>
      <Head a={a} n={3} word="RECOLOUR" />
      {Array.from({ length: 6 }, (_, r) => Array.from({ length: 16 }, (__, c) => <FlipTile key={`${r}-${c}`} c={c} r={r} a={a} />))}
      <Rise at={a + 0.5} y={24} style={{ ...abs(110, 960, 1700, 50), fontFamily: MONO, fontSize: 34, color: P.dusk.lilac }}>Catppuccin's website styles, recoloured with your palette.</Rise>
    </Stage>
  );
}
function D() {
  return <Scene a={7} b={10.6} enter={[250, 200]}><D1 /><D2 /><D3 /></Scene>;
}

// ---------- E1 9.5-11s: a click paints a Firefox window ----------
function E1() {
  const k = t => spring(t - 9.55, 110, 17);
  const rx = useT(t => 14 * (1 - k(t))), ry = useT(t => -16 * (1 - k(t))), sc = useT(t => lerp(1.18, 1, k(t)));
  const clip = useT(t => `circle(${1900 * outExpo(seg(t, 10.35, 11.0))}px at 750px 370px)`);
  const cx = useT(t => track(t, [[0, 1560], [9.95, 960]], 90, 19)), cy = useT(t => track(t, [[0, 1040], [9.95, 560]], 90, 19));
  const cOp = useT(t => seg(t, 9.8, 9.95));
  const cs = useT(t => 1 - 0.16 * Math.sin(Math.PI * clamp((t - 10.3) / 0.16, 0, 1)));
  return (
    <Scene a={9.5} b={11} enter={[960, 900]}>
      <div style={{ position: 'absolute', left: 110, top: 86, display: 'flex', alignItems: 'center', gap: 28 }}>
        <Rise at={9.62} y={20} style={{ fontFamily: MONO, fontSize: 38, fontWeight: 800, color: P.dusk.ink, background: P.dusk.peach, borderRadius: 14, padding: '8px 24px' }}>FIREFOX</Rise>
        <Chars text="Toolbar, tabs & menus follow your shell." at={9.7} size={60} weight={800} stagger={0.016} />
      </div>
      <motion.div style={{ ...abs(210, 190, 1500, 790), rotateX: rx, rotateY: ry, scale: sc, transformPerspective: 1800 }}>
        <Browser pal={P.grey} w={1500} h={790} url="youtube.com" tab="YouTube" kind="video" />
        <motion.div style={{ position: 'absolute', inset: 0, clipPath: clip }}>
          <Browser pal={P.dusk} w={1500} h={790} url="youtube.com" tab="YouTube" kind="video" />
        </motion.div>
      </motion.div>
      <Ping at={10.35} x={960} y={560} color={P.dusk.cream} max={180} dur={0.55} w={8} />
      <motion.div style={{ opacity: cOp }}><Cursor x={cx} y={cy} scale={cs} /></motion.div>
    </Scene>
  );
}

// ---------- E2 11-12.5s: 130+ sites ----------
const SITES = [['YouTube', 'video'], ['GitHub', 'code'], ['X', 'feed'], ['Reddit', 'feed'], ['Wikipedia', 'wiki'], ['Stack Overflow', 'wiki'],
  ['Hacker News', 'wiki'], ['Twitch', 'video'], ['Gmail', 'feed'], ['DuckDuckGo', 'wiki'], ['npm', 'code'], ['MDN', 'wiki'],
  ['ChatGPT', 'feed'], ['LinkedIn', 'feed'], ['Spotify', 'video'], ['Bluesky', 'feed'], ['WhatsApp', 'feed'], ['Lobsters', 'wiki']];
const TW = 300, TH = 290, TG = 15;
function Tile({ name, kind, i }) {
  const c = i % 6, r = Math.floor(i / 6);
  const dist = Math.hypot(c - 2.5, (r - 1) * 1.4);
  const at = 11.35 + dist * 0.07;
  const pal = usePal([[at, P.grey], [at + 0.45, P.dusk]]);
  return (
    <Rise at={11.12 + dist * 0.03} y={30} from={0.88} style={abs(22 + c * (TW + TG), 90 + r * (TH + TG), TW, TH, { borderRadius: 18, overflow: 'hidden' })}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: TW, height: TH - 58 }}><SiteMock kind={kind} pal={pal} /></div>
      <motion.div style={{ position: 'absolute', left: 0, bottom: 0, width: TW, height: 58, background: pal.panel, color: pal.cream, fontSize: 30, fontWeight: 700, display: 'flex', alignItems: 'center', padding: '0 20px' }}>{name}</motion.div>
    </Rise>
  );
}
function E2() {
  const count = useT(t => { const p = outExpo(seg(t, 11.8, 12.3)); return `${Math.round(130 * p)}${p >= 1 ? '+' : ''}`; });
  return (
    <Scene a={11} b={12.5} enter={[960, 560]}>
      {SITES.map(([n, k], i) => <Tile key={n} name={n} kind={k} i={i} />)}
      <Rise at={11.7} y={0} from={1.45} k={260} d={19} style={abs(300, 340, 1320, 400, { background: P.dusk.ink, borderRadius: 44, border: `4px solid ${P.dusk.peach}`, display: 'flex', alignItems: 'center', padding: '0 56px', gap: 40 })}>
        <motion.div style={{ fontSize: 250, fontWeight: 900, letterSpacing: '-0.06em', color: P.dusk.peach, width: 600, fontVariantNumeric: 'tabular-nums' }}><motion.span>{count}</motion.span></motion.div>
        <div>
          <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: '-0.04em', color: P.dusk.cream, lineHeight: 1 }}>WEBSITES<br />RESTYLED.</div>
          <div style={{ fontFamily: MONO, fontSize: 32, color: P.dusk.lilac, marginTop: 22 }}>FIREFOX · CHROMIUM</div>
        </div>
      </Rise>
    </Scene>
  );
}

// ---------- F 12.5-15.5s: change the wallpaper, everything follows ----------
const CHANGE = [[12.5, P.dusk], [13.0, P.dusk], [13.35, P.ocean], [13.95, P.ocean], [14.3, P.ember], [14.9, P.ember], [15.25, P.dusk], [16, P.dusk]];
const THUMBS = [[90, P.dusk, 'dusk'], [270, P.ocean, 'ocean'], [450, P.ember, 'ember']];
const activeThumb = t => (t >= 13.0 && t < 13.95 ? 1 : t >= 13.95 && t < 14.9 ? 2 : 0);
function Thumb({ x, pal, name, i, wall }) {
  const border = useT(t => (activeThumb(t) === i ? 1 : 0));
  return (
    <Rise at={12.75 + i * 0.07} y={30} style={abs(x, 760, 160, 90)}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, overflow: 'hidden' }}><Wallpaper pal={pal} /></div>
      <motion.div style={{ position: 'absolute', inset: -6, borderRadius: 18, border: '4px solid', borderColor: wall.cream, opacity: border }} />
      <div style={{ position: 'absolute', left: 0, top: 100, fontFamily: MONO, fontSize: 24, fontWeight: 600, color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,.7)' }}>{name}</div>
    </Rise>
  );
}
function F() {
  const wall = usePal(CHANGE), bar = usePal(CHANGE, 0.08), chrome = usePal(CHANGE, 0.2), page = usePal(CHANGE, 0.32);
  const cx = useT(t => track(t, [[0, 700], [12.85, 640], [13.0, 340 - 640 + 640], [13.8, 520], [14.75, 160]], 220, 26));
  const cy = useT(t => track(t, [[0, 1000], [12.85, 820], [13.0, 820], [13.8, 820], [14.75, 820]], 220, 26));
  const bob = useT(t => Math.sin(t * 2.2) * 10);
  const rot = useT(t => -3 + Math.sin(t * 1.4) * 0.8);
  const badge = useT(t => `TABS RELOADED: 0`);
  return (
    <Scene a={12.5} b={15.5} enter={[1500, 900]} bg={wall.ink}>
      <div style={abs(0, 0, 1920, 1080)}><Wallpaper pal={wall} bleed /></div>
      <div style={{ position: 'absolute', left: 90, top: 80 }}><Chars text="NO RELOAD." at={12.75} size={210} stagger={0.012} color={wall.cream} /></div>
      <Rise at={12.85} y={60} style={abs(740, 350, 1100, 640)}>
        <motion.div style={{ rotate: rot, y: bob }}><Browser pal={chrome} w={1100} h={640} url="github.com" tab="GitHub" kind="code" /></motion.div>
      </Rise>
      {/* The bar's fill runs past the frame (sideways and down) so it reaches the window's edges. */}
      <motion.div style={{ ...abs(-3000, 1024, 7920, 3056), background: bar.panel }} />
      <motion.div style={{ ...abs(0, 0, 1920, 56), top: 1024, display: 'flex', alignItems: 'center', gap: 14, padding: '0 28px' }}>
        {[0, 1, 2, 3].map(i => <motion.span key={i} style={{ width: i ? 18 : 46, height: 18, borderRadius: 9, background: i ? bar.lilac : bar.peach }} />)}
        <motion.span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 26, color: bar.cream }}>{badge}</motion.span>
      </motion.div>
      {THUMBS.map(([x, pal, name], i) => <Thumb key={name} x={x} pal={pal} name={name} i={i} wall={wall} />)}
      <Ping at={13.0} x={345} y={805} color={P.dusk.cream} max={150} dur={0.5} w={8} />
      <Ping at={13.95} x={525} y={805} color={P.dusk.cream} max={150} dur={0.5} w={8} />
      <Ping at={14.9} x={165} y={805} color={P.dusk.cream} max={150} dur={0.5} w={8} />
      <Cursor x={cx} y={cy} scale={1} />
    </Scene>
  );
}

// Colours from the page palette (the picker sets these CSS variables), so the end of the film follows the choice.
const V = Object.fromEntries(KEYS.map(k => [k, `var(--${k})`]));
// ---------- H 17.5-20s: the nine dots fly home ----------
const TILE = { x: 180, y: 310, s: 460 };
function HDot({ d, i }) {
  const sc = TILE.s / 608.42;
  const fx = TILE.x + (d[0] - 207.79) * sc, fy = TILE.y + (d[1] - 207.79) * sc, r = d[2] * sc;
  const rnd = mulberry32(i * 977 + 13), ang = rnd() * Math.PI * 2, dist = 1500 + rnd() * 700;
  const sx = Math.cos(ang) * dist, sy = Math.sin(ang) * dist;
  const q = t => spring(t - (17.62 + i * 0.045), 85, 12);
  const px = useT(t => fx - r + sx * (1 - q(t))), py = useT(t => fy - r + sy * (1 - q(t)));
  return <motion.div style={{ ...abs(0, 0, 2 * r, 2 * r, { borderRadius: '50%', background: V[d[3]], x: px, y: py, zIndex: 2 }) }} />;
}
function H() {
  const tile = useT(t => spring(t - 18.15, 200, 18));
  return (
    <Scene a={17.5} b={20} enter={[960, 540]} bg={V.ink}>
      <Ping at={18.3} x={TILE.x + TILE.s / 2} y={TILE.y + TILE.s / 2} color={V.lilac} max={900} dur={0.9} />
      <motion.div style={{ ...abs(TILE.x, TILE.y, TILE.s, TILE.s, { background: V.ink, border: '3px solid #6c618f', borderRadius: 76 }), scale: tile, opacity: tile }} />
      {DOTS.map((d, i) => <HDot key={i} d={d} i={i} />)}
      <div style={{ position: 'absolute', left: 740, top: 268 }}><Chars text="ShellTint" at={18.25} size={204} weight={800} stagger={0.04} /></div>
      <div style={{ position: 'absolute', left: 744, top: 524 }}><Chars text="Your browser, in your desktop's colours." at={18.7} size={52} weight={600} stagger={0.016} color={V.lilac} /></div>
      <Rise at={19.05} y={24} style={{ position: 'absolute', left: 744, top: 630, fontSize: 46, fontWeight: 700, color: V.peach }}>Collects no data.</Rise>
      <Rise at={19.2} y={24} style={{ position: 'absolute', left: 744, top: 712, fontFamily: MONO, fontSize: 38, color: V.cream }}>Firefox · Chromium · Linux</Rise>
      <Rise at={19.35} y={24} style={{ position: 'absolute', left: 744, top: 776, display: 'flex', gap: 44, fontFamily: MONO, fontSize: 38 }}>
        {[['GitHub', 'https://github.com/Jazzmedo/ShellTint'], ['Changelog', 'https://github.com/Jazzmedo/ShellTint/blob/main/CHANGELOG.md'], ['Licence', 'https://github.com/Jazzmedo/ShellTint/blob/main/LICENSE']]
          .map(([name, href]) => <a key={name} href={href} style={{ color: V.lilac }}>{name}</a>)}
      </Rise>
      <Rise at={19.5} y={24} style={{ position: 'absolute', left: 744, top: 880, fontFamily: MONO, fontSize: 26, color: V.cream, opacity: 0.7 }}>MIT · Jazzmedo · Based on MatugenFox · Styles from Catppuccin userstyles</Rise>
    </Scene>
  );
}

// Global timeline (seconds). E1/E2/F and H keep their authored times and are moved with <Shift>.
export const RINGS = [[1.5, CREAM_DOT[0], CREAM_DOT[1], P.dusk.peach], [4, 1500, 870, P.dusk.violet], [7, 250, 200, P.dusk.lilac],
  [10.6, 960, 540, P.dusk.peach], [17.2, 960, 900, P.dusk.peach], [18.7, 960, 560, P.dusk.cream], [20.2, 1500, 900, P.dusk.lilac],
  [23.2, 960, 540, P.dusk.lilac], [24.7, 960, 540, P.dusk.cream], [26.2, 960, 900, P.dusk.peach], [29.2, 960, 540, P.dusk.violet], [33.7, 960, 540, P.dusk.peach]];

export function Film({ extra }) {
  return (
    <div style={{ position: 'relative', width: 1920, height: 1080 }}>
      <A /><B /><C /><D />
      {extra.pipe}
      <Shift by={7.7}><E1 /><E2 /><F /></Shift>
      {extra.after}
      <Shift by={16.2}><H /></Shift>
      {RINGS.map(([a, x, y, c]) => <IrisRing key={a} a={a} x={x} y={y} color={c} />)}
    </div>
  );
}
