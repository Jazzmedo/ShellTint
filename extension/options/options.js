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
// The hash names the tab; My styles adds a view after a slash (#my-styles/new?site=example.com).
const TABS = [...document.querySelectorAll('.tab')];
let currentHash = location.hash;

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

function currentTab() {
    return location.hash.slice(1).split('/')[0];
}

function route() {
    currentHash = location.hash;
    const [tab, ...view] = location.hash.slice(1).split('/');
    showTab(tab);
    if (tab === 'my-styles') openStyleView(view.join('/'));
    else closeEditor();
}

function goTo(name, focus) {
    if (!confirmLeaveEditor()) return;
    history.replaceState(null, '', `#${name}`);
    route();
    if (focus) TABS.find(t => t.dataset.tab === name)?.focus();
}

for (const tab of TABS) {
    tab.addEventListener('click', () => goTo(tab.dataset.tab));
    tab.addEventListener('keydown', event => {
        const i = TABS.indexOf(tab);
        let next = null;
        if (event.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
        else if (event.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
        else if (event.key === 'Home') next = TABS[0];
        else if (event.key === 'End') next = TABS[TABS.length - 1];
        if (!next) return;
        event.preventDefault();
        goTo(next.dataset.tab, true);
    });
}
window.addEventListener('hashchange', () => {
    if (!confirmLeaveEditor()) {
        history.replaceState(null, '', currentHash);
        return;
    }
    route();
});

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

// ─── My styles ───
const customStylesApi = globalThis.STCustomStyles || null;
const STYLE_LIMITS = customStylesApi?.LIMITS || { maxStyles: 200, maxCss: 262144, maxName: 80 };
const HEX = /^#[0-9a-f]{6}$/i;

let customStyles = [];
let stylesLoaded = false;
let pendingStyleView = null;   // an #my-styles/<id> link opened before the styles arrived
let editor = null;             // { id, base, saved, saving } while the editor is open
let tabMovesFocus = false;

const styleLines = text => String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));

