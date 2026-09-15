/* ShellTint — background state shared by the other background scripts. */

'use strict';

const st = {
    settings: normaliseSettings({}),
    ready: null,                  // resolves once settings are loaded from storage
    storedSettings: false,        // false until the user (or the helper's mirror) saved settings
    port: null,
    host: { connected: false, version: null, error: null, protocolMismatch: false, paths: null },
    palette: null,
    customStyles: [],             // the user's own styles, see shared/custom-styles.js
    paletteError: null,
    sources: null,
    build: null,
    reconnectTimer: null,
    reconnectDelay: 2000,
    nextReqId: 1,
};

const HOST_NAME = 'shelltint';
const HOST_PROTOCOL = 1;

function nextReqId() {
    return st.nextReqId++;
}

// Tells open extension pages to fetch state again.
function broadcast(part) {
    browser.runtime.sendMessage({ type: 'st:changed', part }).catch(() => { });
}
