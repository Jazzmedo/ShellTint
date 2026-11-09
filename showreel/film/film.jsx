// ShellTint film. Every style is derived from one motion value holding the
// current time, so a frame depends only on t and can be captured exactly.
// Clock-driven props (animate, initial, AnimatePresence, layout) would break that.
import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, motionValue, useTransform, easeInOut } from 'framer-motion';

const time = motionValue(0);
const useT = fn => useTransform(time, fn);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const inOutQuart = p => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2);
const seg = (t, a, b) => clamp((t - a) / (b - a));

function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

const MONO = '"JetBrainsMono Nerd Font", monospace';
const P = {
  dusk: { ink: '#15131c', panel: '#221e2e', violet: '#6a4fd8', lilac: '#b8a4f4', peach: '#f2a68a', cream: '#fbebd8' },
  grey: { ink: '#e3e3e6', panel: '#cfcfd4', violet: '#a9a9b0', lilac: '#bcbcc2', peach: '#9a9aa1', cream: '#3a3a40' },
  ocean: { ink: '#0c1b22', panel: '#14303a', violet: '#1f7a8c', lilac: '#7fd1c7', peach: '#f4d35e', cream: '#eaf6f2' },
  ember: { ink: '#1d110e', panel: '#331d17', violet: '#b3402a', lilac: '#e88a5a', peach: '#9fd08a', cream: '#fbeee0' },
};
const KEYS = Object.keys(P.dusk);

// A palette whose colours move through [[time, palette], ...]; delay lets parts of the UI follow in turn.
function usePal(stops, delay = 0) {
  const ts = stops.map(s => s[0] + delay), out = {};
  for (const k of KEYS) out[k] = useTransform(time, ts, stops.map(s => s[1][k]), { ease: easeInOut }); // eslint-disable-line
  return out;
}

const abs = (left, top, width, height, rest) => ({ position: 'absolute', left, top, width, height, ...rest });

// Boundary wipe: a tilted band crosses the frame, the scenes are clipped behind it.
const WIPE = 0.25;
const BOUNDARIES = [[4, P.dusk.peach], [9, P.dusk.lilac], [14, P.dusk.violet], [21, P.dusk.cream], [26, P.dusk.peach]];
const bandX = (B, t) => lerp(-700, 2620, inOutQuart(seg(t, B - WIPE, B + WIPE)));

function Band({ B, color }) {
  const x = useT(t => bandX(B, t));
  const visibility = useT(t => (t >= B - WIPE && t < B + WIPE ? 'visible' : 'hidden'));
  return <motion.div style={{ ...abs(-150, -220, 300, 1520, { background: color, zIndex: 50, rotate: -10 }), x, visibility }} />;
}

function Scene({ a, b, bg = P.dusk.ink, children }) {
  const visibility = useT(t => (t >= a - WIPE && t < b + WIPE ? 'visible' : 'hidden'));
  const clipPath = useT(t => {
    const right = a > 0 && t < a + WIPE ? clamp(1920 - bandX(a, t), 0, 1920) : 0;
    const left = b < 30 && t > b - WIPE ? clamp(bandX(b, t), 0, 1920) : 0;
    return `inset(0px ${right}px 0px ${left}px)`;
  });
  return <motion.div style={{ ...abs(0, 0, 1920, 1080, { background: bg, overflow: 'hidden' }), visibility, clipPath }}>{children}</motion.div>;
}

// Springs in from an offset; the style prop positions it.
function Rise({ at, y = 40, x = 0, from = 1, k = 170, d = 22, style, children }) {
  const opacity = useT(t => seg(t, at, at + 0.16));
  const ty = useT(t => y * (1 - spring(t - at, k, d)));
  const tx = useT(t => x * (1 - spring(t - at, k, d)));
  const scale = useT(t => lerp(from, 1, spring(t - at, k, d)));
  return <motion.div style={{ ...style, opacity, y: ty, x: tx, scale }}>{children}</motion.div>;
}

