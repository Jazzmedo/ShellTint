"""KDE Plasma.

Plasma keeps everything ShellTint needs in the plain-text ~/.config/kdeglobals:
the accent (General/AccentColor, falling back to the scheme's selection colour
when unset or "auto", as Plasma 6 does), the real window background and
foreground (Colors:Window), and the scheme name, whose "Dark" is how stock
Plasma names its dark schemes. Containers and surface levels are derived.
"""

import configparser
import re
from pathlib import Path

from .. import colors
from .base import ParsedPalette, Source, SourceError
from .de import parse_de_color


def read_section(parser, section):
    """A section as a dict, tolerating missing files and sections."""
    data = {}
    if parser.has_section(section):
        data.update(parser.items(section))
    return data


class KdeSource(Source):
    id = "kde"
    label = "KDE Plasma"

    def candidates(self, settings):
        return [Path.home() / ".config" / "kdeglobals",
                Path.home() / ".config" / "kdedefaults" / "kdeglobals"]

    def mode_hint(self, settings):
        return None

    def parse(self, path, settings):
        parser = configparser.ConfigParser(interpolation=None, strict=False)
        try:
            parser.read(path, encoding="utf-8")
        except (OSError, configparser.Error) as e:
            raise SourceError(f"cannot read {path}: {e}") from e

        general = read_section(parser, "General")
        view = read_section(parser, "Colors:View")
        window = read_section(parser, "Colors:Window")

        accent = parse_de_color(general.get("accentcolor", ""))
        if not accent or accent.lower().startswith("#auto"):
            accent = parse_de_color(view.get("selectionbackground", ""))
        if not accent:
            raise SourceError(f"{path} has no accent or selection colour")

        surface = parse_de_color(window.get("backgroundnormal", ""))
        on_surface = parse_de_color(window.get("foregroundnormal", ""))
        if not surface:
            surface = accent  # last resort; derive_missing anchors on it
        if not on_surface:
            on_surface = colors.on_color(surface)

        scheme = general.get("colorscheme", "")
        mode = "dark" if re.search(r"dark", scheme, re.I) else ("light" if scheme else None)

        roles = colors.normalise_roles({
            "primary": accent,
            "surface": surface,
            "on_surface": on_surface,
            "surface_variant": parse_de_color(view.get("foregroundnormal", "")) or surface,
            "outline": parse_de_color(view.get("foregroundnormal", "")) or accent,
            "error": parse_de_color(window.get("foregroundnegative", ""))
                or parse_de_color(view.get("foregroundnegative", "")),
        })
        full = colors.derive_missing(roles, mode or colors.infer_mode(roles))
        return ParsedPalette(
            mode=mode,
            mode_source="shell" if mode else "inferred",
            variants={mode or "dark": full},
            warnings=[f"KDE Plasma provides an accent and window colours; ShellTint derived {len(full) - len(roles)} more roles"],
        )
