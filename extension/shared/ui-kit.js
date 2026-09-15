/* ShellTint — small DOM and palette helpers shared by the options page and popup. */

'use strict';

(function (root) {
    const HEX = /^#[0-9a-f]{6}$/i;

    // el('button', { class: 'st-btn', onclick: fn, 'aria-label': 'Copy' }, 'Copy')
    function el(tag, attrs, ...children) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs || {})) {
            if (value === undefined || value === null || value === false) continue;
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = value;
            else if (key === 'dataset') Object.assign(node.dataset, value);
            else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
            else if (key in node && typeof value !== 'string') node[key] = value;
            else node.setAttribute(key, value === true ? '' : String(value));
        }
        for (const child of children.flat()) {
            if (child === undefined || child === null || child === false) continue;
            node.append(child instanceof Node ? child : document.createTextNode(String(child)));
        }
        return node;
    }

    const TOKENS = [
        ['--st-surface', ['surface', 'background']],
        ['--st-surface-2', ['surface_container', 'surface']],
        ['--st-surface-3', ['surface_container_high', 'surface_variant', 'surface']],
        ['--st-on-surface', ['on_surface', 'on_background']],
        ['--st-on-surface-muted', ['on_surface_variant', 'on_surface']],
        ['--st-primary', ['primary']],
        ['--st-on-primary', ['on_primary']],
        ['--st-primary-container', ['primary_container', 'primary']],
        ['--st-on-primary-container', ['on_primary_container', 'on_primary']],
        ['--st-secondary', ['secondary']],
        ['--st-tertiary', ['tertiary']],
        ['--st-outline', ['outline_variant', 'outline']],
        ['--st-danger', ['error']],
    ];

    function applyPaletteTokens(palette) {
        const roles = palette && palette.roles;
        if (!roles || typeof roles !== 'object') return false;
        const style = document.documentElement.style;
        for (const [token, names] of TOKENS) {
            const value = names.map(name => roles[name]).find(v => typeof v === 'string' && HEX.test(v));
            if (value) style.setProperty(token, value);
        }
        if (palette.mode === 'dark' || palette.mode === 'light') document.documentElement.dataset.mode = palette.mode;
        return true;
    }

    function formatAgo(epochSeconds) {
        if (typeof epochSeconds !== 'number' || !isFinite(epochSeconds) || epochSeconds <= 0) return 'never';
        const seconds = Math.max(0, Date.now() / 1000 - epochSeconds);
        if (seconds < 45) return 'just now';
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 36) return `${hours} h ago`;
        const days = Math.round(hours / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    // Pages open in the shell's colours straight away, before the background answers.
    async function loadCachedPalette() {
        try {
            const { lastPalette } = await browser.storage.local.get('lastPalette');
            if (lastPalette) applyPaletteTokens(lastPalette);
            return lastPalette || null;
        } catch {
            return null;
        }
    }

    const api = { el, applyPaletteTokens, formatAgo, loadCachedPalette };
    root.STUi = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
