# Changelog

## 1.5.0 — 2026-11-06

- Install and uninstall are now one script, `shelltint.sh`: it detects every supported browser (config folders, `/opt` installs, AppImages) and asks which ones to register, instead of writing every manifest unconditionally — Firefox, Zen, LibreWolf (old and new data dirs), Waterfox, Floorp, Chromium, Chrome, the whole Brave family including Origin, Vivaldi, Edge, Helium and Thorium. `--browsers` skips the question, `--uninstall [--purge]` removes everything, and piping it straight from GitHub works (`curl -fsSL …/shelltint.sh | bash`); the old `scripts/install.sh`, `scripts/uninstall.sh` and `scripts/bootstrap.sh` are gone. Self-hosted-site placeholders now use the home-server domains `*.home.local` / `*.home.internal`.
- Self-hosted domains (your SearXNG, Homepage and other `siteInstances`) now flow through the helper's style index, so every browser on the computer styles them — including fresh installs and browsers that never received the settings, which is why they were missing in Brave and Helium while working in Zen.
- Chromium support fixes: the helper is now registered for every known Chromium browser even if it has not run yet (Brave Origin's data folder was missed before), Brave Origin and its beta/nightly variants are in the browser list, and the Chromium build was regenerated.
- New palette sources for full-desktop users, ported from the tested PhotoCraft adapters: **KDE Plasma** (accent and window colours from `~/.config/kdeglobals`), **GNOME** (accent colour and colour scheme read live from gsettings, GNOME 47+), and **pywal / pywal16** (`~/.cache/wal/colors.json`). Sparse desktop colours are expanded into the full Material 3 role set, and Auto picks them up on desktops without a shell theme.
- Chromium-based browsers (Chromium, Chrome, Brave, Vivaldi, Edge, Helium): website styles, My styles and backup work there too. Load `shelltint-<version>-chromium.zip` unpacked from the release; `scripts/install.sh` registers the helper for them. Toolbar colours stay Firefox-only, since Chromium has no theme API.

## 1.2.1 — 2026-10-03

- Back up your settings and My styles to a zip (Maintenance → Backup), with each style as a readable `.css` file, and restore it on any profile. Restoring merges: styles in the backup are added or replace the same style, others are kept.
- A new logo: the dot matrix recoloured in the Dusk Wallpaper palette, also used as the settings page's tab icon.
- The style editor highlights CSS syntax and suggests properties, common values and the `--shelltint-*` variables as you type; Ctrl+Space opens suggestions anywhere.

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
