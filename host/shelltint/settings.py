"""The extension's settings, mirrored to ~/.config/shelltint/settings.json.

The mirror lets scripts run while the browser is closed, and hands a fresh
browser profile the choices made in another. Keep in step with
extension/shared/defaults.js.
"""

import json

from . import paths

VERSION = 1
SOURCES = ("auto", "dms", "caelestia", "noctalia", "end4", "matugen")
DEFAULTS = {
    "version": VERSION,
    "paletteSource": "auto",
    "customPalettePath": "",
    "mode": "follow",
    "toolbarTheming": True,
    "toolbarStyle": "tonal",
    "websiteStyling": True,
    "disabledSites": [],
    "searxngInstances": [],
    "autoCheckUpdates": True,
}
ENUMS = {"paletteSource": SOURCES, "mode": ("follow", "dark", "light"), "toolbarStyle": ("tonal", "vivid")}
BOOLEANS = ("toolbarTheming", "websiteStyling", "autoCheckUpdates")
# Settings that change which colours are resolved.
PALETTE_KEYS = ("paletteSource", "customPalettePath", "mode")


def _string_list(value, limit):
    out = []
    for item in value if isinstance(value, list) else []:
        if isinstance(item, str):
            line = item.strip()[:500]
            if line and line not in out:
                out.append(line)
        if len(out) >= limit:
            break
    return out


def normalise(raw):
    data = raw if isinstance(raw, dict) else {}
    out = dict(DEFAULTS)
    for key, allowed in ENUMS.items():
        if data.get(key) in allowed:
            out[key] = data[key]
    for key in BOOLEANS:
        if isinstance(data.get(key), bool):
            out[key] = data[key]
    if isinstance(data.get("customPalettePath"), str):
        out["customPalettePath"] = data["customPalettePath"].strip()[:4096]
    out["disabledSites"] = sorted({s.lower() for s in _string_list(data.get("disabledSites"), 1000)})
    out["searxngInstances"] = _string_list(data.get("searxngInstances"), 200)
    out["version"] = VERSION
    return out


def load_mirror(path=None):
    """The mirrored settings, or None when there is no readable mirror."""
    try:
        with open(path or paths.settings_file(), "r", encoding="utf-8") as f:
            return normalise(json.load(f))
    except (OSError, ValueError):
        return None


def save_mirror(settings, path=None):
    target = path or paths.settings_file()
    clean = normalise(settings)
    if load_mirror(target) == clean:
        return False
    paths.atomic_write(target, json.dumps(clean, indent=2) + "\n")
    return True
