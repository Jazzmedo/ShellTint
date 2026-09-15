/* ShellTint — Material 3 roles → browser.theme colours.
 *
 * A fixed table with fallback chains, so any palette that has a primary, a
 * surface and an on-surface colour yields a complete theme.
 */

'use strict';

(function (root) {
    const HEX = /^#[0-9a-f]{6}$/i;

    function picker(roles) {
        return (...names) => {
            for (const name of names) {
                const value = roles?.[name];
                if (typeof value === 'string' && HEX.test(value)) return value.toLowerCase();
            }
            return null;
        };
    }

    function themeFromRoles(roles, mode, style) {
        const pick = picker(roles);
        const surface = pick('surface', 'background');
        const onSurface = pick('on_surface', 'on_background');
        const primary = pick('primary');
        if (!surface || !onSurface || !primary) return null;

        const onPrimary = pick('on_primary') || surface;
        const container = pick('surface_container', 'surface_container_low', 'surface');
        const high = pick('surface_container_high', 'surface_variant') || container;
        const highest = pick('surface_container_highest', 'surface_container_high', 'surface_variant') || high;
        const frame = pick('surface_container_lowest', 'surface_dim', 'background') || surface;
        const muted = pick('on_surface_variant') || onSurface;
        const divider = pick('outline_variant', 'outline') || high;
        const highlight = pick('secondary_container', 'primary_container') || high;
        const onHighlight = pick('on_secondary_container', 'on_primary_container') || onSurface;

        const colors = {
            frame,
            frame_inactive: frame,
            tab_selected: container,
            tab_text: onSurface,
            tab_background_text: muted,
            tab_line: primary,
            tab_loading: primary,
            toolbar: container,
            toolbar_text: onSurface,
            toolbar_top_separator: divider,
            toolbar_bottom_separator: divider,
            toolbar_field: high,
            toolbar_field_text: onSurface,
            toolbar_field_border: high,
            toolbar_field_focus: highest,
            toolbar_field_text_focus: onSurface,
            toolbar_field_border_focus: primary,
            toolbar_field_highlight: primary,
            toolbar_field_highlight_text: onPrimary,
            icons: onSurface,
            icons_attention: primary,
            popup: container,
            popup_text: onSurface,
            popup_border: divider,
            popup_highlight: highlight,
            popup_highlight_text: onHighlight,
            sidebar: container,
            sidebar_text: onSurface,
            sidebar_border: divider,
            sidebar_highlight: highlight,
            sidebar_highlight_text: onHighlight,
            ntp_background: pick('background') || surface,
            ntp_text: pick('on_background') || onSurface,
            button_background_hover: highest,
            button_background_active: pick('surface_bright') || highest,
        };

        if (style === 'vivid') {
            const accent = pick('primary_container');
            const onAccent = pick('on_primary_container');
            if (accent && onAccent) {
                colors.tab_selected = accent;
                colors.tab_text = onAccent;
                colors.frame = container;
                colors.frame_inactive = container;
                colors.toolbar = accent;
                colors.toolbar_text = onAccent;
                colors.icons = onAccent;
            }
        }

        const scheme = mode === 'light' ? 'light' : 'dark';
        return { colors, properties: { color_scheme: scheme, content_color_scheme: scheme } };
    }

    const api = { themeFromRoles };
    root.STThemeMap = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
