/* ShellTint — the user's own styles, Stylus-like.
 *
 * Each style is plain CSS applied to the sites it lists, after the Catppuccin
 * style. The shell's colours are available as CSS variables, so a style
 * follows theme changes.
 */

'use strict';

(function (root) {
    const LIMITS = Object.freeze({ maxStyles: 200, maxCss: 256 * 1024, maxName: 80, maxSites: 4000 });
    const HEX = /^#[0-9a-f]{6}$/i;

    // Roles exposed as --shelltint-<role with dashes>, with fallbacks for
    // sources that don't provide every Material 3 role.
    const ROLE_FALLBACKS = {
        primary: [], on_primary: ['surface'],
        primary_container: ['primary'], on_primary_container: ['on_surface'],
        secondary: ['primary'], on_secondary: ['on_primary', 'surface'],
        secondary_container: ['primary_container', 'surface_variant'], on_secondary_container: ['on_surface'],
        tertiary: ['secondary', 'primary'], on_tertiary: ['on_primary', 'surface'],
        error: [], on_error: ['surface'],
        background: ['surface'], on_background: ['on_surface'],
        surface: ['background'], on_surface: ['on_background'],
        surface_variant: ['surface_container_high', 'surface'], on_surface_variant: ['on_surface'],
        surface_container_lowest: ['surface_dim', 'background', 'surface'],
        surface_container_low: ['surface_container', 'surface'],
        surface_container: ['surface_container_low', 'surface'],
        surface_container_high: ['surface_variant', 'surface_container', 'surface'],
        surface_container_highest: ['surface_container_high', 'surface_variant', 'surface'],
        outline: ['on_surface_variant', 'on_surface'], outline_variant: ['outline', 'surface_variant'],
    };
    const PALETTE_VARS = Object.freeze(Object.keys(ROLE_FALLBACKS).map(role =>
        Object.freeze({ name: `--shelltint-${role.replace(/_/g, '-')}`, role })));

    const CATPPUCCIN_SLOTS = ['rosewater', 'flamingo', 'pink', 'mauve', 'red', 'maroon', 'peach', 'yellow', 'green',
        'teal', 'sky', 'sapphire', 'blue', 'lavender', 'text', 'subtext1', 'subtext0', 'overlay2', 'overlay1',
        'overlay0', 'surface2', 'surface1', 'surface0', 'base', 'mantle', 'crust'];
    const CATPPUCCIN_VARS = Object.freeze(CATPPUCCIN_SLOTS.map(slot => Object.freeze({ name: `--shelltint-ctp-${slot}`, slot })));

    function newStyleId() {
        const bytes = new Uint8Array(8);
        globalThis.crypto.getRandomValues(bytes);
        return 's' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    function sitesLines(text) {
        return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    }

    // Matchers for a style's site list; "*" becomes a matcher for every page.
    function siteMatchers(text) {
        const lines = sitesLines(text);
        const matchers = STMatchersRef().parseSiteList(lines.filter(l => l !== '*').join('\n'));
        if (lines.includes('*')) matchers.unshift({ t: 'url-prefix', v: '' });
        return matchers;
    }

    function sitesProblems(text) {
        const parse = STMatchersRef().parseSiteList;
        return sitesLines(text).filter(line => line !== '*' && !parse(line).length);
    }

    function normaliseStyle(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = typeof raw.id === 'string' && /^[a-z0-9]{1,40}$/i.test(raw.id) ? raw.id : null;
        if (!id) return null;
        const now = Date.now();
        return {
            id,
            name: String(raw.name || '').trim().slice(0, LIMITS.maxName) || 'Untitled style',
            enabled: raw.enabled !== false,
            sites: String(raw.sites || '').slice(0, LIMITS.maxSites),
            css: String(raw.css || '').slice(0, LIMITS.maxCss),
            replaceCatppuccin: raw.replaceCatppuccin === true,
            createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
            updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
        };
    }

    function normaliseStyles(list) {
        const out = [];
        const seen = new Set();
        for (const raw of Array.isArray(list) ? list : []) {
            const style = normaliseStyle(raw);
            if (style && !seen.has(style.id)) {
                seen.add(style.id);
                out.push(style);
            }
            if (out.length >= LIMITS.maxStyles) break;
        }
        return out;
    }

    // Matcher lists are cached per sites text, since this runs on every navigation.
    const matcherCache = new Map();
    function cachedMatchers(text) {
        let matchers = matcherCache.get(text);
        if (!matchers) {
            if (matcherCache.size > 500) matcherCache.clear();
            matchers = siteMatchers(text);
            matcherCache.set(text, matchers);
        }
        return matchers;
    }

    function matchingStyles(styles, url, options = {}) {
        const M = STMatchersRef();
        if (!M.isThemeable(url)) return [];
        return (styles || []).filter(style =>
            (options.includeDisabled || style.enabled) && M.blockMatches({ matchers: cachedMatchers(style.sites) }, url));
    }

    function paletteVarsCss(palette, catppuccin) {
        const roles = palette?.roles || {};
        const pick = role => [role, ...ROLE_FALLBACKS[role]].map(r => roles[r]).find(v => typeof v === 'string' && HEX.test(v));
        const decls = [];
        for (const { name, role } of PALETTE_VARS) {
            const value = pick(role);
            if (value) decls.push(`${name}: ${value.toLowerCase()};`);
        }
        for (const { name, slot } of CATPPUCCIN_VARS) {
            const value = catppuccin?.[slot];
            if (typeof value === 'string' && HEX.test(value)) decls.push(`${name}: ${value.toLowerCase()};`);
        }
        return decls.length ? `:root { ${decls.join(' ')} }` : '';
    }

    // The sheet inserted for a page: colour variables, then each style in list order.
    function cssFor(styles, palette, catppuccin) {
        if (!styles.length) return '';
        const parts = [`/* shelltint:vars */\n${paletteVarsCss(palette, catppuccin)}`];
        for (const style of styles) parts.push(`/* shelltint:style ${style.id} */\n${style.css}`);
        return parts.join('\n');
    }

    function STMatchersRef() {
        return root.STMatchers || require('./matchers.js');
    }

    const api = {
        LIMITS, PALETTE_VARS, CATPPUCCIN_VARS, newStyleId, siteMatchers, sitesProblems,
        normaliseStyle, normaliseStyles, matchingStyles, paletteVarsCss, cssFor,
    };
    root.STCustomStyles = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
