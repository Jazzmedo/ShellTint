import { useSyncExternalStore } from 'react';
import { P } from './reel.jsx';

// The page's palette: the picker sets it, CSS variables recolour the sections.
let current = 'dusk';
const listeners = new Set();

export const NAMES = ['dusk', 'ocean', 'ember', 'grey'];

export function setTheme(name) {
  if (!P[name]) return;
  current = name;
  for (const [role, value] of Object.entries(P[name])) document.documentElement.style.setProperty(`--${role}`, value);
  listeners.forEach(fn => fn());
}

// The palette's colours as plain strings, for the reel's Browser and Wallpaper mocks.
export function usePal() {
  const name = useSyncExternalStore(fn => (listeners.add(fn), () => listeners.delete(fn)), () => current);
  return [name, P[name]];
}
