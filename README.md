# ShellTint

ShellTint colours Firefox from your desktop shell. It reads the Material You palette that DankMaterialShell, Caelestia, Noctalia, end-4's illogical-impulse or matugen generated, themes the browser toolbar with it, and restyles more than 130 websites (YouTube, GitHub, X, Reddit, Wikipedia and others) using Catppuccin's userstyles recoloured with your palette. When the shell changes theme, the browser and open tabs follow within seconds, without a reload.

ShellTint has two parts: the browser extension, and a small local helper (a native messaging host) that reads your shell's colour files and builds the website styles.

## Features

- Toolbar, tabs, address bar and menus take the shell's colours (tonal or vivid style).
- Catppuccin userstyles for 130+ sites, recompiled with your palette on every theme change.
- Light and dark follow the shell, or can be forced.
- Pause styling per site from the toolbar popup, or turn it off everywhere.
- Style your own SearXNG instances.
- Detects the shell automatically; any matugen output works as a fallback.
- Collects no data.

## How it works

```
 shell colour file                     ShellTint helper (native host, Python)
 (DMS, Caelestia, Noctalia, ──watch──▶  normalises roles, light/dark
  end-4, matugen file)                        │
                                              ▼
                                ~/.cache/shelltint/palette.json
                                              │
                                              ▼
                              builder (Node): Catppuccin userstyles
                              recompiled with the palette
                                              │
                                              ▼
                              ~/.cache/shelltint/userstyles/current/
                                              │
        browser extension  ◀──native messaging──┘
          ├─ browser.theme      → toolbar colours
          └─ scripting.insertCSS → per-site CSS in matching tabs
```

## Prerequisites

