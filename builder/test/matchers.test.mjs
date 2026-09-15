import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseMatchers } from '../split.mjs';

const require = createRequire(import.meta.url);
const { matchBlocks, blockMatches, parseSiteList } = require('../../extension/shared/matchers.js');

const block = (matchers, hash = 'h') => ({ hash, matchers });
const index = styles => ({ styles: styles.map((blocks, i) => ({ id: `s${i}`, blocks })) });

test('domain matches the host and its subdomains only', () => {
  const b = block([{ t: 'domain', v: 'youtube.com' }]);
  assert.ok(blockMatches(b, 'https://youtube.com/'));
  assert.ok(blockMatches(b, 'https://www.youtube.com/watch?v=1'));
  assert.ok(blockMatches(b, 'https://m.youtube.com/'));
  assert.ok(!blockMatches(b, 'https://notyoutube.com/'));
  assert.ok(!blockMatches(b, 'https://youtube.com.evil.test/'));
});

test('url-prefix and url compare the whole URL', () => {
  assert.ok(blockMatches(block([{ t: 'url-prefix', v: 'https://studio.youtube.com' }]), 'https://studio.youtube.com/channel/x'));
  assert.ok(!blockMatches(block([{ t: 'url-prefix', v: 'https://studio.youtube.com' }]), 'https://www.youtube.com/'));
  assert.ok(blockMatches(block([{ t: 'url', v: 'https://a.test/x' }]), 'https://a.test/x'));
  assert.ok(!blockMatches(block([{ t: 'url', v: 'https://a.test/x' }]), 'https://a.test/x/y'));
});

test('regexp must match the entire URL, and an invalid one never matches', () => {
  assert.ok(blockMatches(block([{ t: 'regexp', v: 'https://a\\.test/.*' }]), 'https://a.test/page'));
  assert.ok(!blockMatches(block([{ t: 'regexp', v: 'a\\.test' }]), 'https://a.test/page'));
  assert.ok(!blockMatches(block([{ t: 'regexp', v: '(' }]), 'https://a.test/'));
});

test('only web and file URLs are themeable', () => {
  const all = block([{ t: 'url-prefix', v: '' }]);
  assert.ok(blockMatches(all, 'https://a.test/'));
  assert.ok(!blockMatches(all, 'about:config'));
  assert.ok(!blockMatches(all, 'moz-extension://x/options.html'));
});

test('matchBlocks keeps order and skips duplicate hashes', () => {
  const idx = index([
    [block([{ t: 'domain', v: 'x.com' }], 'a'), block([{ t: 'domain', v: 'api.x.com' }], 'b')],
    [block([{ t: 'domain', v: 'x.com' }], 'a'), block([{ t: 'domain', v: 'x.com' }], 'c')],
  ]);
  assert.deepEqual(matchBlocks(idx, 'https://x.com/home'), ['a', 'c']);
  assert.deepEqual(matchBlocks(idx, 'https://api.x.com/1'), ['a', 'b', 'c']);
});

test('parseMatchers decodes CSS-escaped strings and ignores comments', () => {
  const prelude = '/* comment with domain("nope.test") */ domain("twitter.com"),\n  domain("x.com"), regexp("https:\\\\/\\\\/www.deepl.com\\\\/?(.*\\\\/)translator.*$")';
  assert.deepEqual(parseMatchers(prelude), [
    { t: 'domain', v: 'twitter.com' },
    { t: 'domain', v: 'x.com' },
    { t: 'regexp', v: 'https:\\/\\/www.deepl.com\\/?(.*\\/)translator.*$' },
  ]);
  assert.deepEqual(parseMatchers('regexp(".*\\\\/*end")'), [{ t: 'regexp', v: '.*\\/*end' }]);
});

// The real bundle: every style's first site gets at least one block, and
// GitHub's exclusions hold.
const bundleFile = path.join(process.env.SHELLTINT_BUNDLE || path.join(os.homedir(), '.cache/shelltint/catppuccin'), 'import.json');
const bundle = fs.existsSync(bundleFile) ? JSON.parse(fs.readFileSync(bundleFile, 'utf8')).filter(e => e?.sourceCode) : null;

// Preludes can hold braces inside quoted regexps (Pinterest's `[a-z]{2}`), so
// scan to the first unquoted `{` instead of matching with a regex.
function bundleBlocks(entry) {
  const src = entry.sourceCode;
  const blocks = [];
  for (let at = src.indexOf('@-moz-document'); at !== -1; at = src.indexOf('@-moz-document', at + 1)) {
    let i = at + '@-moz-document'.length;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') break;
    }
    blocks.push(block(parseMatchers(src.slice(at + '@-moz-document'.length, i)), `b${blocks.length}`));
  }
  return blocks;
}

test('GitHub style themes repositories but not the excluded pages', { skip: !bundle }, () => {
  const github = bundle.find(e => e.usercssData?.name === 'GitHub Catppuccin');
  const idx = index([bundleBlocks(github)]);
  assert.ok(matchBlocks(idx, 'https://github.com/torvalds/linux').length > 0);
  assert.deepEqual(matchBlocks(idx, 'https://github.com/home'), []);
  assert.deepEqual(matchBlocks(idx, 'https://github.com/features/copilot'), []);
  assert.deepEqual(matchBlocks(idx, 'https://github.com/organizations/plan'), []);
});

test('every style has at least one block that parses', { skip: !bundle }, () => {
  const empty = bundle.filter(e => !bundleBlocks(e).some(b => b.matchers.length)).map(e => e.usercssData?.name);
  assert.deepEqual(empty, []);
});

test('parseSiteList turns typed instances into matchers', () => {
  assert.deepEqual(parseSiteList('searxng.home.local\n\n  # my server\nhttps://Search.Example.com/\nhttp://10.0.0.5:8888/searx/\nnot a site\nsearxng.home.local'), [
    { t: 'domain', v: 'searxng.home.local' },
    { t: 'domain', v: 'search.example.com' },
    { t: 'url-prefix', v: 'http://10.0.0.5:8888/searx' },
  ]);
  const b = block(parseSiteList('searxng.home.local\nhttp://10.0.0.5:8888/searx/'));
  assert.ok(blockMatches(b, 'https://searxng.home.local/search?q=x'));
  assert.ok(blockMatches(b, 'http://10.0.0.5:8888/searx/search?q=x'));
  assert.ok(!blockMatches(b, 'http://10.0.0.5:8888/other'));
});

test('switched-off sites cover their subdomains and ignore www', () => {
  const { siteKey, siteListed } = require('../../extension/shared/matchers.js');
  assert.equal(siteKey('WWW.YouTube.com'), 'youtube.com');
  const off = ['youtube.com'];
  assert.ok(siteListed(off, 'www.youtube.com'));
  assert.ok(siteListed(off, 'm.youtube.com'));
  assert.ok(!siteListed(off, 'notyoutube.com'));
  assert.ok(!siteListed(off, ''));
  assert.ok(!siteListed(undefined, 'github.com'));
});
