import { mix, P } from './reel.jsx';

// The colour behind the stage at time t, so the window is filled edge to edge whatever its shape.
// Each change follows the scene's iris wipe (0.6s). From the picker onwards the page palette's own variable takes over.
const D = P.dusk;
const STOPS = [[0, D.ink], [1.5, D.ink], [2.1, D.cream], [4, D.cream], [4.6, D.ink], [20.7, D.ink], [21.05, P.ocean.ink], [21.65, P.ocean.ink],
  [22.0, P.ember.ink], [22.6, P.ember.ink], [22.95, D.ink], [23.2, D.ink], [23.8, D.violet], [24.7, D.violet], [25.3, D.peach], [26.2, D.peach], [26.8, D.ink]];

export const PICKER_FROM = 26.2, PICKER_TO = 26.8;

export function bgAt(t) {
  if (t <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (t <= t1) return t1 === t0 ? c1 : mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return STOPS.at(-1)[1];
}
