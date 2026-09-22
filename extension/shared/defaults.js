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

    // Styles whose upstream Catppuccin port only names a placeholder domain,
    // because the site is self-hosted and nobody but its owner knows the host.
    const SELF_HOSTED_SITES = [
        { id: 'searxng', label: 'SearXNG', placeholder: 'searxng.home.local\nhttps://search.example.com/searx/' },
        { id: 'homepage', label: 'Homepage', placeholder: 'homepage.home.local\nhttp://192.168.1.10:3000/' },
        { id: 'boringproxy', label: 'boringproxy', placeholder: 'boringproxy.home.local' },
        { id: 'openmediavault', label: 'OpenMediaVault', placeholder: 'omv.home.local' },
    ];
    const SITE_IDS = SELF_HOSTED_SITES.map(s => s.id);

    const DEFAULT_SETTINGS = Object.freeze({
        version: SETTINGS_VERSION,
        paletteSource: 'auto',      // one of PALETTE_SOURCES ids
        customPalettePath: '',      // used by the matugen source
        mode: 'follow',             // follow | dark | light
        toolbarTheming: true,
        toolbarStyle: 'tonal',      // tonal | vivid
        websiteStyling: true,
        disabledSites: [],          // site keys, e.g. "youtube.com"
        siteInstances: {},          // site id -> lines as typed, for SELF_HOSTED_SITES
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

    // Before 1.2.0 only SearXNG could be pointed at extra hosts, through a
    // setting of its own. Keep reading that key so an existing install keeps
    // its instances; it is dropped once the new shape has been written back.
    function siteInstances(input) {
        const raw = input.siteInstances && typeof input.siteInstances === 'object' ? input.siteInstances : {};
        const out = {};
        for (const id of SITE_IDS) {
            const lines = stringList(raw[id], 200);
            if (lines.length) out[id] = lines;
        }
        if (!out.searxng) {
            const legacy = stringList(input.searxngInstances, 200);
            if (legacy.length) out.searxng = legacy;
        }
        return out;
    }

    // Whitelists keys and coerces types, so storage or a message can never
    // introduce an unknown setting or a value of the wrong kind.
    function normaliseSettings(raw) {
        const input = raw && typeof raw === 'object' ? raw : {};
        const out = { ...DEFAULT_SETTINGS, disabledSites: [], siteInstances: {} };
        for (const [key, allowed] of Object.entries(ENUMS)) {
            if (allowed.includes(input[key])) out[key] = input[key];
        }
        for (const key of BOOLEANS) {
            if (typeof input[key] === 'boolean') out[key] = input[key];
        }
        if (typeof input.customPalettePath === 'string') out.customPalettePath = input.customPalettePath.trim().slice(0, 4096);
        out.disabledSites = [...new Set(stringList(input.disabledSites, 1000).map(s => s.toLowerCase()))].sort();
        out.siteInstances = siteInstances(input);
        out.version = SETTINGS_VERSION;
        return out;
    }

    const api = { SETTINGS_VERSION, PALETTE_SOURCES, SELF_HOSTED_SITES, SITE_IDS, DEFAULT_SETTINGS, normaliseSettings };
    Object.assign(root, api);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
