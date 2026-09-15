/* ShellTint settings page. */

'use strict';

const $ = id => document.getElementById(id);
const { el, applyPaletteTokens, formatAgo, loadCachedPalette } = STUi;

const SWATCH_ROLES = [
    'primary', 'on_primary', 'primary_container', 'secondary', 'secondary_container', 'tertiary',
    'tertiary_container', 'error', 'surface', 'surface_container', 'surface_variant', 'outline',
];
const MODES = [
    { id: 'follow', label: 'Follow shell' },
    { id: 'dark', label: 'Dark' },
    { id: 'light', label: 'Light' },
];
const STYLES = [
    { id: 'tonal', label: 'Tonal' },
    { id: 'vivid', label: 'Vivid' },
];
const UPDATE_RESULTS = {
    unchanged: 'Already up to date',
    updated: 'Updated and rebuilt',
    offline: "Couldn't reach Catppuccin",
    damaged: 'Download looked damaged; kept current styles',
    busy: 'A build was running; try again shortly',
};
const PATH_LABELS = { install: 'Helper', cache: 'Styles cache', config: 'Config', log: 'Log' };

let state = null;
let settings = normaliseSettings({});
let detected = null;

const send = message => browser.runtime.sendMessage(message);
const sendSafe = message => send(message).catch(error => ({ ok: false, error: error?.message || String(error) }));

function clear(node) {
    while (node.firstChild) node.firstChild.remove();
}

function segmented(name, legend, options, current, onPick) {
    const fieldset = el('fieldset', { class: 'st-segmented' }, el('legend', { text: legend }));
    for (const option of options) {
        const id = `${name}-${option.id}`;
        fieldset.append(
            el('input', {
                type: 'radio', name, id, value: option.id, checked: option.id === current,
                onchange: () => onPick(option.id),
            }),
            el('label', { for: id, text: option.short || option.label, title: option.label }),
        );
    }
    return fieldset;
}

// ─── Tabs ───
const TABS = [...document.querySelectorAll('.tab')];

function showTab(name, focus) {
    if (!TABS.some(t => t.dataset.tab === name)) name = 'overview';
    for (const tab of TABS) {
        const selected = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        $(tab.dataset.tab).hidden = !selected;
        if (selected && focus) tab.focus();
    }
}

