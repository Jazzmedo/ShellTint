"""pywal and pywal16.

pywal turns the wallpaper into a 16-colour palette at ~/.cache/wal/colors.json.
It carries a real background and foreground, so the palette is anchored on
those rather than on desktop defaults, and light wallpapers yield light palettes
with no mode flag. color4 is the accent (color1 as fallback), like the tested
PhotoCraft adapter.
"""

import re
from pathlib import Path

from .. import colors
from .base import ParsedPalette, Source, SourceError, read_json


def _color(data, key):
    value = data.get(key)
    return colors.parse_color(value) if isinstance(value, str) else None


class PywalSource(Source):
    id = "pywal"
    label = "pywal"

    def candidates(self, settings):
        return [Path.home() / ".cache" / "wal" / "colors.json"]

    def mode_hint(self, settings):
        return None

    def parse(self, path, settings):
        data = read_json(path)
        if not isinstance(data, dict):
            raise SourceError(f"{path} is not a pywal palette")
        blocks = [data.get("special", {}), data.get("colors", {}), data]
        flat = {}
        for block in blocks:
            if isinstance(block, dict):
                flat.update(block)

        bg = _color(flat, "background")
        fg = _color(flat, "foreground")
        if not bg or not fg:
            raise SourceError(f"{path} lacks background/foreground")
        accent = _color(flat, "color4") or _color(flat, "color1")
        if not accent:
            raise SourceError(f"{path} has no color1/color4")

        roles = colors.normalise_roles({
            "background": bg,
            "surface": bg,
            "on_surface": fg,
            "on_background": fg,
            "primary": accent,
            "secondary": _color(flat, "color5") or accent,
            "tertiary": _color(flat, "color3") or accent,
            "error": _color(flat, "color1"),
            "outline": _color(flat, "color8") or fg,
        })
        mode = colors.infer_mode(roles) or "dark"
        full = colors.derive_missing(roles, mode)

        dank16 = {}
        for key, value in flat.items():
            if re.fullmatch(r"color\d{1,2}", key):
                colour = colors.parse_color(value)
                if colour:
                    dank16[key] = colour

        return ParsedPalette(
            mode=mode,
            mode_source="inferred",
            variants={mode: full},
            # extras values are per-mode maps; a wal palette is one palette.
            extras={"dank16": {"dark": dank16, "light": dank16}} if dank16 else {},
            warnings=[f"pywal provides 16 colours; ShellTint derived {len(full) - len(roles)} more roles"],
        )
