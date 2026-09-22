/* ShellTint — per-site CSS injection.
 *
 * The builder publishes compiled Catppuccin userstyles as content-addressed
 * blocks, with their @-moz-document matchers kept as data. The helper sends a
 * small index; this module decides which blocks each frame needs, fetches their
 * CSS on demand (a native message is capped at 1 MB), and inserts it with
 * scripting.insertCSS, which page CSP does not block.
 *
 * removeCSS only removes a sheet whose text is identical to what was inserted,
 * so the text for a list of hashes is always rebuilt the same way.
 */

'use strict';

const US_CACHE_LIMIT = 40 * 1024 * 1024;
const US_FETCH_TIMEOUT = 15000;

const us = {
    index: null,
    css: new Map(),       // hash -> css, in least-recently-used order
    cssBytes: 0,
    inflight: new Map(),  // hash -> Promise while being fetched
    pending: new Map(),   // reqId -> { resolve, reject, timer, parts }
    applied: new Map(),   // "tab:frame" -> { hashes, css }; css is null after a restart
    queues: new Map(),    // "tab:frame" -> Promise, so a frame is changed one step at a time
    persistTimer: null,
};

const usKey = (tabId, frameId) => `${tabId}:${frameId}`;
const usSameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function usActive() {
    return !!(us.index && st.settings.websiteStyling);
}

// ─── CSS cache ───
function usCachePut(hash, css) {
    if (us.css.has(hash)) us.cssBytes -= us.css.get(hash).length;
    us.css.delete(hash);
    us.css.set(hash, css);
    us.cssBytes += css.length;
    for (const [oldest, text] of us.css) {
        if (us.cssBytes <= US_CACHE_LIMIT || oldest === hash) break;
        us.css.delete(oldest);
        us.cssBytes -= text.length;
    }
}

function usCssFor(hashes) {
    return hashes.map(h => `/* shelltint:${h.slice(0, 12)} */\n${us.css.get(h)}`).join('\n');
}

// ─── Fetching from the helper ───
function usFetchCss(hashes) {
    const wanted = [...new Set(hashes)];
    const request = wanted.filter(h => !us.css.has(h) && !us.inflight.has(h));
    if (request.length) {
        const reqId = nextReqId();
        const fetched = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                us.pending.delete(reqId);
                reject(new Error('timed out fetching website CSS'));
            }, US_FETCH_TIMEOUT);
            us.pending.set(reqId, { resolve, reject, timer, parts: new Map() });
            if (!hostPost({ type: 'ST_GET_SITE_CSS', reqId, hashes: request })) {
                clearTimeout(timer);
                us.pending.delete(reqId);
                reject(new Error('the helper is not connected'));
            }
        });
        for (const h of request) {
            const done = fetched.finally(() => us.inflight.delete(h));
            done.catch(() => { });
            us.inflight.set(h, done);
        }
    }
    const waits = wanted.filter(h => us.inflight.has(h)).map(h => us.inflight.get(h));
    return Promise.allSettled(waits);
}

function usHandleSiteCss(msg) {
    const req = us.pending.get(msg.reqId);
    if (!req) return;
    for (const item of msg.items || []) {
        if (typeof item?.hash !== 'string' || typeof item.css !== 'string') continue;
        if ((item.parts || 1) <= 1) {
            usCachePut(item.hash, item.css);
            continue;
        }
        const parts = req.parts.get(item.hash) || new Array(item.parts).fill(null);
        parts[item.part] = item.css;
        req.parts.set(item.hash, parts);
        if (parts.every(p => typeof p === 'string')) {
            usCachePut(item.hash, parts.join(''));
            req.parts.delete(item.hash);
        }
    }
    if (msg.final) {
        clearTimeout(req.timer);
        us.pending.delete(msg.reqId);
        if (msg.missing?.length) console.warn('ShellTint: the helper has no CSS for', msg.missing.length, 'block(s)');
        req.resolve();
    }
}