for (const tab of TABS) {
    tab.addEventListener('click', () => {
        history.replaceState(null, '', `#${tab.dataset.tab}`);
        showTab(tab.dataset.tab);
    });
    tab.addEventListener('keydown', event => {
        const i = TABS.indexOf(tab);
        let next = null;
        if (event.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
        else if (event.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
        else if (event.key === 'Home') next = TABS[0];
        else if (event.key === 'End') next = TABS[TABS.length - 1];
        if (!next) return;
        event.preventDefault();
        history.replaceState(null, '', `#${next.dataset.tab}`);
        showTab(next.dataset.tab, true);
    });
}
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
showTab(location.hash.slice(1));

// ─── Settings ───
async function update(patch) {
    Object.assign(settings, patch);
    renderSettings();
    const res = await sendSafe({ type: 'st:update-settings', patch });
    if (res?.settings) settings = res.settings;
    renderSettings();
    return res;
}

for (const input of document.querySelectorAll('input[data-setting]')) {
    input.addEventListener('change', () => update({ [input.dataset.setting]: input.checked }));
}

// ─── Header and overview ───
function renderHelper() {
    const host = state?.host;
    const dot = $('helper-dot');
    const text = $('helper-text');
    const connected = !!host?.connected;
    if (!connected) {
        dot.dataset.state = 'off';
        text.textContent = 'Helper not connected';
    } else if (host.protocolMismatch) {
        dot.dataset.state = 'warn';
        text.textContent = 'Helper needs updating';
    } else {
        dot.dataset.state = 'ok';
        text.textContent = host.version ? `Helper ${host.version}` : 'Helper connected';
    }

    $('helper-callout').hidden = connected && !host.protocolMismatch;
    const detail = $('helper-callout-detail');
    clear(detail);
    const guide = el('a', { href: 'https://github.com/Jazzmedo/ShellTint#install', target: '_blank', rel: 'noopener', text: 'How to install it' });
    if (host?.protocolMismatch) detail.append('This helper is from a different ShellTint version. Reinstall it. ', guide);
    else if (host?.error) detail.append(`${host.error}. `, guide);
    else detail.append('Install the helper, then restart the browser. ', guide);
}

function renderPalette() {
    const palette = state?.palette;
    const strip = $('swatches');
    clear(strip);
    for (const role of SWATCH_ROLES) {
        const value = palette?.roles?.[role];
        const valid = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
        const swatch = el('span', { class: 'swatch', title: valid ? `${role.replace(/_/g, ' ')} ${value}` : role.replace(/_/g, ' ') });
        swatch.style.background = valid ? value : 'var(--st-surface-3)';
        strip.append(swatch);
    }
    if (palette) {
        applyPaletteTokens(palette);
        const label = palette.source?.label || 'your shell';
        $('hero-caption').textContent = `From ${label} · ${palette.mode || 'dark'} · updated ${formatAgo(palette.generatedAt)}`;
    } else {
        $('hero-caption').textContent = state?.paletteError ? `No palette: ${state.paletteError}` : 'No palette yet';
    }
}

function renderStatus() {
    const list = $('status-list');
    clear(list);
    const add = (term, ...value) => list.append(el('dt', { text: term }), el('dd', {}, ...value));

    const host = state?.host;
    add('Helper', !host?.connected ? 'Not connected' : host.protocolMismatch ? 'Connected, needs updating' : `Connected${host.version ? ` · ${host.version}` : ''}`);

    const palette = state?.palette;
    const sourceBits = [palette ? `${palette.source?.label || 'Unknown'}${palette.modeSource ? ` · mode from ${palette.modeSource}` : ''}` : (state?.paletteError || 'None found')];
    if (palette?.warnings?.length) sourceBits.push(el('div', { class: 'warnings', text: palette.warnings.join(' · ') }));
    add('Palette source', ...sourceBits);

    const styles = state?.styles;
    let stylesText = 'Not built yet';
    if (state?.build?.building) stylesText = 'Building…';
    else if (styles) stylesText = `${styles.ok} of ${styles.total} built${styles.failed?.length ? ` · ${styles.failed.length} failed` : ''} · ${formatAgo(styles.createdAt)}`;
    if (!settings.websiteStyling) stylesText += ' · turned off';
    add('Website styles', stylesText);

    const check = state?.build?.lastUpdateCheck;
    add('Last update check', check ? `${formatAgo(check.at)}${UPDATE_RESULTS[check.result] ? ` · ${UPDATE_RESULTS[check.result]}` : ''}` : 'Never');
}

async function renderPermission() {
    let granted = true;
    try {
        granted = await browser.permissions.contains({ origins: ['<all_urls>'] });
    } catch { /* treat as granted if the API is unavailable */ }
    $('permission-banner').hidden = granted;
}

$('permission-grant').addEventListener('click', async () => {
    try {
        await browser.permissions.request({ origins: ['<all_urls>'] });
    } catch { /* the user declined */ }
    renderPermission();
});
browser.permissions?.onAdded?.addListener(renderPermission);
browser.permissions?.onRemoved?.addListener(renderPermission);

$('helper-retry').addEventListener('click', async () => {
    const button = $('helper-retry');
    button.disabled = true;
    button.textContent = 'Retrying…';
    await sendSafe({ type: 'st:reconnect' });
    button.disabled = false;
    button.textContent = 'Retry';
    refresh();
});

// ─── Colours ───
function renderColours() {
    const sourceControl = $('source-control');
    clear(sourceControl);
    sourceControl.append(segmented('source', 'Palette source', PALETTE_SOURCES, settings.paletteSource, id => update({ paletteSource: id })));

    const modeControl = $('mode-control');
    clear(modeControl);
    modeControl.append(segmented('mode', 'Light and dark', MODES, settings.mode, id => update({ mode: id })));

    const styleControl = $('style-control');
    clear(styleControl);
    styleControl.append(segmented('toolbar-style', 'Toolbar style', STYLES, settings.toolbarStyle, id => update({ toolbarStyle: id })));

    $('custom-path-field').hidden = settings.paletteSource !== 'matugen';
    const pathInput = $('custom-path');
    if (document.activeElement !== pathInput) pathInput.value = settings.customPalettePath || '';

    renderSources();
    renderPreview();
}

function renderSources() {
    const list = $('source-list');
    clear(list);
    const info = detected || state?.sources;
    if (!info?.sources?.length) {
        list.append(el('li', { class: 'source-item' },
            el('span', { class: 'st-dot', dataset: { state: 'off' } }),
            el('span', { class: 'st-muted', text: state?.host?.connected ? 'Nothing detected yet' : 'Connect the helper to look for shells' })));
        return;
    }
    for (const source of info.sources) {
        const dotState = source.found ? (source.ok === false ? 'warn' : 'ok') : 'off';
        const stateText = !source.found ? 'Not found' : source.ok === false ? 'Unreadable' : `${source.mode || 'found'} · ${formatAgo(source.mtime)}`;
        const item = el('li', { class: 'source-item', dataset: { active: String(source.id === info.active) } },
            el('span', { class: 'st-dot', dataset: { state: dotState } }),
            el('span', { class: 'source-name', text: source.label || source.id }),
            el('span', { class: 'source-state', text: stateText }));
        if (source.path) item.append(el('span', { class: 'source-path', text: source.path }));
        if (source.error) item.append(el('span', { class: 'source-error', text: source.error }));
        list.append(item);
    }
}

async function detectSources() {
    const button = $('sources-refresh');
    button.disabled = true;
    button.textContent = 'Looking…';
    const res = await sendSafe({ type: 'st:detect-sources' });
    button.disabled = false;
    button.textContent = 'Refresh';
    if (res?.ok) detected = { active: res.active, sources: res.sources };
    renderSources();
    return res;
}
$('sources-refresh').addEventListener('click', detectSources);

async function savePath() {
    const value = $('custom-path').value.trim();
    if (value !== (settings.customPalettePath || '')) await update({ customPalettePath: value });
}
$('custom-path').addEventListener('change', savePath);
$('custom-path').addEventListener('blur', savePath);

$('custom-path-check').addEventListener('click', async () => {
    const result = $('custom-path-result');
    await savePath();
    const res = await detectSources();
    const matugen = res?.sources?.find(s => s.id === 'matugen');
    result.classList.remove('st-danger');
    if (!res?.ok) {
        result.textContent = res?.error || "Couldn't ask the helper";
        result.classList.add('st-danger');
    } else if (matugen?.found && matugen.ok !== false) {
        result.textContent = `Read ${matugen.path || 'the file'} · ${matugen.mode || 'palette'} found`;
    } else {
        result.textContent = matugen?.error || 'No usable palette at that path';
        result.classList.add('st-danger');
    }
});

function renderPreview() {
    const roles = state?.palette?.roles;
    const preview = $('preview');
    if (!roles || typeof STThemeMap === 'undefined') {
        preview.hidden = true;
        return;
    }
    const mode = settings.mode === 'follow' ? (state.palette.mode || 'dark') : settings.mode;
    const { colors } = STThemeMap.themeFromRoles(roles, mode, settings.toolbarStyle);
    preview.hidden = false;
    const paint = (part, props) => {
        for (const node of preview.querySelectorAll(`[data-part="${part}"]`)) {
            for (const [prop, key] of Object.entries(props)) {
                if (colors[key]) node.style[prop] = colors[key];
            }
        }
    };
    paint('frame', { background: 'frame' });
    paint('tab-selected', { background: 'tab_selected' });
    paint('tab-text', { color: 'tab_text' });
    paint('tab-background', { color: 'tab_background_text' });
    paint('tab-line', { background: 'tab_line' });
    paint('toolbar', { background: 'toolbar' });
    paint('field', { background: 'toolbar_field', color: 'toolbar_field_text' });
    paint('icon', { background: 'icons' });
}

// ─── Websites ───
function renderWebsites() {
    const list = $('paused-list');
    clear(list);
    const sites = settings.disabledSites || [];
    for (const site of sites) {
        list.append(el('li', { class: 'paused-item' },
            el('span', { text: site }),
            el('button', {
                class: 'st-btn st-btn--quiet', type: 'button', text: 'Remove', 'aria-label': `Resume styling on ${site}`,
                onclick: () => update({ disabledSites: (settings.disabledSites || []).filter(s => s !== site) }),
            })));
    }
    $('paused-empty').hidden = sites.length > 0;
    $('paused-clear').hidden = sites.length === 0;

    const textarea = $('searxng');
    if (document.activeElement !== textarea) {
        textarea.value = (settings.searxngInstances || []).join('\n');
        renderSearxngFeedback();
    }

    const failed = state?.styles?.failed || [];
    const failedList = $('failed-list');
    clear(failedList);
    $('failed-summary').textContent = failed.length ? `${failed.length} style${failed.length === 1 ? '' : 's'} failed` : 'None';
    for (const style of failed) {
        failedList.append(el('li', {},
            el('strong', { text: style.name || style.id }),
            el('span', { class: 'failed-error', text: style.error ? ` · ${style.error}` : '' })));
    }
}

$('paused-clear').addEventListener('click', () => update({ disabledSites: [] }));

function renderSearxngFeedback() {
    const feedback = $('searxng-feedback');
    const lines = $('searxng').value.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const bad = lines.filter(line => STMatchers.parseSiteList(line).length === 0);
    feedback.classList.toggle('st-danger', bad.length > 0);
    if (bad.length) {
        feedback.textContent = `Not recognised: ${bad.join(', ')}`;
    } else if (lines.length) {
        const count = STMatchers.parseSiteList(lines.join('\n')).length;
        feedback.textContent = `${count} instance${count === 1 ? '' : 's'} recognised`;
    } else {
        feedback.textContent = 'A hostname, or a full URL to style only that path.';
    }
}

let searxngTimer = null;
function saveSearxng() {
    clearTimeout(searxngTimer);
    const lines = $('searxng').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (JSON.stringify(lines) !== JSON.stringify(settings.searxngInstances || [])) update({ searxngInstances: lines });
}
$('searxng').addEventListener('input', () => {
    renderSearxngFeedback();
    clearTimeout(searxngTimer);
    searxngTimer = setTimeout(saveSearxng, 400);
});
$('searxng').addEventListener('blur', saveSearxng);

// ─── Maintenance ───
async function runAction(button, result, busyText, message, describe) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    result.classList.remove('st-danger');
    result.textContent = '';
    const res = await sendSafe(message);
    button.disabled = false;
    button.textContent = label;
    if (res?.ok === false && !res.result) {
        result.textContent = res.error || 'Something went wrong';
        result.classList.add('st-danger');
    } else {
        result.textContent = describe(res || {});
    }
    refresh();
}

$('rebuild').addEventListener('click', () => runAction($('rebuild'), $('rebuild-result'), 'Building…',
    { type: 'st:rebuild', force: true },
    () => 'Build started'));

$('check-updates').addEventListener('click', () => runAction($('check-updates'), $('update-result'), 'Checking…',
    { type: 'st:check-updates' },
    res => UPDATE_RESULTS[res.result] || 'Checked'));

$('reconnect').addEventListener('click', () => runAction($('reconnect'), $('reconnect-result'), 'Reconnecting…',
    { type: 'st:reconnect' },
    () => 'Reconnected'));

function renderMaintenance() {
    const build = state?.build;
    const rebuildResult = $('rebuild-result');
    if (build?.building) {
        rebuildResult.classList.remove('st-danger');
        rebuildResult.textContent = 'Building…';
    } else if (build?.lastBuild) {
        rebuildResult.classList.toggle('st-danger', !build.lastBuild.ok);
        rebuildResult.textContent = build.lastBuild.ok ? `Built ${formatAgo(build.lastBuild.at)}` : `Last build failed: ${build.lastBuild.error || 'unknown error'}`;
    }
    $('rebuild').disabled = !!build?.building || !state?.host?.connected;
    $('check-updates').disabled = !!build?.building || !state?.host?.connected;

    const check = build?.lastUpdateCheck;
    if (check && !$('update-result').textContent) {
        $('update-result').textContent = `${UPDATE_RESULTS[check.result] || 'Checked'} · ${formatAgo(check.at)}`;
    }

    const paths = $('paths');
    clear(paths);
    const known = state?.host?.paths;
    if (!known) {
        paths.append(el('dt', { text: 'Paths' }), el('dd', { class: 'st-muted', text: 'Shown once the helper connects' }), el('dd'));
        return;
    }
    for (const [key, label] of Object.entries(PATH_LABELS)) {
        if (!known[key]) continue;
        const copy = el('button', { class: 'st-btn st-btn--quiet', type: 'button', text: 'Copy', 'aria-label': `Copy ${label.toLowerCase()} path` });
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(known[key]);
                copy.textContent = 'Copied';
            } catch {
                copy.textContent = 'Failed';
            }
            setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
        });
        paths.append(el('dt', { text: label }), el('dd', {}, el('code', { text: known[key] })), el('dd', { class: 'copy-cell' }, copy));
    }
}

// ─── About ───
try {
    const manifest = browser.runtime.getManifest();
    $('about-version').textContent = `ShellTint ${manifest.version}`;
} catch { /* keep the plain name */ }

// ─── Loading ───
function renderSettings() {
    for (const input of document.querySelectorAll('input[data-setting]')) {
        input.checked = settings[input.dataset.setting] !== false;
    }
    renderColours();
    renderWebsites();
    if (state) renderStatus();
}

function render() {
    renderHelper();
    renderPalette();
    renderStatus();
    renderSettings();
    renderMaintenance();
}

async function refresh() {
    try {
        state = await send({ type: 'st:get-state' });
    } catch {
        state = null;
    }
    if (state?.settings) settings = state.settings;
    render();
}

let refreshTimer = null;
browser.runtime.onMessage.addListener(message => {
    if (message?.type !== 'st:changed') return;
    if (message.part === 'sources') detected = null;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 150);
});

loadCachedPalette();
renderPermission();
refresh();
