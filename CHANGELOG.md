# Changelog

## 1.2.0 — 2026-09-22

- Self-hosted sites: point the SearXNG, Homepage, boringproxy and OpenMediaVault styles at your own addresses under Websites → Self-hosted sites. Upstream only knows a placeholder domain for these, so they never applied before. An existing SearXNG list is carried over.
- Website styles are compiled only for the sites you actually visit. A theme change now publishes in about a second instead of eight, and writes 0.4 MiB instead of 6.8; a style you have not opened before is compiled the first time you land on it, and styles you use are kept warm across rebuilds.
- The toolbar button shows how many stylesheets the page is wearing, counting the Catppuccin styles that match and your own that are switched on.
- A dot-matrix icon, in place of the placeholder.
- A ready-made Homepage style in `docs/styles/homepage.css`, for the page background Catppuccin's own style cannot reach.

## 1.1.0 — 2026-09-15

- My styles: write your own CSS for any site, like Stylus, from the settings page or the toolbar button. Styles can list hostnames, URL prefixes or `*`, use the shell's colours as `--shelltint-*` CSS variables, and optionally replace the Catppuccin style on their sites.
- Website styles build with a quarter of the CPU cores at idle priority, so theme changes no longer saturate the CPU.

## 1.0.0 — 2026-09-15

First ShellTint release.

- Palette sources: DankMaterialShell, Caelestia, Noctalia (v4 file, v5 through a template), end-4 illogical-impulse, and any matugen JSON or CSS-variables file, with auto-detection and a manual override.
- Light and dark follow the shell, or can be forced.
- Toolbar theming from Material 3 roles, in tonal or vivid style.
- Website styling for 130+ sites using Catppuccin's userstyles, recompiled locally with the shell's palette and rebuilt automatically when the palette changes.
- Pause styling per site from the toolbar popup; style your own SearXNG instances.
- New settings page (Overview, Colours, Websites, Maintenance, About) and popup.
- Native helper installer and uninstaller.

Removed compared with MatugenFox, which ShellTint is based on:

- DuckDuckGo theming.
- userChrome.css / userContent.css writer.
- Hand-written site templates and the sites directory setting.
- Eco mode.
