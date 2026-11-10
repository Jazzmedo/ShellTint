// Scenes added for the page, in the reel's own building blocks. Times are on the film's global timeline.
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Browser, Wallpaper, Rise, Chars, Scene, Ping, P, MONO, abs, chipStyle, mix, seg, useT, spring, KEYS } from './reel.jsx';
import { NAMES, LABELS, setTheme, usePal } from './theme.js';

const D = P.dusk;
const V = Object.fromEntries(KEYS.map(k => [k, `var(--${k})`]));

// ---------- How it works: the chain, one link at a time (10.6 - 17.2) ----------
const NODES = [
  ['Your shell', 'writes a palette', 'violet'], ['Helper', 'Python · reads & expands', 'lilac'], ['Builder', 'Node · recolours styles', 'peach'],
  ['Cache', '~/.cache/shelltint', 'violet'], ['Extension', 'via native messaging', 'lilac'], ['Your browser', 'toolbar + tabs', 'peach'],
];
const NW = 290, NG = 16, NX = 50, NY = 400;
const nodeAt = i => 11.05 + i * 0.85;

function Node({ i, name, sub, tone }) {
  const at = nodeAt(i);
  const hot = useT(t => seg(t, at, at + 0.2) * (1 - seg(t, at + 0.8, at + 1.0)));
  const border = useT(t => mix(D.violet, D.peach, seg(t, at, at + 0.2) * (1 - seg(t, at + 0.8, at + 1.0))));
  return (
    <Rise at={at} y={70} from={0.92} style={abs(NX + i * (NW + NG), NY, NW, 340)}>
      <motion.div style={{ position: 'absolute', inset: 0, background: D.panel, borderRadius: 36, border: '4px solid', borderColor: border, padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: D[tone], color: D.ink, font: `800 34px ${MONO}`, display: 'grid', placeItems: 'center' }}>{i + 1}</div>
        <div style={{ fontSize: 46, fontWeight: 800, color: D.cream, letterSpacing: '-0.03em', marginTop: 56, lineHeight: 1.05 }}>{name}</div>
        <div style={{ fontFamily: MONO, fontSize: 21, color: D.lilac, marginTop: 16, lineHeight: 1.3 }}>{sub}</div>
        <motion.div style={{ position: 'absolute', inset: -4, borderRadius: 36, boxShadow: `0 0 70px ${D.peach}`, opacity: hot }} />
      </motion.div>
    </Rise>
  );
}
// A dot runs along the link into the node that has just appeared.
function Link({ i }) {
  const at = nodeAt(i + 1) - 0.25;
  const x0 = NX + i * (NW + NG) + NW, x = useT(t => x0 - 30 + (NG + 60) * seg(t, at, at + 0.3));
  const op = useT(t => (t >= at && t < at + 0.32 ? 1 : 0));
  return (
    <>
      <div style={abs(x0, NY + 168, NG, 5, { background: D.violet, borderRadius: 3 })} />
      <motion.div style={{ ...abs(0, NY + 156, 28, 28, { borderRadius: '50%', background: D.peach, boxShadow: `0 0 30px ${D.peach}` }), x, opacity: op }} />
    </>
  );
}
export function Pipe() {
  return (
    <Scene a={10.6} b={17.2} enter={[960, 540]}>
      <Rise at={10.7} y={20} style={{ ...abs(116, 66, 900, 40), fontFamily: MONO, fontSize: 30, fontWeight: 700, color: D.peach, letterSpacing: '0.12em' }}>HOW IT WORKS</Rise>
      <div style={{ position: 'absolute', left: 110, top: 106 }}><Chars text="FROM SHELL TO TAB" at={10.75} size={170} /></div>
      {NODES.map((_, i) => <Rise key={`g${i}`} at={10.9} y={0} style={abs(NX + i * (NW + NG), NY, NW, 340, { borderRadius: 36, border: `3px dashed ${D.violet}`, opacity: 0.35 })} />)}
      {NODES.map(([n, s, tone], i) => <Node key={n} i={i} name={n} sub={s} tone={tone} />)}
      {NODES.slice(0, -1).map((_, i) => <Link key={i} i={i} />)}
      {NODES.map((_, i) => <Ping key={i} at={nodeAt(i)} x={NX + i * (NW + NG) + NW / 2} y={NY + 170} color={D.lilac} max={220} dur={0.6} w={6} />)}
      <div style={{ position: 'absolute', left: 110, top: 850 }}><Chars text="New wallpaper? About a second. No reload." at={16.2} size={78} weight={800} color={D.cream} stagger={0.014} /></div>
    </Scene>
  );
}

