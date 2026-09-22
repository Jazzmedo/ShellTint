/* ShellTint — settings, messages from extension pages, and start-up. */

'use strict';

const THEME_KEYS = ['toolbarTheming', 'toolbarStyle'];
const PAGE_KEYS = ['websiteStyling', 'disabledSites', 'siteInstances'];

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

async function saveCustomStyles(styles) {
    st.customStyles = STCustomStyles.normaliseStyles(styles);
    await browser.storage.local.set({ customStyles: st.customStyles });
    usRefreshAll();
    broadcast('custom-styles');
}

async function saveStyle(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to save' };
    const existing = st.customStyles.find(s => s.id === raw.id);
    if (!existing && st.customStyles.length >= STCustomStyles.LIMITS.maxStyles) {
        return { ok: false, error: `You can keep up to ${STCustomStyles.LIMITS.maxStyles} styles` };
    }
    if (String(raw.css || '').length > STCustomStyles.LIMITS.maxCss) {
        return { ok: false, error: 'This style is larger than 256 KB' };
    }
    const now = Date.now();
    const style = STCustomStyles.normaliseStyle({
        ...raw,
        id: existing ? existing.id : STCustomStyles.newStyleId(),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
    });
    const list = existing ? st.customStyles.map(s => (s.id === style.id ? style : s)) : [...st.customStyles, style];
    await saveCustomStyles(list);
    return { ok: true, style };
}

async function toggleStyle(id, enabled) {
    if (!st.customStyles.some(s => s.id === id)) return { ok: false, error: 'That style no longer exists' };
    await saveCustomStyles(st.customStyles.map(s => (s.id === id ? { ...s, enabled: !!enabled, updatedAt: Date.now() } : s)));
    return { ok: true };
}

async function deleteStyle(id) {
    await saveCustomStyles(st.customStyles.filter(s => s.id !== id));
    return { ok: true };
}

function getState() {
    return {
        customStyles: st.customStyles,
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
    'st:save-style': message => saveStyle(message.style),
    'st:toggle-style': message => toggleStyle(message.id, message.enabled),
    'st:delete-style': message => deleteStyle(message.id),
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

st.ready = browser.storage.local.get(['settings', 'lastPalette', 'customStyles']).then(stored => {
    st.storedSettings = !!stored.settings;
    st.settings = normaliseSettings(stored.settings);
    st.customStyles = STCustomStyles.normaliseStyles(stored.customStyles);
    if (stored.lastPalette?.format === 1) st.palette = stored.lastPalette;
}).catch(() => { });

st.ready.then(() => {
    // The last palette colours the toolbar before the helper answers.
    applyTheme();
    connectHost();
});
