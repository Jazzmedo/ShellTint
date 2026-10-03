/* ShellTint — syntax colouring and suggestions for the My styles editor.
 *
 * The textarea stays the real editor (undo, selection, IME all native); its
 * text is transparent and a coloured <pre> underneath shows the same text.
 */

'use strict';

(function (root) {
    // ponytail: a single-pass scanner, enough for colouring and for knowing
    // "property or value?"; it doesn't parse CSS. Odd nesting may colour a
    // selector as a property until the next { ; or }.
    const RE = {
        comment: /\/\*[\s\S]*?(?:\*\/|$)/y,
        space: /\s+/y,
        string: /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/y,
        atrule: /@[\w-]+/y,
        selector: /[^{};,"'/\s]+(?:\s+[^{};,"'/\s]+)*/y,
        property: /[\w-]+/y,
        color: /#[0-9a-f]{3,8}(?![\w-])/iy,
        important: /!\s*important\b/iy,
        func: /[\w-]+(?=\()/y,
        variable: /--[\w-]+/y,
        ident: /-?[a-z_][\w-]*/iy,
        number: /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:%|[a-z]+)?/iy,
    };

    function match(re, css, i) {
        re.lastIndex = i;
        const m = re.exec(css);
        return m && m[0];
    }

    // Is the statement at i a nested rule (a `{` comes first) or a declaration?
    function startsRule(css, i) {
        for (; i < css.length; i++) {
            const ch = css[i];
            if (ch === '{') return true;
            if (ch === ';' || ch === '}') return false;
        }
        return false;
    }

    // → { tokens: [{ type, text }], mode, depth, property }
    function scan(css) {
        const tokens = [];
        let i = 0;
        let depth = 0;
        let mode = 'start';      // start | selector | property | value
        let property = '';
        const push = (type, text) => {
            tokens.push({ type, text });
            i += text.length;
        };
        while (i < css.length) {
            let text;
            if ((text = match(RE.comment, css, i))) { push('comment', text); continue; }
            if ((text = match(RE.space, css, i))) { push('text', text); continue; }
            if ((text = match(RE.string, css, i))) { push('string', text); continue; }
            const ch = css[i];
            if (ch === '{') { depth++; mode = 'start'; push('punct', ch); continue; }
            if (ch === '}') { depth = Math.max(0, depth - 1); mode = 'start'; push('punct', ch); continue; }
            if (ch === ';') { mode = 'start'; push('punct', ch); continue; }
            if (mode === 'start') {
                if (ch === '@') {
                    mode = 'value';
                    property = '';
                    push('atrule', match(RE.atrule, css, i) || ch);
                    continue;
                }
                mode = depth === 0 || startsRule(css, i) ? 'selector' : 'property';
            }
            if (mode === 'selector') {
                push('selector', match(RE.selector, css, i) || ch);
            } else if (mode === 'property') {
                if (ch === ':') { mode = 'value'; push('punct', ch); continue; }
                text = match(RE.property, css, i);
                if (text) property = text.toLowerCase();
                push(text ? (text.startsWith('--') ? 'variable' : 'property') : 'text', text || ch);
            } else if ((text = match(RE.color, css, i))) push('color', text);
            else if ((text = match(RE.important, css, i))) push('important', text);
            else if ((text = match(RE.func, css, i))) push('function', text);
            else if ((text = match(RE.variable, css, i))) push('variable', text);
            else if ((text = match(RE.ident, css, i))) push('value', text);
            else if ((text = match(RE.number, css, i))) push('number', text);
            else push(/[(),:]/.test(ch) ? 'punct' : 'text', ch);
        }
        return { tokens, mode, depth, property };
    }

    const tokenize = css => scan(css).tokens;

    // What the word ending at offset is: { kind: property|value|var|none, prefix, property }
    function contextAt(css, offset) {
        const before = css.slice(0, offset);
        const prefix = before.match(/[\w-]*$/)[0];
        const head = before.slice(0, before.length - prefix.length);
        if (/var\(\s*$/.test(head)) return { kind: 'var', prefix, property: '' };
        const last = scan(head);
        const tail = last.tokens[last.tokens.length - 1];
        const open = tail && ((tail.type === 'comment' && !tail.text.endsWith('*/'))
            || (tail.type === 'string' && !/^(["']).*\1$/s.test(tail.text)));
        if (open) {
            return { kind: 'none', prefix, property: '' };
        }
        if (last.mode === 'value') return { kind: last.property ? 'value' : 'none', prefix, property: last.property };
        if (last.mode === 'property' || (last.mode === 'start' && last.depth > 0)) return { kind: 'property', prefix, property: '' };
        return { kind: 'none', prefix, property: '' };
    }

    const SHORTHANDS = ['all', 'animation', 'background', 'border', 'border-block', 'border-bottom', 'border-color',
        'border-image', 'border-inline', 'border-left', 'border-radius', 'border-right', 'border-style', 'border-top',
        'border-width', 'columns', 'flex', 'flex-flow', 'font', 'gap', 'grid', 'grid-area', 'grid-column', 'grid-row',
        'grid-template', 'inset', 'inset-block', 'inset-inline', 'list-style', 'margin', 'margin-block', 'margin-inline',
        'mask', 'outline', 'overflow', 'padding', 'padding-block', 'padding-inline', 'place-content', 'place-items',
        'place-self', 'scroll-margin', 'scroll-padding', 'text-decoration', 'transition'];

    const GLOBAL_VALUES = ['inherit', 'initial', 'unset', 'revert', 'none', 'auto', 'transparent', 'currentColor', '!important'];
    // ponytail: keywords for common properties only; MDN's css data covers all of them if this feels thin.
    const VALUES = {
        display: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'none'],
        position: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
        cursor: ['pointer', 'default', 'text', 'move', 'not-allowed', 'grab', 'help', 'wait', 'crosshair'],
        visibility: ['visible', 'hidden', 'collapse'],
        overflow: ['visible', 'hidden', 'clip', 'scroll', 'auto'],
        'overflow-x': ['visible', 'hidden', 'clip', 'scroll', 'auto'],
        'overflow-y': ['visible', 'hidden', 'clip', 'scroll', 'auto'],
        'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
        'font-weight': ['normal', 'bold', 'bolder', 'lighter', '400', '500', '600', '700'],
        'font-style': ['normal', 'italic', 'oblique'],
        'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
        'flex-wrap': ['nowrap', 'wrap', 'wrap-reverse'],
        'justify-content': ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'start', 'end'],
        'align-items': ['stretch', 'flex-start', 'flex-end', 'center', 'baseline', 'start', 'end'],
        'box-sizing': ['content-box', 'border-box'],
        'white-space': ['normal', 'nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
        'pointer-events': ['auto', 'none'],
        'border-style': ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'hidden'],
        'text-decoration': ['none', 'underline', 'overline', 'line-through'],
        'text-transform': ['none', 'uppercase', 'lowercase', 'capitalize'],
        'mix-blend-mode': ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference'],
    };

    // Best matches first: prefix matches, then substring matches.
    function rank(items, prefix, limit = 50) {
        const p = prefix.toLowerCase();
        const starts = [];
        const contains = [];
        for (const item of items) {
            const text = item.label.toLowerCase();
            if (text === p) continue;
            if (text.startsWith(p)) starts.push(item);
            else if (p && text.includes(p)) contains.push(item);
        }
        return [...starts, ...contains].slice(0, limit);
    }

    // ─── DOM ───
    let propertyNames = null;
    function properties() {
        if (!propertyNames) {
            const names = new Set(SHORTHANDS);
            for (const name of root.getComputedStyle(root.document.documentElement)) names.add(name);
            propertyNames = [...names].sort((a, b) => (a.startsWith('-') - b.startsWith('-')) || a.localeCompare(b));
        }
        return propertyNames;
    }

    function suggestions(ctx, vars) {
        if (ctx.kind === 'property') {
            return rank(properties().map(name => ({ label: name, insert: `${name}: ` })), ctx.prefix);
        }
        if (ctx.kind === 'var') {
            return rank(vars.map(v => ({ label: v.name, insert: v.name, colour: v.colour, detail: v.detail })), ctx.prefix);
        }
        if (ctx.kind === 'value') {
            const words = [...(VALUES[ctx.property] || []), ...GLOBAL_VALUES].map(w => ({ label: w, insert: w }));
            const varItems = vars.map(v => ({ label: `var(${v.name})`, insert: `var(${v.name})`, colour: v.colour, detail: v.detail }));
            // Substring matching lets "pri" find var(--shelltint-primary) too.
            return rank([...words, ...varItems], ctx.prefix);
        }
        return [];
    }

    let nextId = 1;

    /* Wraps textarea in the coloured overlay and adds the suggestion popup.
     * options.vars() → [{ name, colour?, detail? }]; options.insert(textarea, text)
     * replaces the selection, keeping undo. Returns { refresh }. */
    function attachCssEditor(textarea, options) {
        const doc = textarea.ownerDocument;
        const id = `code-suggest-${nextId++}`;
        const wrap = doc.createElement('div');
        wrap.className = 'code-wrap';
        const pre = doc.createElement('pre');
        pre.className = 'code-hl';
        pre.setAttribute('aria-hidden', 'true');
        const list = doc.createElement('ul');
        list.className = 'code-suggest';
        list.id = id;
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'CSS suggestions');
        list.hidden = true;
        textarea.before(wrap);
        wrap.append(pre, textarea, list);
        textarea.classList.add('code-input');
        textarea.setAttribute('aria-autocomplete', 'list');
        textarea.setAttribute('aria-controls', id);

        // ─── Colouring ───
        // ponytail: very large sheets are shown uncoloured, since one span per token gets slow past ~64 KB.
        const MAX_COLOURED = 64 * 1024;
        let shown = null;
        let frame = 0;

        function render() {
            cancelAnimationFrame(frame);
            frame = 0;
            const css = textarea.value;
            if (css === shown) return;
            shown = css;
            const out = doc.createDocumentFragment();
            if (css.length > MAX_COLOURED) {
                out.append(css);
            } else {
                let plain = '';
                for (const { type, text } of tokenize(css)) {
                    if (type === 'text' || type === 'punct') { plain += text; continue; }
                    if (plain) { out.append(plain); plain = ''; }
                    const span = doc.createElement('span');
                    span.className = `tk-${type}`;
                    span.textContent = text;
                    if (type === 'color') span.style.backgroundColor = `color-mix(in srgb, ${text} 30%, transparent)`;
                    out.append(span);
                }
                if (plain) out.append(plain);
            }
            out.append('\n');   // keeps a trailing empty line as tall as the textarea's
            pre.replaceChildren(out);
            syncScroll();
        }

        function schedule() {
            if (!frame) frame = requestAnimationFrame(render);
        }

        function syncScroll() {
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
        }

        // ─── Suggestions ───
        let items = [];
        let active = 0;
        let ctx = null;

        function close() {
            if (list.hidden) return;
            list.hidden = true;
            items = [];
            textarea.removeAttribute('aria-activedescendant');
        }

        // Where the character at offset sits, relative to the wrap.
        function caretPoint(offset) {
            const css = textarea.value;
            const walker = doc.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
            const range = doc.createRange();
            const at = (target, side) => {
                let seen = 0;
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    if (target < seen + node.length) {
                        range.setStart(node, target - seen);
                        range.setEnd(node, target - seen + 1);
                        const rect = range.getBoundingClientRect();
                        return { x: side === 'left' ? rect.left : rect.right, top: rect.top, bottom: rect.bottom };
                    }
                    seen += node.length;
                }
                return null;
            };
            let point = null;
            if (offset < css.length && css[offset] !== '\n') point = at(offset, 'left');
            else if (offset > 0 && css[offset - 1] !== '\n') point = at(offset - 1, 'right');
            const box = wrap.getBoundingClientRect();
            if (!point) {
                // An empty line: estimate from the line number.
                const style = getComputedStyle(pre);
                const line = css.slice(0, offset).split('\n').length - 1;
                const lineHeight = parseFloat(style.lineHeight) || 20;
                const top = box.top + parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth) + line * lineHeight - pre.scrollTop;
                point = { x: box.left + parseFloat(style.paddingLeft), top, bottom: top + lineHeight };
            }
            return { x: point.x - box.left, y: point.bottom - box.top };
        }

        function paint() {
            list.replaceChildren(...items.map((item, i) => {
                const li = doc.createElement('li');
                li.id = `${id}-${i}`;
                li.className = 'code-suggest-item';
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', String(i === active));
                const swatch = doc.createElement('span');
                swatch.className = 'code-suggest-swatch';
                if (item.colour) swatch.style.background = item.colour;
                else swatch.hidden = true;
                const label = doc.createElement('span');
                label.className = 'code-suggest-label';
                label.textContent = item.label;
                li.append(swatch, label);
                if (item.detail) {
                    const detail = doc.createElement('span');
                    detail.className = 'code-suggest-detail';
                    detail.textContent = item.detail;
                    li.append(detail);
                }
                li.addEventListener('mousedown', event => {
                    event.preventDefault();   // keep focus in the textarea
                    accept(i);
                });
                return li;
            }));
            textarea.setAttribute('aria-activedescendant', `${id}-${active}`);
            list.children[active]?.scrollIntoView({ block: 'nearest' });
        }

        function open(force) {
            const offset = textarea.selectionEnd;
            if (textarea.selectionStart !== offset) return close();
            ctx = contextAt(textarea.value, offset);
            if (!force && !ctx.prefix && ctx.kind !== 'var') return close();
            items = suggestions(ctx, options.vars());
            if (!items.length) return close();
            active = 0;
            render();
            const { x, y } = caretPoint(offset - ctx.prefix.length);
            list.hidden = false;
            paint();
            const maxX = wrap.clientWidth - list.offsetWidth - 4;
            list.style.left = `${Math.max(4, Math.min(x, maxX))}px`;
            list.style.top = `${y + 2}px`;
            return undefined;
        }

        function accept(i) {
            const item = items[i];
            if (!item || !ctx) return;
            const end = textarea.selectionEnd;
            textarea.setSelectionRange(end - ctx.prefix.length, end);
            let text = item.insert;
            // Don't double a ": " or ")" that is already there.
            const after = textarea.value.slice(end);
            if (text.endsWith(': ') && /^\s*:/.test(after)) text = text.slice(0, -2);
            close();
            options.insert(textarea, text);
        }

        textarea.addEventListener('keydown', event => {
            if (event.key === ' ' && event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                open(true);
                return;
            }
            if (list.hidden) return;
            const move = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[event.key];
            if (move && !event.altKey && !event.ctrlKey) {
                event.preventDefault();
                active = Math.max(0, Math.min(items.length - 1, active + move));
                paint();
            } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                accept(active);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
            } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                close();
            }
        });

        textarea.addEventListener('input', event => {
            schedule();
            // A typed "(" opens it too, so "var(" offers the variables straight away.
            const typed = event.inputType === 'insertText' && /^[\w(-]$/.test(event.data || '');
            if (typed || (!list.hidden && event.inputType?.startsWith('delete'))) open(false);
            else close();
        });
        textarea.addEventListener('scroll', () => {
            syncScroll();
            if (!list.hidden) open(false);
        });
        textarea.addEventListener('blur', close);
        textarea.addEventListener('mousedown', close);

        render();
        return { refresh: render, close };
    }

    const api = { tokenize, contextAt, rank, attachCssEditor, VALUES, GLOBAL_VALUES };
    root.STCssEditor = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
