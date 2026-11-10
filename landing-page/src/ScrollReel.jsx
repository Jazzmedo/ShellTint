import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { Film } from './reel.jsx';
import { Pipe, Extras, YourTurn, Install } from './scenes.jsx';
import { time } from './time.js';
import { BEATS, BEAT_VH, CHAPTERS, TOTAL_VH, beatAt, warp } from './beats.js';
import { bgAt, PICKER_FROM, PICKER_TO } from './bg.js';

const EXTRA = { pipe: <Pipe />, after: <><Extras /><YourTurn /><Install /></> };
const FilmMemo = memo(Film);
const FIXED_T = Number(new URLSearchParams(location.search).get('t')) || null;   // ?t=12.5 shows one frame, for authoring
const CAPTION_H = 92;   // screen px kept under the film for the caption
const firstBeat = c => BEATS.findIndex(b => b.chapter === c);

// Caption and chapter nav own their state, so changing beat never re-renders the film.
function Hud({ track }) {
  const [beat, setBeat] = useState(() => beatAt(time.get()));
  useMotionValueEvent(time, 'change', t => setBeat(prev => { const n = beatAt(t); return n === prev ? prev : n; }));
  const jump = chapter => {
    const top = track.current.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (BEAT_VH[firstBeat(chapter)] / 100) * innerHeight, behavior: 'smooth' });
  };
  const chapter = BEATS[beat].chapter;
  return (
    <>
      <nav className="reel-nav" aria-label="Chapters">
        <span className="reel-label">{String(chapter + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')} · {CHAPTERS[chapter]}</span>
        <span className="reel-dots">
          {CHAPTERS.map((c, i) => <button key={c} title={c} aria-label={c} className={i === chapter ? 'on' : ''} onClick={() => jump(i)} />)}
        </span>
      </nav>
      <div className="reel-caption"><p key={beat}>{BEATS[beat].caption}</p></div>
    </>
  );
}

export default function ScrollReel() {
  const track = useRef(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const [scale, setScale] = useState(1);

  // The film's time eases toward the scroll position, so wheel notches glide instead of jumping.
  const target = useMotionValue(0);
  const eased = useSpring(target, { stiffness: 140, damping: 2 * Math.sqrt(140), mass: 1 });
  useMotionValueEvent(scrollYProgress, 'change', p => target.set(FIXED_T ?? warp(p)));
  useMotionValueEvent(eased, 'change', t => time.set(FIXED_T ?? t));
  useLayoutEffect(() => {
    const t = FIXED_T ?? warp(scrollYProgress.get());
    target.jump(t); eased.jump(t); time.set(t);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const fit = () => setScale(Math.min(document.documentElement.clientWidth / 1920, (document.documentElement.clientHeight - CAPTION_H) / 1080));
    fit(); addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  const bg = useTransform(time, bgAt);
  const bgVar = useTransform(time, [PICKER_FROM, PICKER_TO], [0, 1]);
  return (
    <section ref={track} className="reel" style={{ height: `${TOTAL_VH + 100}vh` }} aria-label="ShellTint, scroll to play">
      <div className="reel-stage">
        <motion.div className="reel-bg" style={{ background: bg }} />
        <motion.div className="reel-bg reel-bg-var" style={{ opacity: bgVar }} />
        <div className="reel-canvas" style={{ transform: `translate(-50%, -50%) scale(${scale})`, top: `calc(50% - ${CAPTION_H / 2}px)` }}>
          <FilmMemo extra={EXTRA} />
        </div>
        <Hud track={track} />
      </div>
    </section>
  );
}