function usHostGone() {
    for (const [reqId, req] of [...us.pending]) {
        clearTimeout(req.timer);
        us.pending.delete(reqId);
        req.reject(new Error('the helper disconnected'));
    }
}

// ─── Sites the user added ───
// Settings point a style at more sites (the user's own SearXNG, Homepage and
// other self-hosted instances). Those matchers are added to every block of
// that style, because upstream only knows a placeholder domain for them.
let usEffective = { key: null, index: null };

function usMatchIndex() {
    const custom = {};
    for (const id of SITE_IDS) {
        const lines = st.settings.siteInstances?.[id];
        if (lines?.length) custom[id] = STMatchers.parseSiteList(lines.join('\n'));
    }
    const key = `${us.index?.gen}:${us.index?.rev}|${JSON.stringify(custom)}`;
    if (usEffective.key === key) return usEffective.index;
    let index = us.index;
    if (index && Object.values(custom).some(list => list.length)) {
        index = {
            ...index,
            styles: index.styles.map(style => {
                const extra = custom[style.id];
                if (!extra?.length) return style;
                return { ...style, blocks: style.blocks.map(b => ({ ...b, matchers: [...b.matchers, ...extra] })) };
            }),
        };
    }
    usEffective = { key, index };
    return index;
}

function usHostOf(url) {
    try { return new URL(url).hostname; } catch { return ''; }
}

function usSiteDisabled(url) {
    return STMatchers.siteListed(st.settings.disabledSites, usHostOf(url));
}

// What the toolbar popup shows for the page in the active tab.
function usSiteState(url) {
    const themeable = STMatchers.isThemeable(url);
    const index = usMatchIndex();
    const styles = themeable && index
        ? index.styles
            .filter(style => style.blocks.some(b => STMatchers.blockMatches(b, url)))
            .map(style => style.name.replace(/\s+Catppuccin$/, ''))
        : [];
    const host = usHostOf(url);
    const customStyles = STCustomStyles.matchingStyles(st.customStyles, url, { includeDisabled: true })
        .map(({ id, name, enabled, replaceCatppuccin }) => ({ id, name, enabled, replaceCatppuccin }));
    return {
        host,
        siteKey: STMatchers.siteKey(host),
        themeable,
        styles,
        customStyles,
        built: !!us.index,
        siteEnabled: !usSiteDisabled(url),
        globalEnabled: st.settings.websiteStyling,
    };
}

// ─── Toolbar badge ───
// How many stylesheets a page is actually wearing, the way Stylus counts them:
// the Catppuccin styles that match, plus the user's own that are switched on.
function usAppliedCount(url) {
    if (!st.settings.websiteStyling || !STMatchers.isThemeable(url) || usSiteDisabled(url)) return 0;
    const mine = STCustomStyles.matchingStyles(st.customStyles, url);
    const index = mine.some(s => s.replaceCatppuccin) ? null : usMatchIndex();
    const catppuccin = index
        ? index.styles.filter(style => style.blocks.some(b => STMatchers.blockMatches(b, url))).length
        : 0;
    return catppuccin + mine.length;
}

async function usSetBadge(tabId, url) {
    const count = usAppliedCount(url);
    try {
        await browser.action.setBadgeText({ tabId, text: count ? String(count) : '' });
        if (!count) return;
        const roles = st.palette?.roles ?? {};
        await browser.action.setBadgeBackgroundColor({ tabId, color: roles.primary ?? '#d71921' });
        // Firefox picks a readable colour itself when this is unavailable.
        await browser.action.setBadgeTextColor?.({ tabId, color: roles.on_primary ?? '#ffffff' });
    } catch { /* the tab closed, or the badge is not available */ }
}

// The badge follows the top-level document, not subframes.
function usBadgeForTab(tabId) {
    browser.tabs.get(tabId).then(tab => {
        if (tab?.url) usSetBadge(tabId, tab.url);
    }).catch(() => { });
}

