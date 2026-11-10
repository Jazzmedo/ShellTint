import { mix, P } from './reel.jsx';

// The colour behind the stage at time t, so the window is filled edge to edge whatever its shape.
// Each change follows the scene's iris wipe (0.6s). From the picker onwards the page palette's own variable takes over.
const D = P.dusk;
// Hold the old colour until the iris has covered the scene, then fade quickly: blending during the wipe turns the margins grey around a still-dark 16:9 frame.
const STOPS = [[0, D.ink], [2.1, D.ink], [2.3, D.cream], [4.6, D.cream], [4.8, D.ink], [21.05, D.ink], [21.25, P.ocean.ink], [22.0, P.ocean.ink], [22.2, P.ember.ink],
  [22.95, P.ember.ink], [23.15, D.ink], [23.8, D.ink], [24.0, D.violet], [25.3, D.violet], [25.5, D.peach], [26.8, D.peach], [27.0, D.ink]];

export const PICKER_FROM = 26.8, PICKER_TO = 27.0;

export function bgAt(t) {
  if (t <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (t <= t1) return t1 === t0 ? c1 : mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return STOPS.at(-1)[1];
}
