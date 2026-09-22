# Notes for addons.mozilla.org reviewers

## What ShellTint does

ShellTint themes the Firefox toolbar and restyles websites using the colour palette of the user's Linux desktop shell (DankMaterialShell, Caelestia, Noctalia, end-4 illogical-impulse, or a matugen output file).

It needs a companion native messaging host, the ShellTint helper, published with the source at https://github.com/Jazzmedo/ShellTint and installed by the user with `./scripts/install.sh`. The helper is a Python program that reads the shell's colour files and serves CSS. Without the helper the extension shows an install prompt and does nothing else.

## Permissions

| Permission | Why |
| --- | --- |
| `nativeMessaging` | Communicate with the local helper (host name `shelltint`). |
| `theme` | Apply the shell's colours to the toolbar, tabs and menus with `browser.theme.update`. |
| `scripting` | Insert and remove the site CSS with `scripting.insertCSS` / `removeCSS`. |
| host permission `<all_urls>` | Styles cover 130+ sites, plus the user's own self-hosted instances and any site they write a style for themselves; the set changes as Catppuccin adds styles, so it cannot be a fixed list. CSS is only inserted into pages a style's matchers select. |
| `webNavigation` | Find frames and react to navigations (including in-page history changes) so the right CSS is applied early and removed when a page no longer matches. |
| `storage` | Settings. `storage.session` remembers which CSS was inserted into which frame. |

The single content script (`content/frame-ping.js`) only sends a "frame ready" message to the background script. It reads nothing from the page.

## Styles the user writes ("My styles")

The settings page has a CSS editor, like Stylus: the user writes CSS and lists
the sites it applies to. That CSS is stored in `storage.local`, and inserted
with `scripting.insertCSS` exactly like the Catppuccin CSS. It is never
executed as JavaScript, never leaves the machine, and is capped at 200 styles
of 256 KB each. `@-moz-document` is not honoured by `insertCSS`, so the
extension evaluates the site list itself (`shared/matchers.js`) and inserts
only into frames that match.

## No remote code

- The extension contains no remote code, no `eval`/`new Function`, and no `innerHTML`. All JavaScript is in the package, unminified.
- The only thing the extension receives from the helper is data: colour values and CSS text. The CSS is inserted with `scripting.insertCSS`; nothing received is executed.
- The helper builds that CSS locally from Catppuccin's public, MIT-licensed userstyles (Less sources). It compiles them with `less` using `javascriptEnabled: false`, so no JavaScript in a stylesheet can run.
- Since 1.2.0 the helper compiles a style the first time a page needs it, instead of compiling all 130+ on every palette change. The extension only asks for CSS by block name; it cannot choose what is compiled or pass anything into the build. The inputs are still only Catppuccin's sources and the local palette.
- Data collection: none (`data_collection_permissions: {"required": ["none"]}`). The helper's only network access is downloading Catppuccin's userstyles from github.com and userstyles.catppuccin.com.

## Relationship to MatugenFox

ShellTint is based on MatugenFox by Ubaid (MIT, https://github.com/Ubaidullah-Web-Dev/MatugenFox). The MIT notice is kept in LICENSE and credited in the README and the extension's About page. Differences:

- Added palette-source adapters for DankMaterialShell, Caelestia, Noctalia, end-4 illogical-impulse and matugen files, with auto-detection and light/dark handling. MatugenFox only read one CSS-variables file.
- Added website styling from Catppuccin userstyles for 130+ sites, compiled locally with the palette, with `@-moz-document` matchers evaluated by the extension and CSS served on demand.
- Added per-site pause, self-hosted instances, user-written styles, automatic rebuilds when the shell's palette changes, and a new settings page and popup.
- Removed MatugenFox's hand-written site templates, DuckDuckGo theming, eco mode, and writing userChrome.css / userContent.css into the profile.

## Testing without a desktop shell

1. Install the helper: `git clone https://github.com/Jazzmedo/ShellTint && cd ShellTint && ./scripts/install.sh` (needs Python 3.8+, Node.js 18+, curl, flock).
2. Save this as `/tmp/shelltint-sample.json`:

   ```json
   {
     "mode": "dark",
     "colors": {
       "primary": "#a8b665",
       "on_primary": "#2b3400",
       "secondary": "#c5c9a8",
       "surface": "#1b1c16",
       "on_surface": "#e4e3d8",
       "background": "#1b1c16",
       "surface_container": "#20211a",
       "outline": "#8f9180",
       "error": "#ffb4ab"
     }
   }
   ```

3. Install the extension, grant access to all websites, open ShellTint → Colours, choose "Matugen file" and enter `/tmp/shelltint-sample.json`, then press Check.
4. The toolbar takes the colours. Maintenance → Rebuild styles now builds the website styles; https://github.com or https://www.youtube.com then show the recoloured Catppuccin style. Change `primary` in the file and the toolbar and open tabs update within a few seconds.