function usRefreshBadges() {
    browser.tabs.query({}).then(tabs => {
        for (const tab of tabs) if (tab.url) usSetBadge(tab.id, tab.url);
    }).catch(() => { });
}

function usSummary() {
    const index = us.index;
    if (!index) return null;
    return {
        gen: index.gen,
        mode: index.mode,
        sourceId: index.sourceId ?? null,
        ok: index.stats?.ok ?? index.styles.length,
        total: index.stats?.total ?? index.styles.length,
        failed: Array.isArray(index.stats?.failed) ? index.stats.failed : [],
        createdAt: index.createdAt ?? null,
    };
}

// ─── Applying to frames ───
function usEnsureFrame(tabId, frameId, url) {
    if (typeof tabId !== 'number' || tabId < 0 || typeof frameId !== 'number') return Promise.resolve();
    const key = usKey(tabId, frameId);
    const run = (us.queues.get(key) || st.ready)
        .then(() => usApplyFrame(tabId, frameId, url))
        .catch(e => console.debug('ShellTint: website style not applied to', url, e?.message || e));
    us.queues.set(key, run);
    run.finally(() => { if (us.queues.get(key) === run) us.queues.delete(key); });
    return run;
}

// The user's own styles for a page; they follow the Catppuccin blocks so they win ties.
function usCustomCss(url) {
    const mine = STCustomStyles.matchingStyles(st.customStyles, url);
    return {
        replace: mine.some(s => s.replaceCatppuccin),
        css: STCustomStyles.cssFor(mine, st.palette, us.index?.palette),
    };
}

const usJoin = (hashes, custom) => [hashes.length ? usCssFor(hashes) : '', custom].filter(Boolean).join('\n');

async function usApplyFrame(tabId, frameId, url) {
    const key = usKey(tabId, frameId);
    const old = us.applied.get(key);
    const on = st.settings.websiteStyling && !usSiteDisabled(url);
    const custom = on ? usCustomCss(url) : { replace: false, css: '' };
    let hashes = on && us.index && !custom.replace ? STMatchers.matchBlocks(usMatchIndex(), url) : [];
    const unchanged = () => old && usSameList(old.hashes, hashes) && old.custom === custom.css;
    if (unchanged()) return;
    if (!old && !hashes.length && !custom.css) return;

    if (hashes.length) {
        await usFetchCss(hashes);
        hashes = hashes.filter(h => us.css.has(h));
        if (unchanged()) return;
    }
    const css = usJoin(hashes, custom.css);

    const target = { tabId, frameIds: [frameId] };
    // Insert before removing, so the page never flashes unstyled in between.
    if (css) await browser.scripting.insertCSS({ target, css, origin: 'AUTHOR' });
    if (old) {
        let oldCss = old.css;
        if (oldCss === null) {
            await usFetchCss(old.hashes);
            oldCss = old.hashes.every(h => us.css.has(h)) ? usJoin(old.hashes, old.custom) : null;
        }
        if (oldCss) await browser.scripting.removeCSS({ target, css: oldCss, origin: 'AUTHOR' }).catch(() => { });
    }

    if (css) us.applied.set(key, { hashes, custom: custom.css, css });
    else us.applied.delete(key);
    usPersistSoon();
}

