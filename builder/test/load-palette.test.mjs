import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadPalette } from '../build.mjs';
import { SLOTS, buildSlots } from '../palette.mjs';

const require = createRequire(import.meta.url);
const { themeFromRoles } = require('../../extension/shared/theme-map.js');
const { normaliseSettings, DEFAULT_SETTINGS } = require('../../extension/shared/defaults.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shelltint-palette-'));
const write = (name, data) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  return file;
};
const roles = { primary: '#A8B665', surface: '#32302f', on_surface: '#ddc7a1', secondary: '#d8a657', bogus: 'red' };

test('loadPalette validates and lowercases a format 1 palette', () => {
  const p = loadPalette(write('ok.json', { format: 1, mode: 'dark', source: { id: 'dms' }, roles, extras: { dank16: { color1: '#d16e5e', color2: 12 } } }));
  assert.equal(p.roles.primary, '#a8b665');
  assert.equal(p.roles.bogus, undefined);
  assert.deepEqual(p.dank16, { color1: '#d16e5e' });
  const slots = buildSlots(p.roles, p.dank16, p.mode);
  assert.deepEqual(Object.keys(slots).sort(), [...SLOTS].sort());
});

test('loadPalette rejects files the helper did not write', () => {
  assert.throws(() => loadPalette(path.join(tmp, 'missing.json')), /cannot read/);
  assert.throws(() => loadPalette(write('fmt.json', { format: 2, mode: 'dark', roles })), /format 1/);
  assert.throws(() => loadPalette(write('mode.json', { format: 1, mode: 'dim', roles })), /mode/);
  assert.throws(() => loadPalette(write('roles.json', { format: 1, mode: 'dark', roles: { primary: '#000000' } })), /primary and surface/);
});

test('themeFromRoles fills every toolbar colour from a minimal palette', () => {
  const theme = themeFromRoles({ primary: '#a8b665', surface: '#32302f', on_surface: '#ddc7a1' }, 'dark', 'tonal');
  for (const [key, value] of Object.entries(theme.colors)) assert.match(value, /^#[0-9a-f]{6}$/, key);
  assert.equal(theme.properties.color_scheme, 'dark');
  assert.equal(themeFromRoles({ primary: '#a8b665' }, 'dark', 'tonal'), null);
});

test('vivid toolbar uses the primary container when there is one', () => {
  const full = { primary: '#586420', surface: '#fbf8f2', on_surface: '#1d1b18', primary_container: '#dcea9a', on_primary_container: '#1a1e00' };
  const vivid = themeFromRoles(full, 'light', 'vivid');
  assert.equal(vivid.colors.toolbar, '#dcea9a');
  assert.equal(vivid.properties.content_color_scheme, 'light');
  assert.equal(themeFromRoles(full, 'light', 'tonal').colors.toolbar, '#fbf8f2');
});

test('normaliseSettings whitelists keys and coerces values', () => {
  const s = normaliseSettings({ paletteSource: 'x', mode: 'light', websiteStyling: 'no', disabledSites: ['A.com', 'a.com', 5], extra: true });
  assert.equal(s.paletteSource, DEFAULT_SETTINGS.paletteSource);
  assert.equal(s.mode, 'light');
  assert.equal(s.websiteStyling, true);
  assert.deepEqual(s.disabledSites, ['a.com']);
  assert.equal('extra' in s, false);
});
