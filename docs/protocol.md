# Helper protocol

The extension and the helper (`shelltint_host.py`) talk over Firefox native messaging: each message is a 4-byte native-endian length followed by UTF-8 JSON. Protocol version: `1`.

Limits:

- Firefox rejects a single message from the helper larger than **1 MB**. The helper refuses to send anything bigger.
- Site CSS is sent in chunks with a budget of **800 KB** per message; a block larger than that is split into parts.

## Extension → helper

| Type | Payload | Helper action |
| --- | --- | --- |
| `ST_SETTINGS` | `{settings}` | Update the settings mirror (`~/.config/shelltint/settings.json`). Re-resolve the palette if source, path or mode changed. Start the Catppuccin update check once per connection when website styling is on. |
| `ST_SYNC` | `{}` | Send `ST_PALETTE`, `ST_STYLES_INDEX` and `ST_STATUS` now. |
| `ST_GET_SITE_CSS` | `{reqId, hashes}` (≤ 1000 hashes) | Reply with one or more `ST_SITE_CSS`. |
| `ST_DETECT_SOURCES` | `{reqId}` | Reply with `ST_SOURCES`. |
| `ST_REBUILD` | `{reqId, force}` | Start a style rebuild; reply with `ST_ACTION_RESULT`. |
| `ST_CHECK_UPDATES` | `{reqId}` | Check Catppuccin for new styles now; reply with `ST_ACTION_RESULT`. |

## Helper → extension

| Type | Payload |
| --- | --- |
| `ST_HELLO` | `{hostVersion, protocol: 1, settingsMirror, paths: {install, cache, config, log}}`. Sent first. |
| `ST_PALETTE` | `{palette}` (see below), or `{error, lastGood}` when the source failed. |
| `ST_STYLES_INDEX` | `{index}` (the published `index.json`) or `{index: null}`. |
| `ST_SITE_CSS` | `{reqId, items: [{hash, css, part?, parts?}], final, missing?}`. `missing` (hashes with no file) is present on the final message. |
| `ST_SOURCES` | `{reqId, active, sources: [{id, label, found, path, mtime, ok, error?, mode?}]}` |
| `ST_STATUS` | `{building, lastBuild: {at, ok, gen, error}, lastUpdateCheck: {at, result}}` |
| `ST_ACTION_RESULT` | `{reqId, ok, error?}` |
| `ST_ERROR` | `{reason, detail}` |

If `protocol` in `ST_HELLO` does not match, the extension reports that the helper needs updating.

## Inside the extension

`runtime.sendMessage` between pages and the background script. Messages from the options page and popup are accepted only when `sender.url` is an extension page; content scripts may send only `st:frame-ready`.

| Type | From | Result |
| --- | --- | --- |
| `st:get-state` | options, popup | `{settings, host, palette, sources, styles, build, customStyles}` |
| `st:update-settings` | options, popup | `{patch}` → `{ok, settings}` |
| `st:site-state` | popup | `{url}` → `{host, siteKey, themeable, styles, customStyles, built, siteEnabled, globalEnabled}`; `customStyles` lists own styles matching the page, disabled ones included |
| `st:save-style` | options | `{style}` → `{ok, style}` or `{ok: false, error}`; a style without `id` is created |
| `st:toggle-style` | options, popup | `{id, enabled}` → `{ok}` |
| `st:delete-style` | options | `{id}` → `{ok}` |
| `st:detect-sources` | options | forwards `ST_DETECT_SOURCES`, resolves with `ST_SOURCES` |
| `st:rebuild` | options | forwards `ST_REBUILD`, resolves with `ST_ACTION_RESULT` |
| `st:check-updates` | options | forwards `ST_CHECK_UPDATES`, resolves with `ST_ACTION_RESULT` |
| `st:reconnect` | options | reconnects to the helper now |
| `st:frame-ready` | content script | applies styles to that frame |
| `st:changed` | background → pages (broadcast) | `{part: 'settings' \| 'host' \| 'palette' \| 'styles' \| 'build' \| 'sources' \| 'custom-styles'}`; open pages re-query |

## Own styles

Kept in `storage.local.customStyles`, never sent to the helper:

```
{id, name, enabled, sites, css, replaceCatppuccin, createdAt, updatedAt}
```

`sites` is the text as typed (one hostname or URL per line, `*` for every page). For a page, the background inserts one sheet: the Catppuccin blocks, then `:root { --shelltint-*: … }` with the palette, then each matching style's CSS in list order.

## palette.json (format 1)

Written atomically by the helper to `~/.cache/shelltint/palette.json`, only when `hash` changes. Read by the builder and sent in `ST_PALETTE`.

```json
{
  "format": 1,
  "hash": "sha256 of source id, mode, roles and extras",
  "generatedAt": 1789481323.1,
  "source": {
    "id": "dms",
    "label": "DankMaterialShell",
    "path": "/home/user/.cache/DankMaterialShell/dms-colors.json",
    "mtime": 1789481300.0
  },
  "mode": "dark",
  "modeSource": "shell",
  "roles": {
    "primary": "#a8b665",
    "on_primary": "#2b3400",
    "surface": "#32302f",
    "on_surface": "#ddc7a1"
  },
  "extras": {
    "dank16": { "color0": "#252423" }
  },
  "warnings": []
}
```

| Field | Meaning |
| --- | --- |
| `format` | Always `1` for this layout. |
| `hash` | Changes whenever anything that affects colours changes. |
| `source` | Which adapter produced the palette and from which file. |
| `mode` | `dark` or `light`. |
| `modeSource` | `shell` (from the shell), `forced` (user setting) or `inferred` (from surface lightness). |
| `roles` | Material 3 roles in snake_case, `#rrggbb`. Always includes `primary`, a surface or background role, and on_surface or on_background. |
| `extras` | Source-specific additions, such as DMS's 16-colour terminal palette. |
| `warnings` | Human-readable notes, e.g. derived roles or a forced mode the source does not provide. |
