/* ShellTint — settings schema shared by the background, options page and popup. */

'use strict';

(function (root) {
    const SETTINGS_VERSION = 1;

    const PALETTE_SOURCES = [
        { id: 'auto', label: 'Auto' },
        { id: 'dms', label: 'DankMaterialShell', short: 'DMS' },
        { id: 'caelestia', label: 'Caelestia' },
        { id: 'noctalia', label: 'Noctalia' },
        { id: 'end4', label: 'end-4 illogical-impulse', short: 'end-4' },
        { id: 'matugen', label: 'Matugen file' },
    ];

    const DEFAULT_SETTINGS = Object.freeze({
        version: SETTINGS_VERSION,
        paletteSource: 'auto',      // one of PALETTE_SOURCES ids
        customPalettePath: '',      // used by the matugen source
        mode: 'follow',             // follow | dark | light
        toolbarTheming: true,
        toolbarStyle: 'tonal',      // tonal | vivid
        websiteStyling: true,
        disabledSites: [],          // site keys, e.g. "youtube.com"
        searxngInstances: [],       // lines as typed
        autoCheckUpdates: true,     // look for new Catppuccin styles when the helper connects
    });

    const ENUMS = {
        paletteSource: PALETTE_SOURCES.map(s => s.id),
        mode: ['follow', 'dark', 'light'],
        toolbarStyle: ['tonal', 'vivid'],
    };
    const BOOLEANS = ['toolbarTheming', 'websiteStyling', 'autoCheckUpdates'];

    function stringList(value, limit) {
        if (!Array.isArray(value)) return [];
        const out = [];
        for (const item of value) {
            if (typeof item !== 'string') continue;
            const line = item.trim().slice(0, 500);
            if (line && !out.includes(line)) out.push(line);
            if (out.length >= limit) break;
        }
        return out;
    }

    // Whitelists keys and coerces types, so storage or a message can never
    // introduce an unknown setting or a value of the wrong kind.
    function normaliseSettings(raw) {
        const input = raw && typeof raw === 'object' ? raw : {};
        const out = { ...DEFAULT_SETTINGS, disabledSites: [], searxngInstances: [] };
        for (const [key, allowed] of Object.entries(ENUMS)) {
            if (allowed.includes(input[key])) out[key] = input[key];
        }
        for (const key of BOOLEANS) {
            if (typeof input[key] === 'boolean') out[key] = input[key];
        }
        if (typeof input.customPalettePath === 'string') out.customPalettePath = input.customPalettePath.trim().slice(0, 4096);
        out.disabledSites = [...new Set(stringList(input.disabledSites, 1000).map(s => s.toLowerCase()))].sort();
        out.searxngInstances = stringList(input.searxngInstances, 200);
        out.version = SETTINGS_VERSION;
        return out;
    }

    const api = { SETTINGS_VERSION, PALETTE_SOURCES, DEFAULT_SETTINGS, normaliseSettings };
    Object.assign(root, api);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
