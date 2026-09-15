# ShellTint privacy policy

ShellTint does not collect, store or transmit any personal data.

- The extension communicates only with the ShellTint helper installed on your own computer (native messaging). It reads colour files from your desktop shell and returns CSS.
- Settings (for example paused sites and SearXNG instances) are kept in the browser's local extension storage and a local file in `~/.config/shelltint`. They never leave your computer.
- No analytics, tracking, telemetry or remote logging.
- The only network requests are made by the local helper, which downloads Catppuccin's public userstyles so they can be recoloured locally:
  - https://github.com/catppuccin/userstyles/releases/download/all-userstyles-export/import.json
  - https://userstyles.catppuccin.com/lib/std/v1.less

  These requests contain no information about you or your browsing.

Permissions and why they are needed:

- Native messaging: talk to the local helper.
- Theme: colour the browser toolbar.
- Access to all websites and scripting: insert styles into pages a style matches.
- Web navigation: apply styles as pages and frames load.
- Storage: remember your settings.