- Firefox 140 or newer, or a browser on a 140+ base: Zen, LibreWolf, Floorp, Waterfox.
- Linux.
- Python 3.8+.
- Node.js 18+ with npm (a system package or nvm both work).
- curl.
- flock, from util-linux.
- One supported shell (see [Supported colour sources](#supported-colour-sources)) or a matugen output file.
- The extension's "Access your data for all websites" permission. Firefox may ask for it after install; ShellTint's Overview page shows a button if it is missing. Without it no website can be styled.

Fedora:

```sh
sudo dnf install python3 nodejs npm curl util-linux
```

Debian/Ubuntu:

```sh
sudo apt install python3 nodejs npm curl util-linux
```

Arch:

```sh
sudo pacman -S python nodejs npm curl util-linux
```

## Install

1. Install the extension from addons.mozilla.org:
   <https://addons.mozilla.org/firefox/addon/shelltint/>
2. Install the helper:

   ```sh
   git clone https://github.com/Jazzmedo/ShellTint
   cd ShellTint
   ./scripts/install.sh
   ```

   It copies the helper to `~/.local/share/shelltint`, installs the builder's npm dependencies, registers the native messaging manifest, detects your shell and builds the website styles once.
3. Restart the browser, then open ShellTint (toolbar button → settings) and check the Overview page.

| Flag | Effect |
| --- | --- |
| `--prefix DIR` | Install the helper to `DIR` instead of `~/.local/share/shelltint`. |
| `--no-build` | Skip the first style build; it runs when the browser connects. |
| `--dry-run` | Print what would be done and change nothing. |
| `--with-matugen-hook` | Print a matugen config snippet that rebuilds styles while the browser is closed. Your matugen config is not edited. |

The native messaging manifest goes to `~/.mozilla/native-messaging-hosts/shelltint.json`, which Firefox, Zen and Floorp read. LibreWolf, Waterfox and Flatpak browser folders get a copy only if they already exist.

## Supported colour sources

| Source | File | Light / dark |
| --- | --- | --- |
| DankMaterialShell | `~/.cache/DankMaterialShell/dms-colors.json` | `isLightMode` in `~/.local/state/DankMaterialShell/session.json` |
| Caelestia | `${XDG_STATE_HOME:-~/.local/state}/caelestia/scheme.json` | the file's `mode` field |
| Noctalia v4 | `${NOCTALIA_CONFIG_DIR:-~/.config/noctalia/}colors.json` | `colorSchemes.darkMode` in `settings.json` |
| Noctalia v5 | `~/.cache/shelltint/sources/noctalia.json`, written by a user template (below) | the template's `mode` |
| end-4 illogical-impulse | `${XDG_STATE_HOME:-~/.local/state}/quickshell/user/generated/colors.json` | inferred: dark when the background is dark |
| Matugen file | any JSON or CSS-variables file you choose | the file's `mode` / `is_dark`, else inferred |

Notes:

- Noctalia v4 only exports 16 roles. ShellTint derives the missing container and surface levels from them, and lists that as a warning on the Overview page.
- The matugen file source accepts flat JSON (`{"primary": "#..."}`), `{"mode": ..., "colors": {...}}`, matugen's nested `{"colors": {"primary": {"dark": ..., "light": ..., "default": ...}}}`, or CSS variables. Accepted names include `--primary`, `--mg-primary`, `--md-sys-color-primary`, `primary` and camelCase such as `surfaceContainerHigh`.

### Auto-detection

With the source set to Auto, ShellTint uses the first one whose file exists and parses, in this order:

```
dms → caelestia → noctalia → end4 → matugen
```

To use a different one, open ShellTint → Colours and pick the source. For a matugen file, choose "Matugen file", enter the path and press Check.

### Matugen template

This template writes every colour plus the mode, in a format the matugen file source reads. It was rendered with matugen 4.2.0 in both modes: the output is valid JSON, `{{ mode }}` renders as lowercase `dark` / `light`, and the loop emits all 50 roles.

Save as `~/.config/matugen/templates/shelltint.json`:

```
{
  "mode": "{{ mode }}",
  "is_dark": <* if {{ is_dark_mode }} *>true<* else *>false<* endif *>,
  "colors": {<* for name, value in colors *>
    "{{ name }}": "{{ value.default.hex }}"<* if not {{ loop.last }} *>,<* endif *><* endfor *>
  }
}
```

Add to `~/.config/matugen/config.toml`:

```toml
[templates.shelltint]
input_path = '~/.config/matugen/templates/shelltint.json'
output_path = '~/.cache/shelltint/sources/matugen.json'
```

Then in ShellTint → Colours choose "Matugen file" with the path `~/.cache/shelltint/sources/matugen.json`.

### Noctalia v5 template

Noctalia v5 no longer writes a palette file. Add a user template that writes one. **Not tested on this machine**; Noctalia's template syntax is matugen-style, so the template above should work unchanged.

```toml
[theme.templates.user.shelltint]
input_path = "~/.config/noctalia/templates/shelltint.json"
output_path = "~/.cache/shelltint/sources/noctalia.json"
```

Copy the matugen template above to `~/.config/noctalia/templates/shelltint.json`. The Noctalia source picks the file up automatically.

## Settings

| Setting | Values | Default | Where |
| --- | --- | --- | --- |
| `paletteSource` | `auto`, `dms`, `caelestia`, `noctalia`, `end4`, `matugen` | `auto` | Colours |
| `customPalettePath` | path to a JSON or CSS file | empty | Colours (Matugen file) |
| `mode` | `follow`, `dark`, `light` | `follow` | Colours |
| `toolbarTheming` | on / off | on | Overview, popup |
| `toolbarStyle` | `tonal`, `vivid` | `tonal` | Colours |
| `websiteStyling` | on / off | on | Overview, Websites, popup |
| `disabledSites` | site list | empty | popup; managed under Websites → Paused sites |
| `searxngInstances` | one hostname or URL per line | empty | Websites |
| `autoCheckUpdates` | on / off | on | Maintenance |

A paused site covers its subdomains: pausing `youtube.com` also pauses `m.youtube.com`.

## Rebuilds

- While the browser runs, the helper watches the active source's files. When they change and settle, it writes a new palette, recolours the toolbar and rebuilds the website styles in the background. Open tabs switch to the new styles without a reload.
- When the browser connects, the helper checks Catppuccin for new userstyles, at most once every 10 minutes (turn off with `autoCheckUpdates`).
- To rebuild while the browser is closed, add ShellTint's hook to matugen (print the snippet with `./scripts/install.sh --with-matugen-hook`):

  ```toml
  post_hook = '~/.local/share/shelltint/builder/scripts/matugen-hook.sh'
  ```

- Manual: ShellTint → Maintenance → Rebuild styles now, or Check Catppuccin for updates.

## Troubleshooting

**Helper not connected**

- Check that `~/.mozilla/native-messaging-hosts/shelltint.json` exists and its `path` points at an existing, executable `shelltint_host.py`.
- Check that `python3` is on your PATH.
- Restart the browser after installing the helper.
- Flatpak and Snap browsers run sandboxed. They need the manifest inside their sandbox and may not be able to start the helper at all; a native package is recommended.

**Zen:** never create `~/.zen`. Zen treats that folder as its profile folder and opens an empty profile. Zen reads native messaging manifests from `~/.mozilla/native-messaging-hosts`, which the installer already covers.

**No source detected**

- Open ShellTint → Colours; the detected-sources list shows each file ShellTint looked for and why it was rejected.
- Make sure the shell has generated a palette at least once (change the wallpaper or theme).
- Otherwise use the Matugen file source.

**Some styles failed or a site looks wrong**

- Build output is in `~/.cache/shelltint/build.log`. Failed styles are also listed under Websites.
- Pause the site from the popup.

**Reset the website styles**

```sh
rm -rf ~/.cache/shelltint/userstyles
```

Then use Maintenance → Rebuild styles now.

## Uninstall

```sh
./scripts/uninstall.sh          # helper and native messaging manifests
./scripts/uninstall.sh --purge  # also ~/.cache/shelltint and ~/.config/shelltint
```

Then remove the extension from `about:addons`.

## Privacy and permissions

ShellTint collects no data and sends nothing anywhere. The extension talks only to the local helper. The helper's only network access is downloading Catppuccin's public userstyles:

- <https://github.com/catppuccin/userstyles/releases/download/all-userstyles-export/import.json>
- <https://userstyles.catppuccin.com/lib/std/v1.less>

| Permission | Why |
| --- | --- |
| `nativeMessaging` | Talk to the local helper that reads the shell's colour files and serves the compiled CSS. |
| `theme` | Colour the toolbar, tabs and menus. |
| `scripting` + access to all websites | Insert the site CSS into pages that a style matches. |
| `webNavigation` | Notice navigations and frames, so styles apply early and follow in-page navigation. |
| `storage` | Keep your settings. |

## Development

```sh
node --test "builder/test/*.test.mjs"
python3 -m unittest discover -s host/tests
./scripts/package.sh    # web-ext lint + build → dist/
```

To add a colour source, see [docs/adapters.md](docs/adapters.md). The helper protocol is in [docs/protocol.md](docs/protocol.md).

## Credits

- ShellTint by Jazzmedo.
- Based on [MatugenFox](https://github.com/Ubaidullah-Web-Dev/MatugenFox) by Ubaid, MIT.
- Website styles from [Catppuccin userstyles](https://github.com/catppuccin/userstyles), MIT.
- Compiled with [less](https://lesscss.org/) and [postcss](https://postcss.org/).

## License

MIT. See [LICENSE](LICENSE).