function formatBytes(bytes) {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function sitesSummary(sites) {
    const lines = styleLines(sites);
    if (lines.includes('*')) return 'All sites';
    if (!lines.length) return 'No sites';
    return lines.slice(0, 2).join(', ') + (lines.length > 2 ? ` +${lines.length - 2}` : '');
}

function showStyleNotice(text) {
    $('style-notice').textContent = text || '';
    $('style-notice').hidden = !text;
}

function renderStyleList() {
    const list = $('style-list');
    clear(list);
    for (const style of customStyles) {
        const name = style.name || 'Untitled style';
        const text = el('div', { class: 'style-text' },
            el('button', { class: 'style-name', type: 'button', text: name, onclick: () => { location.hash = `#my-styles/${encodeURIComponent(style.id)}`; } }),
            el('span', { class: 'style-sites' }, sitesSummary(style.sites),
                style.replaceCatppuccin ? el('span', { class: 'tag', text: 'Replaces Catppuccin' }) : null));
        list.append(el('li', { class: 'style-item', dataset: { enabled: String(!!style.enabled) } },
            el('input', {
                type: 'checkbox', role: 'switch', checked: !!style.enabled, 'aria-label': `${name} on or off`,
                onchange: event => toggleStyle(style, event.target.checked),
            }),
            text,
            el('div', { class: 'style-actions' },
                el('button', { class: 'st-btn st-btn--quiet', type: 'button', text: 'Edit', 'aria-label': `Edit ${name}`, onclick: () => { location.hash = `#my-styles/${encodeURIComponent(style.id)}`; } }),
                el('button', { class: 'st-btn st-btn--quiet danger-btn', type: 'button', text: 'Delete', 'aria-label': `Delete ${name}`, onclick: () => deleteStyle(style) }))));
    }
    $('style-empty').hidden = customStyles.length > 0;
    $('style-new').disabled = customStyles.length >= STYLE_LIMITS.maxStyles;
}

async function toggleStyle(style, enabled) {
    style.enabled = enabled;
    const res = await sendSafe({ type: 'st:toggle-style', id: style.id, enabled });
    if (!res?.ok) {
        style.enabled = !enabled;
        showStyleNotice(res?.error || "Couldn't change the style");
    }
    renderStyleList();
}

async function deleteStyle(style) {
    if (!window.confirm(`Delete "${style.name || 'Untitled style'}"? This can't be undone.`)) return false;
    const res = await sendSafe({ type: 'st:delete-style', id: style.id });
    if (!res?.ok) {
        const message = res?.error || "Couldn't delete the style";
        if (editor) setEditorStatus(message, true);
        else showStyleNotice(message);
        return false;
    }
    customStyles = customStyles.filter(s => s.id !== style.id);
    renderStyleList();
    return true;
}

function showStyleList(notice) {
    closeEditor();
    $('style-list-view').hidden = false;
    showStyleNotice(notice);
    renderStyleList();
}

function openStyleView(view) {
    const [path, query = ''] = view.split('?');
    if (!path) return showStyleList();
    if (path === 'new') {
        const site = new URLSearchParams(query).get('site') || '';
        return showEditor(null, { name: site ? `${site} tweaks` : '', sites: site, css: '', replaceCatppuccin: false, enabled: true });
    }
    const id = decodeURIComponent(path);
    const style = customStyles.find(s => s.id === id);
    if (style) return showEditor(style.id, style);
    if (!stylesLoaded) {
        pendingStyleView = view;
        $('style-list-view').hidden = true;
        return undefined;
    }
    history.replaceState(null, '', '#my-styles');
    currentHash = location.hash;
    return showStyleList('That style no longer exists.');
}

// ─── Style editor ───
function editorSnapshot() {
    return JSON.stringify([$('editor-name').value, $('editor-sites').value, $('editor-css').value, $('editor-replace').checked]);
}

function editorDirty() {
    return !!editor && editorSnapshot() !== editor.saved;
}

function confirmLeaveEditor() {
    return !editorDirty() || window.confirm('Discard your unsaved changes to this style?');
}

function closeEditor() {
    editor = null;
    $('style-editor').hidden = true;
}

function fillEditor(style) {
    const set = (id, value) => { if ($(id).value !== value) $(id).value = value; };
    set('editor-name', style.name || '');
    set('editor-sites', style.sites || '');
    set('editor-css', style.css || '');
    $('editor-replace').checked = !!style.replaceCatppuccin;
}

function showEditor(id, style) {
    editor = { id, base: style, saved: '', saving: false };
    $('style-list-view').hidden = true;
    $('style-editor').hidden = false;
    $('editor-title').textContent = id ? 'Edit style' : 'New style';
    $('editor-delete').hidden = !id;
    fillEditor(style);
    editor.saved = editorSnapshot();
    setEditorStatus('');
    renderSitesFeedback();
    renderBytes();
    renderVarList();
    (id || style.sites ? $('editor-css') : $('editor-name')).focus();
}

function setEditorStatus(text, danger = false) {
    const status = $('editor-status');
    status.textContent = text;
    status.classList.toggle('st-danger', danger);
}

function renderSitesFeedback() {
    const text = $('editor-sites').value;
    const feedback = $('editor-sites-feedback');
    const lines = styleLines(text);
    const problems = customStylesApi
        ? customStylesApi.sitesProblems(text)
        : lines.filter(line => line !== '*' && STMatchers.parseSiteList(line).length === 0);
    feedback.classList.toggle('st-danger', problems.length > 0);
    if (problems.length) feedback.textContent = `Not recognised: ${problems.join(', ')}`;
    else if (lines.includes('*')) feedback.textContent = 'All sites';
    else if (lines.length) feedback.textContent = `Applies to ${lines.length} site${lines.length === 1 ? '' : 's'}`;
    else feedback.textContent = 'Add at least one site, or * for every site.';
}

function cssBytes() {
    return new TextEncoder().encode($('editor-css').value).length;
}

function renderBytes() {
    const bytes = cssBytes();
    const over = bytes > STYLE_LIMITS.maxCss;
    $('editor-bytes').textContent = `${formatBytes(bytes)} of ${Math.round(STYLE_LIMITS.maxCss / 1024)} KB`;
    $('editor-bytes').classList.toggle('st-danger', over);
    $('editor-save').disabled = over || !!editor?.saving;
}

function varRow(name, value, swatchColour) {
    const swatch = el('span', { class: 'var-swatch' });
    if (swatchColour) swatch.style.background = swatchColour;
    else swatch.hidden = true;
    return el('li', {}, el('button', {
        class: 'var-item', type: 'button', title: `Insert var(${name})`,
        onclick: () => insertText($('editor-css'), `var(${name})`),
    }, swatch, el('code', { text: name }), el('span', { class: 'var-value', text: value })));
}

function renderVarList() {
    const roles = state?.palette?.roles || {};
    const list = $('var-list');
    clear(list);
    for (const { name, role } of customStylesApi?.PALETTE_VARS || []) {
        const value = roles[role];
        if (typeof value === 'string' && HEX.test(value)) list.append(varRow(name, value, value));
    }
    if (!list.children.length) list.append(el('li', { class: 'field-hint', text: 'Shell colours appear once a palette is found.' }));

    const ctp = $('ctp-var-list');
    clear(ctp);
    for (const { name, slot } of customStylesApi?.CATPPUCCIN_VARS || []) ctp.append(varRow(name, slot, null));
}

function insertText(textarea, text) {
    textarea.focus();
    // execCommand keeps the edit on the undo stack; setRangeText is the fallback.
    let done = false;
    try { done = document.execCommand('insertText', false, text); } catch { /* unsupported */ }
    if (!done) {
        textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

async function saveStyle() {
    if (!editor || editor.saving || cssBytes() > STYLE_LIMITS.maxCss) return;
    const sites = $('editor-sites').value;
    const name = $('editor-name').value.trim() || styleLines(sites)[0] || 'Untitled style';
    const style = {
        ...editor.base,
        name: name.slice(0, STYLE_LIMITS.maxName),
        sites,
        css: $('editor-css').value,
        replaceCatppuccin: $('editor-replace').checked,
    };
    if (editor.id) style.id = editor.id;
    else delete style.id;

    const current = editor;
    current.saving = true;
    renderBytes();
    setEditorStatus('Saving…');
    const res = await sendSafe({ type: 'st:save-style', style });
    current.saving = false;
    if (editor !== current) return;
    renderBytes();
    if (!res?.ok || !res.style) {
        setEditorStatus(res?.error || "Couldn't save the style", true);
        return;
    }

    editor.id = res.style.id;
    editor.base = res.style;
    if ($('editor-name').value.trim() !== res.style.name && !$('editor-name').value.trim()) $('editor-name').value = res.style.name;
    editor.saved = editorSnapshot();
    const index = customStyles.findIndex(s => s.id === res.style.id);
    if (index === -1) customStyles.push(res.style);
    else customStyles[index] = res.style;

    const hash = `#my-styles/${encodeURIComponent(res.style.id)}`;
    if (location.hash !== hash) {
        history.replaceState(null, '', hash);
        currentHash = location.hash;
    }
    $('editor-title').textContent = 'Edit style';
    $('editor-delete').hidden = false;
    setEditorStatus('Saved');
    setTimeout(() => { if (editor === current && $('editor-status').textContent === 'Saved') setEditorStatus(''); }, 2000);
}

// Keeps the list current and, when nothing is unsaved, the open editor too.
function renderMyStyles() {
    renderStyleList();
    if (pendingStyleView !== null && stylesLoaded) {
        const view = pendingStyleView;
        pendingStyleView = null;
        if (currentTab() === 'my-styles' && !editor) openStyleView(view);
    }
    if (!editor) return;
    renderVarList();
    if (!editor.id || editor.saving) return;
    const latest = customStyles.find(s => s.id === editor.id);
    if (!latest) {
        if (editorDirty()) {
            editor.id = null;
            $('editor-delete').hidden = true;
            setEditorStatus('This style was deleted elsewhere. Saving creates it again.', true);
        } else {
            history.replaceState(null, '', '#my-styles');
            currentHash = location.hash;
            showStyleList('That style was deleted.');
        }
    } else if (!editorDirty()) {
        editor.base = latest;
        fillEditor(latest);
        editor.saved = editorSnapshot();
        renderSitesFeedback();
        renderBytes();
    }
}

$('style-new').addEventListener('click', () => { location.hash = '#my-styles/new'; });
$('editor-back').addEventListener('click', () => { location.hash = '#my-styles'; });
$('editor-delete').addEventListener('click', async () => {
    const style = editor && customStyles.find(s => s.id === editor.id);
    if (!style || !(await deleteStyle(style))) return;
    closeEditor();
    location.hash = '#my-styles';
});

$('style-editor').addEventListener('submit', event => {
    event.preventDefault();
    saveStyle();
});
$('style-editor').addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveStyle();
    }
});
$('style-editor').addEventListener('input', () => {
    if (editor && !editor.saving) setEditorStatus(editorDirty() ? 'Unsaved changes' : '');
});
$('editor-replace').addEventListener('change', () => {
    if (editor && !editor.saving) setEditorStatus(editorDirty() ? 'Unsaved changes' : '');
});
$('editor-sites').addEventListener('input', renderSitesFeedback);
$('editor-css').addEventListener('input', renderBytes);
$('editor-css').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        tabMovesFocus = true;
        return;
    }
    if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (tabMovesFocus) {
            tabMovesFocus = false;
            return;
        }
        event.preventDefault();
        insertText(event.target, '  ');
        return;
    }
    tabMovesFocus = false;
});

window.addEventListener('beforeunload', event => {
    if (editorDirty()) event.preventDefault();
});

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
    renderMyStyles();
}

async function refresh() {
    try {
        state = await send({ type: 'st:get-state' });
    } catch {
        state = null;
    }
    if (state?.settings) settings = state.settings;
    if (Array.isArray(state?.customStyles)) {
        customStyles = state.customStyles;
        stylesLoaded = true;
    }
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
route();
refresh();
