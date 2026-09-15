/* ShellTint toolbar popup: pause the current site, or switch everything off. */

'use strict';

const $ = id => document.getElementById(id);
const { el, applyPaletteTokens, loadCachedPalette } = STUi;

let settings = typeof normaliseSettings === 'function' ? normaliseSettings({}) : { ...DEFAULT_SETTINGS };
let state = null;
let site = null;

const send = message => browser.runtime.sendMessage(message).catch(() => null);

function renderStripe(palette) {
    for (const span of $('stripe').children) {
        const value = palette?.roles?.[span.dataset.role];
        if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) span.style.background = value;
    }
}

function renderSite() {
    const siteSwitch = $('site-switch');
    const globalOn = settings.websiteStyling !== false;

    if (!site || !site.themeable || !site.host) {
        $('site-host').textContent = 'This page';
        $('site-style').textContent = "This page can't be styled";
        siteSwitch.hidden = true;
        return;
    }

    const key = site.siteKey || STMatchers.siteKey(site.host);
    const siteOn = !STMatchers.siteListed(settings.disabledSites, site.host);
    $('site-host').textContent = key;
    $('site-host').title = site.host;

    if (!globalOn) $('site-style').textContent = 'Website styling is off everywhere';
    else if (site.customStyles?.some(s => s.enabled && s.replaceCatppuccin)) $('site-style').textContent = 'Catppuccin style replaced by your style';
    else if (!site.built) $('site-style').textContent = 'Styles are still being built';
    else if (site.styles?.length) $('site-style').textContent = `Catppuccin style: ${site.styles.join(', ')}`;
    else $('site-style').textContent = 'No Catppuccin style for this site';

    siteSwitch.hidden = false;
    siteSwitch.checked = globalOn && siteOn;
    siteSwitch.disabled = !globalOn;
    siteSwitch.title = siteOn ? `Pause styling on ${key}` : `Resume styling on ${key}`;
}

// Styles the user wrote that match this page, with a shortcut to write one.
function renderMyStyles() {
    const list = $('mystyles-list');
    while (list.firstChild) list.firstChild.remove();
    const themeable = !!(site?.themeable && site.host);
    const mine = Array.isArray(site?.customStyles) ? site.customStyles : [];
    $('mystyles').hidden = !themeable && !mine.length;
    $('new-style').hidden = !themeable;
    for (const style of mine) {
        const name = style.name || 'Untitled style';
        list.append(el('li', { class: 'mystyle-row' },
            el('input', {
                type: 'checkbox', role: 'switch', checked: !!style.enabled, 'aria-label': `${name} on or off`,
                onchange: event => toggleStyle(style, event.target.checked),
            }),
            el('span', { class: 'mystyle-name', text: name, title: name }),
            el('button', {
                class: 'st-btn st-btn--quiet', type: 'button', text: 'Edit', 'aria-label': `Edit ${name}`,
                onclick: () => openOptions(`#my-styles/${encodeURIComponent(style.id)}`),
            })));
    }
}

async function toggleStyle(style, enabled) {
    style.enabled = enabled;
    renderSite();
    const res = await send({ type: 'st:toggle-style', id: style.id, enabled });
    if (!res?.ok) style.enabled = !enabled;
    renderSite();
    renderMyStyles();
}

async function openOptions(hash) {
    try {
        await browser.tabs.create({ url: browser.runtime.getURL(`options/options.html${hash}`) });
    } catch { /* the tab could not be opened */ }
    window.close();
}

function renderSwitches() {
    for (const input of document.querySelectorAll('input[data-setting]')) {
        input.checked = settings[input.dataset.setting] !== false;
    }
}

function renderStatus() {
    const dot = $('status-dot');
    const text = $('status-text');
    const host = state?.host;
    if (!host?.connected) {
        dot.dataset.state = 'off';
        text.textContent = 'Helper not connected';
    } else if (host.protocolMismatch) {
        dot.dataset.state = 'warn';
        text.textContent = 'Update the ShellTint helper';
    } else if (state.build?.building || !state.styles) {
        dot.dataset.state = 'warn';
        text.textContent = 'Styles are being built';
    } else {
        dot.dataset.state = 'ok';
        text.textContent = `Helper connected · ${state.styles.ok} styles`;
    }
}

function render() {
    renderSwitches();
    renderSite();
    renderMyStyles();
    renderStatus();
}

async function update(patch) {
    Object.assign(settings, patch);
    render();
    const res = await send({ type: 'st:update-settings', patch });
    if (res?.settings) {
        settings = res.settings;
        render();
    }
}

$('site-switch').addEventListener('change', event => {
    if (!site?.host) return;
    const key = STMatchers.siteKey(site.host);
    // Resuming a site also clears any parent domain that was paused.
    const rest = (settings.disabledSites || []).filter(s => !STMatchers.siteListed([s], key));
    update({ disabledSites: event.target.checked ? rest : [...rest, key] });
});

for (const input of document.querySelectorAll('input[data-setting]')) {
    input.addEventListener('change', () => update({ [input.dataset.setting]: input.checked }));
}

$('new-style').addEventListener('click', () => {
    if (!site?.host) return;
    const key = site.siteKey || STMatchers.siteKey(site.host);
    openOptions(`#my-styles/new?site=${encodeURIComponent(key)}`);
});

$('open-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
    window.close();
});

async function load() {
    const [tabs, nextState] = await Promise.all([
        browser.tabs.query({ active: true, currentWindow: true }).catch(() => []),
        send({ type: 'st:get-state' }),
    ]);
    state = nextState;
    if (state?.settings) settings = state.settings;
    if (state?.palette) {
        applyPaletteTokens(state.palette);
        renderStripe(state.palette);
    }
    site = await send({ type: 'st:site-state', url: tabs[0]?.url || '' });
    render();
}

browser.runtime.onMessage.addListener(message => {
    if (message?.type === 'st:changed') load();
});

loadCachedPalette().then(renderStripe);
load();
