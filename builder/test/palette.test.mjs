import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SLOTS, CATPPUCCIN, buildSlots, contrast, hueDistance, lightness, toOklch } from '../palette.mjs';
import { solveFilter } from '../filter-solver.mjs';

const NEUTRALS = ['base', 'surface0', 'surface1', 'surface2', 'overlay0', 'overlay1', 'overlay2', 'subtext0', 'subtext1', 'text'];
const HUES = ['red', 'maroon', 'peach', 'yellow', 'green', 'teal', 'sky', 'sapphire', 'blue'];

function checkPalette(slots, mode) {
  assert.deepEqual(Object.keys(slots).sort(), [...SLOTS].sort());
  for (const slot of SLOTS) assert.match(slots[slot], /^#[0-9a-f]{6}$/, slot);

  const dir = mode === 'light' ? -1 : 1;
  for (let i = 1; i < NEUTRALS.length; i++) {
    const step = (lightness(slots[NEUTRALS[i]]) - lightness(slots[NEUTRALS[i - 1]])) * dir;
    assert.ok(step > 0, `${NEUTRALS[i]} must be beyond ${NEUTRALS[i - 1]} (${mode})`);
  }
  assert.ok(lightness(slots.crust) < lightness(slots.mantle), `crust below mantle (${mode})`);
  assert.ok(lightness(slots.mantle) < lightness(slots.base), `mantle below base (${mode})`);

  assert.ok(contrast(slots.text, slots.base) >= 7, `text contrast (${mode})`);
  assert.ok(contrast(slots.subtext1, slots.base) >= 5.5, `subtext1 contrast (${mode})`);
  assert.ok(contrast(slots.subtext0, slots.base) >= 4.5, `subtext0 contrast (${mode})`);
  assert.ok(contrast(slots.mauve, slots.base) >= 3, `accent contrast (${mode})`);

  const ref = CATPPUCCIN[mode === 'light' ? 'latte' : 'mocha'];
  for (const slot of HUES) {
    const d = hueDistance(toOklch(slots[slot])[2], toOklch(ref[slot])[2]);
    assert.ok(d <= 40, `${slot} hue drifted ${d.toFixed(0)}° (${mode})`);
  }
}

const dmsFile = path.join(os.homedir(), '.cache/DankMaterialShell/dms-colors.json');
const dms = fs.existsSync(dmsFile) ? JSON.parse(fs.readFileSync(dmsFile, 'utf8')) : null;

for (const mode of ['dark', 'light']) {
  const usable = dms && (lightness(dms.colors[mode].surface) > 0.5) === (mode === 'light');
  test(`current DMS palette maps cleanly (${mode})`, { skip: !usable && `no ${mode} scheme in dms-colors.json` }, () => {
    const dank16 = Object.fromEntries(Object.entries(dms.dank16).map(([k, v]) => [k, v[mode]]));
    const slots = buildSlots(dms.colors[mode], dank16, mode);
    checkPalette(slots, mode);
    assert.deepEqual(buildSlots(dms.colors[mode], dank16, mode), slots, 'deterministic');
  });
}

test('flat and degenerate schemes still produce a usable palette', () => {
  const flat = {
    surface: '#2a2a2a', background: '#2a2a2a', surface_container: '#2a2a2a', surface_container_low: '#2a2a2a',
    surface_container_high: '#2a2a2a', surface_container_highest: '#2a2a2a', surface_bright: '#2a2a2a',
    outline: '#2a2a2a', outline_variant: '#2a2a2a', on_surface: '#303030', on_surface_variant: '#2a2a2a',
    primary: '#2c2c2c', secondary: '#2a2a2a', tertiary: '#2a2a2a', error: '#2b2b2b',
  };
  checkPalette(buildSlots(flat, {}, 'dark'), 'dark');
  const light = Object.fromEntries(Object.entries(flat).map(([k]) => [k, '#f0f0f0']));
  checkPalette(buildSlots(light, {}, 'light'), 'light');
});

test('filter solver is deterministic and accurate', () => {
  for (const hex of ['#a8b665', '#ddc7a1', '#e96962']) {
    const a = solveFilter(hex);
    assert.equal(solveFilter(hex).filter, a.filter);
    assert.ok(a.loss < 5, `${hex} loss ${a.loss.toFixed(2)}`);
    assert.match(a.filter, /^brightness\(0\) saturate\(100%\) invert\(\d+%\) sepia\(\d+%\) saturate\(\d+%\) hue-rotate\(\d+deg\) brightness\(\d+%\) contrast\(\d+%\)$/);
  }
});
