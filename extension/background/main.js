/* ShellTint — settings, messages from extension pages, and start-up. */

'use strict';

const THEME_KEYS = ['toolbarTheming', 'toolbarStyle'];
const PAGE_KEYS = ['websiteStyling', 'disabledSites', 'searxngInstances'];

async function saveSettings(next) {
    const before = st.settings;
    st.settings = normaliseSettings(next);
    st.storedSettings = true;
    await browser.storage.local.set({ settings: st.settings });
    if (THEME_KEYS.some(k => before[k] !== st.settings[k])) applyTheme();
    if (PAGE_KEYS.some(k => JSON.stringify(before[k]) !== JSON.stringify(st.settings[k]))) usRefreshAll();
    broadcast('settings');
    return st.settings;
}

async function updateSettings(patch) {
    await st.ready;
    const settings = await saveSettings({ ...st.settings, ...(patch && typeof patch === 'object' ? patch : {}) });
    sendSettingsToHost();
    return { ok: true, settings };
}

function getState() {
    return {
        settings: st.settings,
        host: st.host,
        palette: st.palette,
        paletteError: st.paletteError,
        sources: st.sources,
        styles: usSummary(),
        build: st.build,
    };
}

const PAGE_MESSAGES = {
    'st:get-state': () => getState(),
    'st:update-settings': message => updateSettings(message.patch),
    'st:site-state': message => usSiteState(String(message.url || '')),
    'st:detect-sources': () => hostRequest({ type: 'ST_DETECT_SOURCES' }),
    'st:rebuild': message => hostRequest({ type: 'ST_REBUILD', force: !!message.force }),
    'st:check-updates': () => hostRequest({ type: 'ST_CHECK_UPDATES' }),
    'st:reconnect': () => {
        disconnectHost();
        st.reconnectDelay = 2000;
        connectHost();
        return { ok: true };
    },
};

browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id || typeof message?.type !== 'string') return undefined;

    // The only message content scripts send.
    if (message.type === 'st:frame-ready') {
        if (sender.tab && typeof sender.frameId === 'number') usEnsureFrame(sender.tab.id, sender.frameId, sender.url);
        return undefined;
    }

    const handler = PAGE_MESSAGES[message.type];
    const fromPage = !sender.tab || String(sender.url || '').startsWith(browser.runtime.getURL(''));
    if (!handler || !fromPage) return undefined;
    return st.ready.then(() => handler(message));
});

browser.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') browser.runtime.openOptionsPage().catch(() => { });
});

st.ready = browser.storage.local.get(['settings', 'lastPalette']).then(stored => {
    st.storedSettings = !!stored.settings;
    st.settings = normaliseSettings(stored.settings);
    if (stored.lastPalette?.format === 1) st.palette = stored.lastPalette;
}).catch(() => { });

st.ready.then(() => {
    // The last palette colours the toolbar before the helper answers.
    applyTheme();
    connectHost();
});