// ---------- Good to know: two held cards (23.2 - 26.2) ----------
export function Extras() {
  const slash = useT(t => seg(t, 23.7, 23.95));
  return (
    <>
      <Scene a={23.2} b={24.7} enter={[960, 540]} bg={D.violet}>
        <div style={{ position: 'absolute', left: 110, top: 190 }}><Chars text="COLLECTS" at={23.25} size={250} color={D.cream} /></div>
        <div style={{ position: 'absolute', left: 110, top: 430 }}><Chars text="NO DATA." at={23.4} size={250} color={D.ink} /></div>
        <Rise at={23.9} y={24} style={{ ...abs(116, 760, 1500, 60), fontFamily: MONO, fontSize: 40, color: D.cream }}>Everything is read and built on your computer.</Rise>
        <svg width="460" height="460" viewBox="0 0 100 100" style={{ position: 'absolute', left: 1330, top: 160 }}>
          <circle cx="50" cy="50" r="38" fill="none" stroke={D.cream} strokeWidth="7" />
          <motion.line x1="22" y1="22" x2="78" y2="78" stroke={D.peach} strokeWidth="9" strokeLinecap="round" style={{ pathLength: slash }} />
        </svg>
      </Scene>
      <Scene a={24.7} b={26.2} enter={[960, 540]} bg={D.peach}>
        <div style={{ position: 'absolute', left: 110, top: 150 }}><Chars text="YOUR OWN" at={24.75} size={250} color={D.ink} /></div>
        <div style={{ position: 'absolute', left: 110, top: 390 }}><Chars text="CSS." at={24.9} size={250} color={D.violet} /></div>
        <div style={{ position: 'absolute', left: 116, top: 690, display: 'flex', gap: 20 }}>
          {['Per site, like Stylus', 'Backup & restore', 'Light & dark follow the shell'].map((s, i) => (
            <Rise key={s} at={25.15 + i * 0.1} y={34} style={{ ...chipStyle, fontSize: 38, height: 84, color: D.ink, background: D.cream, border: 'none' }}>{s}</Rise>
          ))}
        </div>
      </Scene>
    </>
  );
}

// ---------- Your turn: a real palette picker (26.2 - 29.2) ----------
export function YourTurn() {
  const [name, pal] = usePal();
  return (
    <Scene a={26.2} b={29.2} enter={[960, 900]} bg={V.ink}>
      <Rise at={26.3} y={20} style={{ ...abs(116, 66, 900, 40), fontFamily: MONO, fontSize: 30, fontWeight: 700, color: V.peach, letterSpacing: '0.12em' }}>TRY IT</Rise>
      <div style={{ position: 'absolute', left: 110, top: 106 }}><Chars text="YOUR TURN." at={26.35} size={190} color={V.cream} /></div>
      <Rise at={26.8} y={60} style={abs(110, 340, 1100, 640)}><div className="fade"><Browser pal={pal} w={1100} h={640} url="github.com" tab="GitHub" kind="code" /></div></Rise>
      <Rise at={27.0} y={20} style={{ ...abs(1290, 340, 560, 44), fontFamily: MONO, fontSize: 28, color: V.lilac }}>PICK A WALLPAPER</Rise>
      <div role="radiogroup" aria-label="Palette" style={{ position: 'absolute', left: 1290, top: 400, display: 'grid', gridTemplateColumns: '270px 270px', gap: 20 }}>
        {NAMES.map((n, i) => (
          <Rise key={n} at={27.05 + i * 0.07} y={40}>
            <button role="radio" aria-checked={n === name} onClick={() => setTheme(n)} className={`pick${n === name ? ' on' : ''}`}>
              <span className="thumb"><svg viewBox="0 0 1920 1080" width="100%" height="100%"><Wallpaper pal={P[n]} /></svg></span>
              {LABELS[n]}
            </button>
          </Rise>
        ))}
      </div>
      <Rise at={27.4} y={20} style={{ ...abs(1290, 930, 560, 110), fontSize: 34, fontWeight: 700, color: V.cream, lineHeight: 1.25 }}>Click one. Everything after this follows it.</Rise>
    </Scene>
  );
}

// ---------- Install (29.2 - 33.7) ----------
const CMD = 'curl -fsSL https://raw.githubusercontent.com/Jazzmedo/ShellTint/main/shelltint.sh | bash';
function Step({ at, n, title, top, children }) {
  return (
    <>
      <Rise at={at} y={30} style={{ ...abs(116, top, 400, 40), fontFamily: MONO, fontSize: 28, fontWeight: 700, color: V.peach, letterSpacing: '0.12em' }}>STEP 0{n}</Rise>
      <div style={{ position: 'absolute', left: 110, top: top + 36 }}><Chars text={title} at={at + 0.05} size={76} weight={800} color={V.cream} stagger={0.02} /></div>
      <Rise at={at + 0.3} y={30} style={abs(116, top + 140, 1700, 100)}>{children}</Rise>
    </>
  );
}
export function Install() {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(CMD); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* the command stays selectable */ }
  };
  const link = { color: V.ink, background: V.peach, borderRadius: 20, padding: '16px 28px', fontSize: 30, fontWeight: 700, textDecoration: 'none' };
  return (
    <Scene a={29.2} b={33.7} enter={[960, 540]} bg={V.ink}>
      <div style={{ position: 'absolute', left: 110, top: 50 }}><Chars text="INSTALL." at={29.25} size={150} color={V.cream} /></div>
      <Step at={29.7} n={1} title="RUN THE INSTALLER" top={250}>
        <div className="cmd"><code>{CMD}</code><button onClick={copy}>{done ? 'Copied' : 'Copy'}</button></div>
      </Step>
      <Step at={30.9} n={2} title="INSTALL THE EXTENSION" top={540}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <a href="https://addons.mozilla.org/firefox/addon/shelltint/" style={link}>Firefox · Zen · LibreWolf → addons.mozilla.org</a>
          <a href="https://github.com/Jazzmedo/ShellTint/releases/latest" style={{ ...link, background: V.lilac }}>Chromium · Brave · Edge → release zip</a>
        </div>
      </Step>
      <Step at={32.1} n={3} title="RESTART THE BROWSER" top={830}>
        <div style={{ fontFamily: MONO, fontSize: 30, color: V.lilac }}>Settings → Overview says the helper is connected.</div>
      </Step>
    </Scene>
  );
}
