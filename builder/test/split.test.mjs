import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCompiled, cssUnescape } from '../split.mjs';

test('each @-moz-document becomes a block with its matchers', () => {
  const { blocks, warnings } = splitCompiled(`
@-moz-document domain("youtube.com"), url-prefix("https://studio.youtube.com") {
  :root { color: red; }
  @media (prefers-color-scheme: dark) { a { color: blue; } }
}
@-moz-document /* note */ regexp("https:\\\\/\\\\/github\\\\.com\\\\/.*") {
  body { background: black; }
}`);
  assert.deepEqual(warnings, []);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].matchers, [
    { t: 'domain', v: 'youtube.com' },
    { t: 'url-prefix', v: 'https://studio.youtube.com' },
  ]);
  assert.match(blocks[0].css, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(blocks[0].css, /@-moz-document/);
  assert.deepEqual(blocks[1].matchers, [{ t: 'regexp', v: 'https:\\/\\/github\\.com\\/.*' }]);
});

test('site-independent at-rules travel with every block; stray rules are dropped', () => {
  const { blocks, warnings } = splitCompiled(`
@font-face { font-family: X; src: local(X); }
body { color: red; }
@-moz-document domain("a.test") { p { color: blue; } }
@-moz-document domain("b.test") { p { color: green; } }`);
  assert.equal(blocks.length, 2);
  for (const b of blocks) assert.match(b.css, /^@font-face/);
  assert.deepEqual(warnings, ['dropped top-level rule']);
});

test('block hashes are stable and content-addressed', () => {
  const css = '@-moz-document domain("a.test") { p { color: blue; } }';
  const [a] = splitCompiled(css).blocks;
  const [b] = splitCompiled(css).blocks;
  assert.equal(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.bytes, Buffer.byteLength(a.css));
});

test('cssUnescape handles escaped characters and hex escapes', () => {
  assert.equal(cssUnescape('a\\\\b'), 'a\\b');
  assert.equal(cssUnescape('say \\"hi\\"'), 'say "hi"');
  assert.equal(cssUnescape('\\2f x'), '/x');
});
