"""DankMaterialShell: ~/.cache/DankMaterialShell/dms-colors.json."""

import re

from .. import colors, paths
from .base import ParsedPalette, Source, SourceError, read_json, read_json_quietly


class DmsSource(Source):
    id = "dms"
    label = "DankMaterialShell"

    def candidates(self, settings):
        return paths.unique([
            paths.cache_home() / "DankMaterialShell" / "dms-colors.json",
            paths.home() / ".cache" / "DankMaterialShell" / "dms-colors.json",
        ])

    def session_files(self):
        return paths.unique([
            paths.state_home() / "DankMaterialShell" / "session.json",
            paths.home() / ".local" / "state" / "DankMaterialShell" / "session.json",
        ])

    def watch_paths(self, settings):
        return self.candidates(settings) + self.session_files()

    def shell_mode(self):
        for path in self.session_files():
            session = read_json_quietly(path) if path.is_file() else None
            if isinstance(session, dict) and isinstance(session.get("isLightMode"), bool):
                return "light" if session["isLightMode"] else "dark"
        return None

    def parse(self, path, settings):
        data = read_json(path)
        blocks = data.get("colors") if isinstance(data, dict) else None
        if not isinstance(blocks, dict):
            raise SourceError(f"{path} has no colors block")
        variants = {m: colors.normalise_roles(blocks.get(m)) for m in ("dark", "light")}
        variants = {m: roles for m, roles in variants.items() if roles}
        if not variants:
            raise SourceError(f"{path} has no usable colours")

        dank16 = {"dark": {}, "light": {}}
        for key, value in (data.get("dank16") or {}).items():
            if not re.fullmatch(r"color\d{1,2}", str(key)) or not isinstance(value, dict):
                continue
            for mode in dank16:
                colour = colors.parse_color(value.get(mode) or value.get("default"))
                if colour:
                    dank16[mode][key] = colour

        mode = self.shell_mode()
        return ParsedPalette(
            mode=mode or colors.infer_mode(next(iter(variants.values()))),
            mode_source="shell" if mode else "inferred",
            variants=variants,
            extras={"dank16": dank16} if dank16["dark"] or dank16["light"] else {},
        )
