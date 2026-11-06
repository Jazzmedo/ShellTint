"""GNOME.

GNOME 47+ exposes one accent colour (org.gnome.desktop.interface accent-color)
and a colour scheme (prefer-dark / default / prefer-light); everything else is
derived the way GNOME apps look — see sources/de.py. The gsettings database
has no plain file, so changes are noticed through ~/.config/dconf/user's mtime.
"""

import os
import shutil
import subprocess
from pathlib import Path

from .. import colors, paths
from .base import ParsedPalette, Source, SourceError
from .de import GNOME_ACCENTS, accent_engine


def gsettings_get(schema, key):
    binary = shutil.which("gsettings")
    if not binary:
        raise SourceError("gsettings is not available")
    try:
        out = subprocess.run([binary, "get", schema, key], text=True, capture_output=True, timeout=5)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise SourceError(f"gsettings failed: {e}") from e
    if out.returncode != 0:
        return ""
    return out.stdout.strip().strip("'")


class GnomeSource(Source):
    id = "gnome"
    label = "GNOME"

    def running(self):
        return "GNOME" in os.environ.get("XDG_CURRENT_DESKTOP", "")

    def find(self, settings):
        return Path("gnome") if self.running() else None

    def candidates(self, settings):
        # candidates() is file-based everywhere else; GNOME is command-based,
        # so this only names the display path used when nothing is found.
        return [Path("gsettings org.gnome.desktop.interface accent-color")]

    def mode_hint(self, settings):
        return None

    def watch_paths(self, settings):
        watches = [paths.config_home() / "dconf" / "user"]
        watches += [paths.config_home() / "gtk-4.0" / "settings.ini",
                    paths.config_home() / "gtk-3.0" / "settings.ini"]
        return watches

    def parse(self, path, settings):
        if not self.running():
            raise SourceError("GNOME is not the current desktop")
        named = gsettings_get("org.gnome.desktop.interface", "accent-color")
        accent = GNOME_ACCENTS.get(named)
        warnings = []
        if not accent:
            accent = GNOME_ACCENTS["blue"]
            if named:
                warnings.append(f"unknown GNOME accent '{named}'; using blue")
            else:
                warnings.append("this GNOME has no accent colour (needs 47+); using blue")
        scheme = gsettings_get("org.gnome.desktop.interface", "color-scheme")
        mode = "dark" if "prefer-dark" in scheme else "light"

        roles = accent_engine(accent, mode)
        full = colors.derive_missing(roles, mode)
        return ParsedPalette(
            mode=mode,
            mode_source="shell",
            variants={mode: full},
            warnings=warnings + [f"GNOME provides an accent; ShellTint derived {len(full) - len(roles)} more roles"],
        )
