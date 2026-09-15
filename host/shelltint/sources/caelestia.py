"""Caelestia: ${XDG_STATE_HOME:-~/.local/state}/caelestia/scheme.json.

The file is {name, flavour, mode, variant, colours}; colours are camelCase keys
with hex values lacking '#', plus terminal colours term0..term15.
"""

import re

from .. import colors, paths
from .base import ParsedPalette, Source, SourceError, mode_word, read_json


class CaelestiaSource(Source):
    id = "caelestia"
    label = "Caelestia"

    def candidates(self, settings):
        return paths.unique([
            paths.state_home() / "caelestia" / "scheme.json",
            paths.home() / ".local" / "state" / "caelestia" / "scheme.json",
        ])

    def parse(self, path, settings):
        data = read_json(path)
        colours = data.get("colours") if isinstance(data, dict) else None
        if not isinstance(colours, dict):
            raise SourceError(f"{path} has no colours block")
        roles = colors.normalise_roles(colours)
        if not roles:
            raise SourceError(f"{path} has no usable colours")

        # term1..term3 are the red, green and yellow tones the builder uses as hue hints.
        terminal = {}
        for key, value in colours.items():
            match = re.fullmatch(r"term(\d{1,2})", str(key))
            colour = colors.parse_color(value)
            if match and colour:
                terminal[f"color{int(match.group(1))}"] = colour

        mode = mode_word(data.get("mode"))
        inferred = colors.infer_mode(roles)
        resolved = mode or inferred or "dark"
        return ParsedPalette(
            mode=resolved,
            mode_source="shell" if mode else "inferred",
            variants={resolved: roles},
            extras={"dank16": {resolved: terminal}} if terminal else {},
        )
