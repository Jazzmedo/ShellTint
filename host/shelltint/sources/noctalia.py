"""Noctalia.

v4 (Quickshell) writes ${NOCTALIA_CONFIG_DIR:-~/.config/noctalia/}colors.json with
16 keys (mPrimary … mShadow) and keeps dark mode in settings.json. The other
Material 3 roles are derived from those.

v5 writes no palette file; a user template can write
~/.cache/shelltint/sources/noctalia.json in the generic matugen format, which
is preferred when present.
"""

import os
from pathlib import Path

from .. import colors, paths
from ..colors import derive_missing
from .base import ParsedPalette, Source, SourceError, read_json, read_json_quietly
from .matugen import parse_palette_file


def _config_dir():
    override = os.environ.get("NOCTALIA_CONFIG_DIR", "")
    return Path(override) if os.path.isabs(override) else paths.config_home() / "noctalia"


class NoctaliaSource(Source):
    id = "noctalia"
    label = "Noctalia"

    def template_file(self):
        return paths.cache_dir() / "sources" / "noctalia.json"

    def candidates(self, settings):
        return [self.template_file(), _config_dir() / "colors.json"]

    def watch_paths(self, settings):
        return self.candidates(settings) + [_config_dir() / "settings.json"]

    def shell_mode(self):
        path = _config_dir() / "settings.json"
        data = read_json_quietly(path) if path.is_file() else None
        schemes = data.get("colorSchemes") if isinstance(data, dict) else None
        if isinstance(schemes, dict) and isinstance(schemes.get("darkMode"), bool):
            return "dark" if schemes["darkMode"] else "light"
        return None

    def parse(self, path, settings):
        if path == self.template_file():
            return parse_palette_file(path)

        roles = colors.normalise_roles(read_json(path))
        if colors.missing_roles(roles):
            raise SourceError(f"{path} lacks {', '.join(colors.missing_roles(roles))}")
        shell_mode = self.shell_mode()
        mode = shell_mode or colors.infer_mode(roles) or "dark"
        full = derive_missing(roles, mode)
        warnings = []
        if len(full) > len(roles):
            warnings.append(f"Noctalia provides {len(roles)} colours; ShellTint derived {len(full) - len(roles)} more")
        return ParsedPalette(
            mode=mode,
            mode_source="shell" if shell_mode else "inferred",
            variants={mode: full},
            warnings=warnings,
        )
