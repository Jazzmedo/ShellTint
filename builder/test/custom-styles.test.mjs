import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CS = require('../../extension/shared/custom-styles.js');

const style = (over = {}) => CS.normaliseStyle({ id: 'abc', name: 'Mine', sites: 'example.com', css: 'body{color:red}', ...over });

test('site lists match hosts, subdomains, URL prefixes and "*"', () => {
  const styles = [
    style({ id: 'a', sites: 'example.com\n# note\nhttp://10.0.0.5:8888/searx/' }),
    style({ id: 'b', sites: '*' }),
    style({ id: 'c', sites: 'other.org', enabled: false }),
  ];
  assert.deepEqual(CS.matchingStyles(styles, 'https://www.example.com/x').map(s => s.id), ['a', 'b']);
  assert.deepEqual(CS.matchingStyles(styles, 'http://10.0.0.5:8888/searx/search').map(s => s.id), ['a', 'b']);
  assert.deepEqual(CS.matchingStyles(styles, 'https://notexample.com/').map(s => s.id), ['b']);
  assert.deepEqual(CS.matchingStyles(styles, 'https://other.org/').map(s => s.id), ['b']);
  assert.deepEqual(CS.matchingStyles(styles, 'https://other.org/', { includeDisabled: true }).map(s => s.id), ['b', 'c']);
  assert.deepEqual(CS.matchingStyles(styles, 'about:config'), []);
  assert.deepEqual(CS.sitesProblems('example.com\n*\nnot a site\n# x'), ['not a site']);
});

test('normalise enforces ids, limits and types', () => {
  assert.equal(CS.normaliseStyle({ name: 'no id' }), null);
  assert.equal(CS.normaliseStyle({ id: '../x' }), null);
  const s = CS.normaliseStyle({ id: 'x1', name: '  ', css: 'a'.repeat(CS.LIMITS.maxCss + 10), enabled: 0, replaceCatppuccin: 'yes' });
  assert.equal(s.name, 'Untitled style');
  assert.equal(s.css.length, CS.LIMITS.maxCss);
  assert.equal(s.enabled, true);
  assert.equal(s.replaceCatppuccin, false);
  assert.deepEqual(CS.normaliseStyles([{ id: 'a' }, { id: 'a' }, null, { id: 'b' }]).map(x => x.id), ['a', 'b']);
  assert.match(CS.newStyleId(), /^s[0-9a-f]{16}$/);
});

test('css starts with shell colour variables, with fallbacks, then styles in order', () => {
  const palette = { roles: { primary: '#A8B665', surface: '#32302f', on_surface: '#ddc7a1' } };
  const css = CS.cssFor([style({ id: 'one', css: 'a{}' }), style({ id: 'two', css: 'b{}' })], palette, { base: '#1d2021', bogus: 'x' });
  assert.match(css, /--shelltint-primary: #a8b665;/);
  assert.match(css, /--shelltint-surface-container-high: #32302f;/);
  assert.match(css, /--shelltint-ctp-base: #1d2021;/);
  assert.ok(css.indexOf('a{}') < css.indexOf('b{}'));
  assert.equal(CS.cssFor([], palette), '');
  assert.equal(CS.paletteVarsCss(null, null), '');
});