// Masked word-by-word headline.
function Words({ text, at, size, color = P.dusk.cream, weight = 750, gap = 0.055, style }) {
  return (
    <div style={{ fontSize: size, fontWeight: weight, color, lineHeight: 1.16, letterSpacing: '-0.025em', ...style }}>
      {text.split(' ').map((w, i) => <Word key={i} w={w} at={at + i * gap} />)}
    </div>
  );
}
function Word({ w, at }) {
  const y = useT(t => `${(1 - spring(t - at, 190, 24)) * 112}%`);
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', paddingBottom: '0.14em', marginBottom: '-0.14em', marginRight: '0.26em' }}>
      <motion.span style={{ display: 'inline-block', y }}>{w}</motion.span>
    </span>
  );
}

function Wallpaper({ pal }) {
  return (
    <svg viewBox="0 0 1920 1080" width="100%" height="100%" preserveAspectRatio="xMidYMax slice" style={{ display: 'block' }}>
      <motion.rect width="1920" height="1080" style={{ fill: pal.ink }} />
      {[['violet', 1000], ['lilac', 700], ['peach', 430], ['cream', 220]].map(([c, r]) => (
        <motion.circle key={c} cx="1180" cy="1000" r={r} style={{ fill: pal[c] }} />
      ))}
      <motion.path d="M0 860 C320 760 620 900 960 850 S1600 760 1920 860 V1080 H0Z" style={{ fill: pal.panel }} />
      <motion.path d="M0 960 C420 880 760 1010 1180 950 S1720 930 1920 980 V1080 H0Z" style={{ fill: pal.ink }} />
    </svg>
  );
}

