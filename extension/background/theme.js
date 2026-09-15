/* ShellTint — toolbar colours from the palette. */

'use strict';

let appliedThemeKey = null;

function setPalette(palette, error) {
    const valid = palette && palette.format === 1 && palette.roles && typeof palette.roles === 'object';
    if (valid) {
        // Own styles carry the colours as variables, so open pages need the new values.
        const recolour = st.palette?.hash !== palette.hash && st.customStyles.some(s => s.enabled);
        st.palette = palette;
        if (recolour) usRefreshAll();
        browser.storage.local.set({ lastPalette: palette }).catch(() => { });
    }
    st.paletteError = error;
    applyTheme();
    broadcast('palette');
}

async function applyTheme() {
    const theme = st.settings.toolbarTheming && st.palette
        ? STThemeMap.themeFromRoles(st.palette.roles, st.palette.mode, st.settings.toolbarStyle)
        : null;
    const key = theme ? JSON.stringify(theme) : null;
    if (key === appliedThemeKey) return;
    appliedThemeKey = key;
    try {
        if (theme) await browser.theme.update(theme);
        else await browser.theme.reset();
    } catch (e) {
        console.warn('ShellTint: could not apply the toolbar theme:', e?.message || e);
    }
}