async function usRefreshAll() {
    await st.ready;
    let tabs;
    try { tabs = await browser.tabs.query({}); } catch { return; }
    tabs.sort((a, b) => Number(b.active) - Number(a.active));

    const frames = [];
    for (const tab of tabs) {
        if (tab.discarded) continue;
        let tabFrames = null;
        try { tabFrames = await browser.webNavigation.getAllFrames({ tabId: tab.id }); } catch { /* tab went away */ }
        for (const f of tabFrames || []) frames.push({ tabId: tab.id, frameId: f.frameId, url: f.url });
    }

    // One request for everything open, instead of one per frame.
    if (usActive()) {
        const wanted = new Set();
        for (const f of frames) {
            if (usSiteDisabled(f.url)) continue;
            for (const h of STMatchers.matchBlocks(usMatchIndex(), f.url)) wanted.add(h);
        }
        for (const entry of us.applied.values()) if (entry.css === null) entry.hashes.forEach(h => wanted.add(h));
        if (wanted.size) await usFetchCss([...wanted]);
    }

    const seen = new Set();
    for (const f of frames) {
        seen.add(usKey(f.tabId, f.frameId));
        usEnsureFrame(f.tabId, f.frameId, f.url);
    }
    // Frames that are gone keep nothing to remove.
    for (const key of [...us.applied.keys()]) if (!seen.has(key)) us.applied.delete(key);
    usPersistSoon();
    // Settings, the palette or the index just changed; every count may differ.
    usRefreshBadges();
}

// Returns true when the index is new and open pages need refreshing.
function usSetIndex(index) {
    if (index === null) {
        if (!us.index) return false;
        us.index = null;
        return true;
    }
    if (!index || index.format !== 1 || !Array.isArray(index.styles)) return false;
    if (us.index && us.index.gen === index.gen && us.index.rev === index.rev) return false;
    us.index = index;
    // Blocks of older generations stay cached only while a page still shows them.
    const live = new Set(index.styles.flatMap(s => s.blocks.map(b => b.hash)));
    for (const entry of us.applied.values()) entry.hashes.forEach(h => live.add(h));
    for (const [hash, text] of [...us.css]) {
        if (!live.has(hash)) {
            us.css.delete(hash);
            us.cssBytes -= text.length;
        }
    }
    return true;
}

function usForgetTab(tabId) {
    const prefix = `${tabId}:`;
    for (const key of [...us.applied.keys()]) if (key.startsWith(prefix)) us.applied.delete(key);
    usPersistSoon();
}

// ─── Surviving a suspended background page ───
// Only hashes are kept; the exact CSS is rebuilt from blocks, which the helper
// finds in any generation still on disk.
function usPersistSoon() {
    if (us.persistTimer) return;
    us.persistTimer = setTimeout(() => {
        us.persistTimer = null;
        const snapshot = {};
        for (const [key, entry] of us.applied) snapshot[key] = { hashes: entry.hashes, custom: entry.custom };
        browser.storage.session?.set({ usApplied: snapshot }).catch(() => { });
    }, 500);
}

browser.storage.session?.get('usApplied').then(res => {
    for (const [key, entry] of Object.entries(res?.usApplied || {})) {
        if (us.applied.has(key) || !Array.isArray(entry?.hashes)) continue;
        us.applied.set(key, { hashes: entry.hashes, custom: typeof entry.custom === 'string' ? entry.custom : '', css: null });
    }
}).catch(() => { });

// ─── Navigation ───
browser.webNavigation.onCommitted.addListener(d => {
    // A new document starts without any inserted sheet.
    if (d.frameId === 0) {
        usForgetTab(d.tabId);
        usSetBadge(d.tabId, d.url);
    } else {
        us.applied.delete(usKey(d.tabId, d.frameId));
    }
    usEnsureFrame(d.tabId, d.frameId, d.url);
});
browser.webNavigation.onDOMContentLoaded.addListener(d => usEnsureFrame(d.tabId, d.frameId, d.url));
browser.webNavigation.onHistoryStateUpdated.addListener(d => {
    if (d.frameId === 0) usSetBadge(d.tabId, d.url);
    usEnsureFrame(d.tabId, d.frameId, d.url);
});
browser.webNavigation.onReferenceFragmentUpdated.addListener(d => usEnsureFrame(d.tabId, d.frameId, d.url));
browser.tabs.onRemoved.addListener(tabId => usForgetTab(tabId));
browser.tabs.onActivated.addListener(({ tabId }) => usBadgeForTab(tabId));
