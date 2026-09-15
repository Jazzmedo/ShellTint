/* ShellTint — connection to the native helper. See docs/protocol.md. */

'use strict';

const ACTION_TIMEOUT = 20000;
const pendingActions = new Map();   // reqId -> { resolve, timer }

function hostPost(message) {
    if (!st.port) return false;
    try {
        st.port.postMessage(message);
        return true;
    } catch {
        return false;
    }
}

// Sends a request and resolves with the helper's reply carrying the same reqId.
function hostRequest(message) {
    return new Promise(resolve => {
        const reqId = nextReqId();
        const timer = setTimeout(() => {
            pendingActions.delete(reqId);
            resolve({ ok: false, error: 'The helper did not answer in time' });
        }, ACTION_TIMEOUT);
        pendingActions.set(reqId, { resolve, timer });
        if (!st.host.connected || !hostPost({ ...message, reqId })) {
            clearTimeout(timer);
            pendingActions.delete(reqId);
            resolve({ ok: false, error: "The ShellTint helper isn't connected" });
        }
    });
}

function settleAction(reqId, reply) {
    const pending = pendingActions.get(reqId);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingActions.delete(reqId);
    pending.resolve(reply);
}

function sendSettingsToHost() {
    hostPost({ type: 'ST_SETTINGS', settings: st.settings });
}

function connectHost() {
    if (st.port) return;
    clearTimeout(st.reconnectTimer);
    st.reconnectTimer = null;
    let port;
    try {
        port = browser.runtime.connectNative(HOST_NAME);
    } catch (e) {
        hostDisconnected(e?.message || String(e));
        return;
    }
    st.port = port;
    port.onMessage.addListener(message => {
        if (st.port === port) handleHostMessage(message).catch(e => console.warn('ShellTint:', e));
    });
    port.onDisconnect.addListener(p => {
        if (st.port === port) hostDisconnected(p.error?.message || null);
    });
}

function disconnectHost() {
    const port = st.port;
    st.port = null;
    try { port?.disconnect(); } catch { /* already gone */ }
    hostDisconnected(null, false);
}

function hostDisconnected(error, retry = true) {
    st.port = null;
    const wasConnected = st.host.connected;
    st.host = { ...st.host, connected: false, error: error || (wasConnected ? 'The helper stopped' : st.host.error) };
    for (const reqId of [...pendingActions.keys()]) settleAction(reqId, { ok: false, error: 'The helper disconnected' });
    usHostGone();
    if (retry && !st.reconnectTimer) {
        st.reconnectTimer = setTimeout(() => {
            st.reconnectTimer = null;
            connectHost();
        }, st.reconnectDelay);
        st.reconnectDelay = Math.min(st.reconnectDelay * 2, 60000);
    }
    broadcast('host');
}

async function handleHostMessage(message) {
    switch (message?.type) {
        case 'ST_HELLO': {
            await st.ready;
            st.reconnectDelay = 2000;
            st.host = {
                connected: true,
                version: typeof message.hostVersion === 'string' ? message.hostVersion : null,
                error: null,
                protocolMismatch: message.protocol !== HOST_PROTOCOL,
                paths: message.paths && typeof message.paths === 'object' ? message.paths : null,
            };
            // A fresh profile takes the choices already made in another browser.
            if (!st.storedSettings && message.settingsMirror) {
                await saveSettings(normaliseSettings(message.settingsMirror));
            }
            sendSettingsToHost();
            hostPost({ type: 'ST_SYNC' });
            broadcast('host');
            break;
        }
        case 'ST_PALETTE':
            setPalette(message.palette || message.lastGood || st.palette, message.error || null);
            break;
        case 'ST_STYLES_INDEX':
            if (usSetIndex(message.index)) usRefreshAll();
            broadcast('styles');
            break;
        case 'ST_SITE_CSS':
            usHandleSiteCss(message);
            break;
        case 'ST_STATUS':
            st.build = {
                building: !!message.building,
                lastBuild: message.lastBuild || null,
                lastUpdateCheck: message.lastUpdateCheck || null,
            };
            broadcast('build');
            break;
        case 'ST_SOURCES':
            st.sources = { active: message.active ?? null, sources: Array.isArray(message.sources) ? message.sources : [] };
            settleAction(message.reqId, { ok: true, ...st.sources });
            broadcast('sources');
            break;
        case 'ST_ACTION_RESULT':
            settleAction(message.reqId, { ok: !!message.ok, error: message.error || null });
            break;
        case 'ST_ERROR':
            console.warn('ShellTint helper:', message.reason, message.detail);
            break;
    }
}
