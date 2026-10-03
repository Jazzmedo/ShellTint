import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../../extension/shared/css-editor.js');

const SAMPLE = `/* tweaks */
@media (min-width: 600px) {
  ytd-app:hover > .x, a[href="#"] {
    --mine: 4px;
    color: var(--shelltint-primary) !important;
    background: #1e1e2e url('a.png');
    margin: -1.5em 0 calc(100% - 2px);
    &:focus { outline: none; }
  }
}
`;

const types = css => E.tokenize(css).filter(t => t.type !== 'text' && t.type !== 'punct');
const find = (css, text) => E.tokenize(css).find(t => t.text === text)?.type;

test('tokens cover the input exactly', () => {
  for (const css of [SAMPLE, '', 'a{', '/* open', '"open', 'a { color: #fff', '}}}{;:']) {
    assert.equal(E.tokenize(css).map(t => t.text).join(''), css);
  }
});

test('every token type is recognised', () => {
  assert.equal(find(SAMPLE, '/* tweaks */'), 'comment');
  assert.equal(find(SAMPLE, '@media'), 'atrule');
  assert.equal(find(SAMPLE, 'ytd-app:hover > .x'), 'selector');
  assert.equal(find(SAMPLE, '"#"'), 'string');
  assert.equal(find(SAMPLE, '--mine'), 'variable');
  assert.equal(find(SAMPLE, 'color'), 'property');
  assert.equal(find(SAMPLE, 'var'), 'function');
  assert.equal(find(SAMPLE, '--shelltint-primary'), 'variable');
  assert.equal(find(SAMPLE, '!important'), 'important');
  assert.equal(find(SAMPLE, '#1e1e2e'), 'color');
  assert.equal(find(SAMPLE, '-1.5em'), 'number');
  assert.equal(find(SAMPLE, '100%'), 'number');
  assert.equal(find(SAMPLE, "'a.png'"), 'string');
  assert.equal(find(SAMPLE, '&:focus'), 'selector');   // nested rule, not a property
  assert.equal(find(SAMPLE, 'none'), 'value');
  assert.ok(types('a { color: red }').some(t => t.type === 'value' && t.text === 'red'));
});

test('contextAt tells properties, values and var() apart', () => {
  const at = css => E.contextAt(css, css.length);
  assert.deepEqual(at('a {\n  dis'), { kind: 'property', prefix: 'dis', property: '' });
  assert.deepEqual(at('a { display: fl'), { kind: 'value', prefix: 'fl', property: 'display' });
  assert.deepEqual(at('a { color: var(--shelltint-p'), { kind: 'var', prefix: '--shelltint-p', property: '' });
  assert.deepEqual(at('a { color: red; back'), { kind: 'property', prefix: 'back', property: '' });
  assert.equal(at('ytd-ap').kind, 'none');                 // a selector
  assert.equal(at('a { /* dis').kind, 'none');              // inside a comment
  assert.equal(at('a { content: "dis').kind, 'none');       // inside a string
  assert.equal(at('@media (min-wid').kind, 'none');
  assert.equal(at('a { b { col').kind, 'property');         // nested rule
});

test('rank puts prefix matches before substring matches', () => {
  const items = ['inline-flex', 'flex', 'flex-wrap', 'display'].map(label => ({ label }));
  assert.deepEqual(E.rank(items, 'fle').map(x => x.label), ['flex', 'flex-wrap', 'inline-flex']);
  assert.deepEqual(E.rank(items, 'flex').map(x => x.label), ['flex-wrap', 'inline-flex']);   // exact match adds nothing
});
