// Splits compiled userstyle CSS into site blocks the extension can inject.
//
// `@-moz-document` is only honoured in user stylesheets, never in CSS an
// extension inserts into a page, so each block is unwrapped here and its
// matchers are kept as data for the extension to evaluate itself.

import { createHash } from 'node:crypto';
import postcss from 'postcss';

// Top-level at-rules that apply regardless of site; they travel with every block.
const HOISTED = new Set(['charset', 'import', 'namespace', 'font-face', 'keyframes', 'property', 'layer']);

export function cssUnescape(value) {
  return value.replace(/\\(?:([0-9a-fA-F]{1,6})\s?|([\s\S]))/g, (_, hex, ch) => {
    if (!hex) return ch;
    const code = parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
  });
}

// Removes comments that sit outside strings; a regexp such as ".*\\/*" must survive.
function stripComments(text) {
  let out = '';
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < text.length) out += text[++i];
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 1;
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out;
}

const MATCHER = /(url-prefix|domain|regexp|url)\(\s*(?:"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|([^)\s]*))\s*\)/g;

export function parseMatchers(prelude) {
  const matchers = [];
  for (const m of stripComments(prelude).matchAll(MATCHER)) {
    const quoted = m[2] ?? m[3];
    matchers.push({ t: m[1], v: quoted !== undefined ? cssUnescape(quoted) : (m[4] ?? '') });
  }
  return matchers;
}

const sha256 = text => createHash('sha256').update(text).digest('hex');

export function splitCompiled(css) {
  const root = postcss.parse(css);
  const hoisted = [];
  const bodies = [];
  const warnings = [];

  root.each(node => {
    if (node.type === 'comment') return;
    if (node.type === 'atrule' && node.name === '-moz-document') {
      const prelude = node.raws.params?.raw ?? node.params;
      const matchers = parseMatchers(prelude);
      if (!matchers.length) {
        warnings.push(`unparsed @-moz-document ${prelude.replace(/\s+/g, ' ').slice(0, 80)}`);
        return;
      }
      const body = (node.nodes ?? []).map(child => child.toString()).join('\n').trim();
      if (body) bodies.push({ matchers, body });
      return;
    }
    if (node.type === 'atrule' && HOISTED.has(node.name)) {
      hoisted.push(node.toString());
      return;
    }
    // Plain top-level rules would theme every site; Stylus scopes them to the
    // style's own matchers, which a block can't express, so they are dropped.
    warnings.push(`dropped top-level ${node.type === 'atrule' ? `@${node.name}` : node.type}`);
  });

  const prefix = hoisted.join('\n');
  const blocks = bodies.map(({ matchers, body }) => {
    const text = prefix ? `${prefix}\n${body}` : body;
    return { matchers, css: text, hash: sha256(text), bytes: Buffer.byteLength(text) };
  });
  return { blocks, warnings };
}

// ─── Reading matchers without compiling ───
// A style's sites are almost always literal in its source, so the index can be
// published before any LESS runs and the CSS compiled only for sites actually
// visited. A handful of styles build their prelude with LESS instead
// (`regexp(replace(%("...", @urls), …))`); those are reported as non-static and
// must still be compiled to learn where they apply.

// The prelude ends at the first `{` outside a string or comment — a regexp
// matcher such as `[a-z]{2}` contains braces of its own.
function preludeEnd(css, from) {
  let quote = null;
  for (let i = from; i < css.length; i++) {
    const ch = css[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 1;
    } else if (ch === '{') {
      return i;
    }
  }
  return -1;
}

// True when the prelude is nothing but literal matchers, so what parseMatchers
// read from it is the whole truth.
function preludeIsStatic(prelude) {
  return stripComments(prelude).replace(MATCHER, '').trim().replace(/^[\s,]*$/, '') === '';
}

export function parseSourceBlocks(source) {
  const blocks = [];
  const re = /@-moz-document\b/gi;
  let match;
  while ((match = re.exec(source))) {
    const end = preludeEnd(source, match.index + match[0].length);
    if (end === -1) break;
    const prelude = source.slice(match.index + match[0].length, end);
    blocks.push({ matchers: parseMatchers(prelude), static: preludeIsStatic(prelude) });
    re.lastIndex = end;
  }
  return blocks;
}

// A style can be indexed without compiling only when every block's sites are
// literal and at least one matcher was found.
export function sourceIsStatic(blocks) {
  return blocks.length > 0 && blocks.every(b => b.static && b.matchers.length > 0);
}
