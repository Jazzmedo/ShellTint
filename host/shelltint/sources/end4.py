"""end-4 illogical-impulse: ~/.local/state/quickshell/user/generated/colors.json.

A flat map of snake_case Material 3 roles. It carries no mode, so the mode is
read from the background's lightness, as the shell's own theme loader does.
"""

from .. import colors, paths
from .base import ParsedPalette, Source, SourceError, read_json


class End4Source(Source):
    id = "end4"
    label = "end-4 illogical-impulse"

    def candidates(self, settings):
        # end-4's matugen config writes to ~/.local/state regardless of XDG_STATE_HOME.
        return paths.unique([
            paths.state_home() / "quickshell" / "user" / "generated" / "colors.json",
            paths.home() / ".local" / "state" / "quickshell" / "user" / "generated" / "colors.json",
        ])

    def parse(self, path, settings):
        roles = colors.normalise_roles(read_json(path))
        if not roles:
            raise SourceError(f"{path} has no usable colours")
        mode = colors.infer_mode(roles) or "dark"
        return ParsedPalette(mode=mode, mode_source="inferred", variants={mode: roles})