function Browser({ pal, w, h, url, tab, children, style }) {
  const tabs = [tab, 'Docs', 'Music'];
  return (
    <motion.div style={{ width: w, height: h, borderRadius: 22, overflow: 'hidden', background: pal.ink, display: 'flex', flexDirection: 'column', ...style }}>
      <motion.div style={{ height: 66, background: pal.violet, display: 'flex', alignItems: 'flex-end', gap: 8, padding: '0 22px', flex: 'none' }}>
        {tabs.map((t, i) => (
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
      <div style={{ position: 'relative', flex: 1 }}>{children}</div>
    </motion.div>
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
function SiteMock({ kind, pal }) {
  return (
    <motion.div style={{ position: 'absolute', inset: 0, background: pal.ink }}>
      {MOCKS[kind].map(([l, t, w, h, c], i) => (
        <motion.div key={i} style={{ position: 'absolute', left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%`, borderRadius: 5, background: pal[c] }} />
      ))}
    </motion.div>
  );
}

function Fixed({ children, style }) { return <div style={{ position: 'absolute', ...style }}>{children}</div>; }

// 0-4s: the problem.
function S1() {
  const y = useT(t => 800 * (1 - spring(t - 1.75, 150, 19)));
  const push = useT(t => 1 + seg(t, 0, 4) * 0.05);
  return (
    <Scene a={0} b={4}>
      <motion.div style={{ ...abs(0, 0, 1920, 1080, { transformOrigin: '61% 92%' }), scale: push }}><Wallpaper pal={P.dusk} /></motion.div>
      <Fixed style={{ left: 120, top: 92 }}><Words text="Your desktop has colours." at={0.15} size={104} /></Fixed>
      <Fixed style={{ left: 120, top: 222 }}><Words text="Your browser doesn't." at={1.75} size={104} /></Fixed>
      <motion.div style={{ ...abs(280, 410, 1360, 760), y }}>
        <Browser pal={P.grey} w={1360} h={760} url="example.org" tab="New tab"><SiteMock kind="video" pal={P.grey} /></Browser>
      </motion.div>
    </Scene>
  );
}

// 4-9s: wallpaper becomes a palette.
const SWATCHES = [['ink', 'Ink'], ['violet', 'Violet'], ['lilac', 'Lilac'], ['peach', 'Peach'], ['cream', 'Cream']];
const SOURCES = ['DMS', 'Caelestia', 'Noctalia', 'end-4', 'GNOME', 'KDE', 'pywal', 'matugen'];
function Swatch({ c, name, i }) {
  const at = 5.15 + i * 0.1;
  const scaleY = useT(t => spring(t - at, 150, 20));
  const textOp = useT(t => seg(t, at + 0.25, at + 0.5));
  const onDark = c === 'ink' || c === 'violet';
  return (
    <div style={{ position: 'relative', width: 156, height: 450 }}>
      <motion.div style={{ position: 'absolute', inset: 0, borderRadius: 18, background: P.dusk[c], border: c === 'ink' ? '2px solid #6c618f' : 'none', scaleY, transformOrigin: '50% 100%' }} />
      <motion.div style={{ position: 'absolute', left: 16, bottom: 18, color: onDark ? P.dusk.cream : P.dusk.ink, opacity: textOp }}>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{name}</div>
        <div style={{ fontFamily: MONO, fontSize: 24 }}>{P.dusk[c]}</div>
      </motion.div>
    </div>
  );
}
function S2() {
  const x = useT(t => lerp(0, 120, spring(t - 4.55, 120, 20)));
  const y = useT(t => lerp(0, 250, spring(t - 4.55, 120, 20)));
  const scale = useT(t => lerp(1, 800 / 1920, spring(t - 4.55, 120, 20)));
  const borderRadius = useT(t => lerp(0, 58, seg(t, 4.55, 5)));
  const frameOp = useT(t => seg(t, 4.6, 5)); // the wallpaper's dark sky would otherwise melt into the background
  return (
    <Scene a={4} b={9}>
      <motion.div style={{ ...abs(0, 0, 1920, 1080, { overflow: 'hidden', transformOrigin: '0 0' }), x, y, scale, borderRadius }}>
        <Wallpaper pal={P.dusk} />
        <motion.div style={{ position: 'absolute', inset: 0, borderRadius: 58, border: '6px solid #6c618f', opacity: frameOp }} />
      </motion.div>
      <Fixed style={{ left: 120, top: 92 }}><Words text="Reads the palette your shell made." at={5.0} size={84} /></Fixed>
      <div style={{ position: 'absolute', left: 980, top: 250, display: 'flex', gap: 10 }}>
        {SWATCHES.map(([c, n], i) => <Swatch key={c} c={c} name={n} i={i} />)}
      </div>
      <div style={{ position: 'absolute', left: 120, top: 780, display: 'flex', gap: 16 }}>
        {SOURCES.map((s, i) => (
          <Rise key={s} at={6.45 + i * 0.09} y={34} style={{ fontFamily: MONO, fontSize: 36, fontWeight: 600, color: P.dusk.cream, background: P.dusk.panel, border: `2px solid ${P.dusk.violet}`, borderRadius: 40, padding: '14px 30px' }}>{s}</Rise>
        ))}
      </div>
      <Fixed style={{ left: 120, top: 908 }}><Words text="Detected automatically." at={7.5} size={52} color={P.dusk.lilac} weight={600} /></Fixed>
    </Scene>
  );
}

// 9-14s: how it works.
const NODES = [
  { x: 120, y: 340, title: 'Colour file', sub: 'from your shell', c: 'violet', lit: 9.75 },
  { x: 566, y: 620, title: 'Helper', sub: 'reads the palette', c: 'lilac', lit: 10.75 },
  { x: 1012, y: 340, title: 'Builder', sub: 'recolours the styles', c: 'peach', lit: 11.85 },
  { x: 1460, y: 620, title: 'Extension', sub: 'paints the browser', c: 'cream', lit: 12.95 },
];
const NW = 340, NH = 230;
function Node({ n, i }) {
  const fill = useT(t => seg(t, n.lit, n.lit + 0.22));
  const bump = useT(t => { const d = t - n.lit; return 1 + (d > 0 && d < 0.5 ? 0.06 * Math.sin(Math.PI * d / 0.5) : 0); });
  const dark = n.c !== 'violet';
  const litText = useT(t => (t >= n.lit + 0.08 && dark ? P.dusk.ink : P.dusk.cream));
  return (
    <Rise at={9.3 + i * 0.1} y={50} style={abs(n.x, n.y, NW, NH)}>
      <motion.div style={{ position: 'absolute', inset: 0, borderRadius: 26, background: P.dusk.panel, scale: bump, overflow: 'hidden' }}>
        <motion.div style={{ position: 'absolute', inset: 0, background: P.dusk[n.c], opacity: fill }} />
        <motion.div style={{ position: 'absolute', left: 30, top: 26, right: 20, color: litText }}>
          <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600 }}>0{i + 1}</div>
          <div style={{ fontSize: 54, fontWeight: 750, letterSpacing: '-0.02em', marginTop: 16 }}>{n.title}</div>
          <div style={{ fontSize: 31, fontWeight: 550, marginTop: 4, whiteSpace: 'nowrap' }}>{n.sub}</div>
        </motion.div>
      </motion.div>
    </Rise>
  );
}
function Link({ from, to, a, b }) {
  const x1 = from.x + NW, y1 = from.y + NH / 2, x2 = to.x, y2 = to.y + NH / 2, mx = (x1 + x2) / 2;
  const d = `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  const ref = useRef(null);
  const progress = useT(t => inOutQuart(seg(t, a, b)));
  const point = t => { const p = ref.current; return p ? p.getPointAtLength(p.getTotalLength() * inOutQuart(seg(t, a, b))) : { x: x1, y: y1 }; };
  const x = useT(t => point(t).x - 19), y = useT(t => point(t).y - 19);
  const opacity = useT(t => (t >= a && t <= b + 0.08 ? 1 : 0));
  return (
    <>
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <path ref={ref} d={d} fill="none" stroke={P.dusk.panel} strokeWidth="8" />
        <motion.path d={d} fill="none" stroke={P.dusk.peach} strokeWidth="8" strokeLinecap="round" style={{ pathLength: progress }} />
      </svg>
      <motion.div style={{ ...abs(0, 0, 38, 38, { borderRadius: 19, background: P.dusk.cream, boxShadow: `0 0 0 10px ${P.dusk.peach}66` }), x, y, opacity }} />
    </>
  );
}
function S3() {
  return (
    <Scene a={9} b={14}>
      <Fixed style={{ left: 120, top: 92 }}><Words text="Everything happens on your computer." at={9.3} size={84} /></Fixed>
      <Link from={NODES[0]} to={NODES[1]} a={9.95} b={10.75} />
      <Link from={NODES[1]} to={NODES[2]} a={11.05} b={11.85} />
      <Link from={NODES[2]} to={NODES[3]} a={12.15} b={12.95} />
      {NODES.map((n, i) => <Node key={n.title} n={n} i={i} />)}
    </Scene>
  );
}

// 14-21s: toolbar paints, then the wall of sites.
const SITES = [
  ['YouTube', 'video'], ['GitHub', 'code'], ['X', 'feed'], ['Reddit', 'feed'], ['Wikipedia', 'wiki'],
  ['Stack Overflow', 'wiki'], ['Hacker News', 'wiki'], ['Twitch', 'video'], ['Gmail', 'feed'], ['DuckDuckGo', 'wiki'],
  ['npm', 'code'], ['MDN', 'wiki'], ['ChatGPT', 'feed'], ['LinkedIn', 'feed'], ['Spotify', 'video'],
];
const TW = 324, TH = 216, TG = 15;
function Tile({ name, kind, i }) {
  const c = i % 5, r = Math.floor(i / 5), wave = c + r;
  const at = 17.9 + wave * 0.11;
  const pal = usePal(i ? [[at, P.grey], [at + 0.5, P.dusk]] : [[0, P.dusk], [30, P.dusk]]);
  return (
    <Rise at={17.25 + wave * 0.05} y={26} from={0.9} style={abs(120 + c * (TW + TG), 86 + r * (TH + TG), TW, TH, { borderRadius: 16, overflow: 'hidden' })}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: TW, height: TH - 54 }}><SiteMock kind={kind} pal={pal} /></div>
      <motion.div style={{ position: 'absolute', left: 0, bottom: 0, width: TW, height: 54, background: pal.panel, color: pal.cream, fontSize: 30, fontWeight: 650, display: 'flex', alignItems: 'center', padding: '0 18px' }}>{name}</motion.div>
    </Rise>
  );
}
function S4() {
  const clip = useT(t => `inset(0px ${(1 - inOutQuart(seg(t, 14.75, 15.75))) * 100}% 0px 0px)`);
  const edge = useT(t => inOutQuart(seg(t, 14.75, 15.75)) * 1400 - 5);
  const edgeOp = useT(t => (t > 14.75 && t < 15.75 ? 1 : 0));
  const shrink = t => spring(t - 16.95, 150, 24);
  const x = useT(t => lerp(260, 120, shrink(t)));
  const y = useT(t => lerp(60, 86, shrink(t)));
  const scale = useT(t => lerp(1, TW / 1400, shrink(t)));
  const opacity = useT(t => 1 - seg(t, 17.45, 17.7));
  const captionOp = useT(t => 1 - seg(t, 16.75, 16.95));
  const count = useT(t => { const p = seg(t, 17.9, 19.5); return `${Math.round(130 * (1 - (1 - p) ** 3))}${p >= 1 ? '+' : ''}`; });
  const drift = useT(t => 1 + seg(t, 18, 21) * 0.02);
  return (
    <Scene a={14} b={21}>
      <motion.div style={{ position: 'absolute', inset: 0, scale: drift, transformOrigin: '50% 40%' }}>
        {SITES.map(([n, k], i) => <Tile key={n} name={n} kind={k} i={i} />)}
      </motion.div>
      <motion.div style={{ ...abs(0, 0, 1400, 760, { transformOrigin: '0 0', zIndex: 5 }), x, y, scale, opacity }}>
        <Browser pal={P.grey} w={1400} h={760} url="youtube.com" tab="YouTube"><SiteMock kind="video" pal={P.grey} /></Browser>
        <motion.div style={{ position: 'absolute', inset: 0, clipPath: clip }}>
          <Browser pal={P.dusk} w={1400} h={760} url="youtube.com" tab="YouTube"><SiteMock kind="video" pal={P.dusk} /></Browser>
        </motion.div>
        <motion.div style={{ ...abs(0, 0, 10, 760, { background: P.dusk.peach }), x: edge, opacity: edgeOp }} />
      </motion.div>
      <motion.div style={{ position: 'absolute', left: 260, top: 860, display: 'flex', alignItems: 'center', gap: 34, opacity: captionOp }}>
        <Rise at={14.35} y={24} style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: P.dusk.ink, background: P.dusk.peach, borderRadius: 14, padding: '10px 24px' }}>FIREFOX</Rise>
        <Words text="Toolbar, tabs and menus follow your shell." at={14.45} size={60} />
      </motion.div>
      <Rise at={18.0} y={40} style={{ position: 'absolute', left: 120, top: 822, width: 470, fontSize: 184, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.08, color: P.dusk.peach, fontVariantNumeric: 'tabular-nums' }}>
        <motion.span>{count}</motion.span>
      </Rise>
      <Fixed style={{ left: 620, top: 842 }}><Words text="websites, restyled with your palette." at={18.2} size={68} /></Fixed>
      <Rise at={18.75} y={24} style={{ position: 'absolute', left: 620, top: 942, fontFamily: MONO, fontSize: 42, color: P.dusk.lilac }}>in Firefox and Chromium</Rise>
    </Scene>
  );
}

// 21-26s: theme change, and everything follows.
const CHANGE = [[21, P.dusk], [22, P.dusk], [22.4, P.ocean], [23.6, P.ocean], [24, P.ember], [25.2, P.ember], [25.6, P.dusk], [26.5, P.dusk]];
function S5() {
  const wall = usePal(CHANGE), bar = usePal(CHANGE, 0.1), chrome = usePal(CHANGE, 0.22), page = usePal(CHANGE, 0.34);
  return (
    <Scene a={21} b={26}>
      <div style={abs(620, 0, 1300, 1080)}><Wallpaper pal={wall} /></div>
      <motion.div style={{ ...abs(620, 0, 1300, 62, { display: 'flex', alignItems: 'center', gap: 14, padding: '0 28px' }), background: bar.panel }}>
        {[0, 1, 2, 3].map(i => <motion.span key={i} style={{ width: i ? 18 : 46, height: 18, borderRadius: 9, background: i ? bar.lilac : bar.peach }} />)}
        <motion.span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 28, color: bar.cream }}>21:40</motion.span>
      </motion.div>
      <Rise at={21.3} y={60} style={abs(770, 180, 1000, 680)}>
        <Browser pal={chrome} w={1000} h={680} url="github.com" tab="GitHub"><SiteMock kind="code" pal={page} /></Browser>
      </Rise>
      <motion.div style={{ ...abs(0, 0, 620, 1080), background: wall.ink }} />
      <motion.div style={{ ...abs(90, 170, 500, 700), color: wall.cream }}>
        <Words text="Change your wallpaper." at={21.35} size={78} color="inherit" />
        <Words text="Everything follows." at={22.6} size={78} color="inherit" style={{ marginTop: 44 }} />
        <motion.div style={{ color: wall.peach, marginTop: 44 }}><Words text="No reload." at={24.15} size={78} color="inherit" /></motion.div>
      </motion.div>
      <div style={{ position: 'absolute', left: 90, top: 860, display: 'flex', gap: 14 }}>
        {['violet', 'lilac', 'peach', 'cream'].map((c, i) => (
          <Rise key={c} at={21.5 + i * 0.07} y={20} from={0.5}><motion.div style={{ width: 84, height: 84, borderRadius: 42, background: wall[c] }} /></Rise>
        ))}
      </div>
    </Scene>
  );
}

// 26-30s: end card built from the real icon's nine dots (extension/icons/icon.svg).
const ICON = { box: 207.79, size: 608.42 };
const DOTS = [[344.47, 337.41, 40, 'violet'], [496.73, 337.41, 52.78, 'violet'], [677.02, 337.41, 68.03, 'violet'],
  [344.47, 509, 40, 'lilac'], [496.73, 509, 52.78, 'lilac'], [677.02, 509, 68.03, 'lilac'],
  [344.47, 680.59, 40, 'peach'], [496.73, 680.59, 52.78, 'peach'], [677.02, 680.59, 68.03, 'cream']];
function Dot({ cx, cy, r, c, i, s }) {
  const at = 26.3 + i * 0.075;
  const scale = useT(t => spring(t - at, 240, 15));
  const D = r * 2 * s;
  return <motion.div style={{ ...abs((cx - ICON.box) * s - D / 2, (cy - ICON.box) * s - D / 2, D, D, { borderRadius: '50%', background: P.dusk[c] }), scale }} />;
}
function S6() {
  const S = 460, s = S / ICON.size;
  return (
    <Scene a={26} b={30}>
      <Rise at={26.1} y={0} from={0.8} style={abs(180, 310, S, S, { background: P.dusk.ink, border: '3px solid #6c618f', borderRadius: 76 })}>
        {DOTS.map(([cx, cy, r, c], i) => <Dot key={i} cx={cx} cy={cy} r={r} c={c} i={i} s={s} />)}
      </Rise>
      <Fixed style={{ left: 740, top: 268 }}><Words text="ShellTint" at={26.95} size={204} weight={800} /></Fixed>
      <Fixed style={{ left: 744, top: 524 }}><Words text="Your browser, in your desktop's colours." at={27.35} size={52} color={P.dusk.lilac} weight={600} gap={0.04} /></Fixed>
      <Rise at={27.95} y={24} style={{ position: 'absolute', left: 744, top: 630, fontSize: 46, fontWeight: 700, color: P.dusk.peach }}>Collects no data.</Rise>
      <Rise at={28.2} y={24} style={{ position: 'absolute', left: 744, top: 712, fontFamily: MONO, fontSize: 38, color: P.dusk.cream }}>Firefox · Chromium · Linux</Rise>
      <Rise at={28.4} y={24} style={{ position: 'absolute', left: 744, top: 776, fontFamily: MONO, fontSize: 38, color: P.dusk.lilac }}>github.com/Jazzmedo/ShellTint</Rise>
    </Scene>
  );
}

let mounted;
const ready = new Promise(r => { mounted = r; });
function Film() {
  useLayoutEffect(() => mounted(), []);
  return (
    <div style={{ position: 'relative', width: 1920, height: 1080, overflow: 'hidden' }}>
      <S1 /><S2 /><S3 /><S4 /><S5 /><S6 />
      {BOUNDARIES.map(([B, c]) => <Band key={B} B={B} color={c} />)}
    </div>
  );
}

// Motion values write to the DOM on the next frame; two rAFs guarantee it has painted.
window.seek = t => { time.set(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };
window.filmReady = (async () => { await ready; await document.fonts.ready; await window.seek(0); })();
createRoot(document.getElementById('root')).render(<Film />);
