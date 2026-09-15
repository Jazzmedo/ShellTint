"""Any matugen output the user points at: JSON or a file of CSS variables.

JSON may be flat ({"primary": "#..."}), wrapped ({"mode": "dark", "colors": {...}})
or matugen's nested form ({"colors": {"primary": {"dark": ..., "light": ...}}}).
CSS accepts --primary, --mg-primary, --md-sys-color-primary and similar names.
"""

import json
import re

from .. import colors, paths
from .base import ParsedPalette, Source, SourceError, mode_word

_CSS_VAR = re.compile(r"(--[\w-]+)\s*:\s*([^;}]+)[;}]")
_COLOR_SCHEME = re.compile(r"color-scheme\s*:\s*(dark|light)\b", re.I)


def _colour_value(value):
    """A colour string, or matugen's {"hex": ...} object."""
    if isinstance(value, dict):
        return value.get("hex") or value.get("color")
    return value


def parse_json_palette(data, path):
    if not isinstance(data, dict):
        raise SourceError(f"{path} is not a JSON object")
    block = data.get("colors", data.get("colours", data))
    if not isinstance(block, dict):
        raise SourceError(f"{path} has no colours")

    variants = {}
    nested = [v for v in block.values() if isinstance(v, dict) and ("dark" in v or "light" in v)]
    if nested:
        for mode in ("dark", "light"):
            flat = {k: _colour_value(v.get(mode, v.get("default"))) for k, v in block.items() if isinstance(v, dict)}
            roles = colors.normalise_roles(flat)
            if roles:
                variants[mode] = roles
    else:
        roles = colors.normalise_roles({k: _colour_value(v) for k, v in block.items()})
        if roles:
            variants[""] = roles
    if not variants:
        raise SourceError(f"{path} has no usable colours")

    mode = mode_word(data.get("mode"))
    for flag in ("is_dark", "is_dark_mode", "isDark", "dark"):
        if mode is None and isinstance(data.get(flag), bool):
            mode = "dark" if data[flag] else "light"
    return mode, variants


def parse_css_palette(text, path):
    roles = colors.normalise_roles({name: value for name, value in _CSS_VAR.findall(text)})
    if not roles:
        raise SourceError(f"{path} has no CSS colour variables ShellTint recognises")
    match = _COLOR_SCHEME.search(text)
    return (match.group(1).lower() if match else None), {"": roles}


def parse_palette_file(path):
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        raise SourceError(f"cannot read {path}: {e.strerror or e}") from e
    stripped = text.lstrip()
    if stripped.startswith("{"):
        try:
            data = json.loads(text)
        except ValueError as e:
            raise SourceError(f"{path} is not valid JSON ({e})") from e
        mode, variants = parse_json_palette(data, path)
    else:
        mode, variants = parse_css_palette(text, path)

    mode_source = "shell" if mode else "inferred"
    if "" in variants:
        roles = variants.pop("")
        mode = mode or colors.infer_mode(roles) or "dark"
        variants[mode] = roles
    elif mode is None:
        mode = "dark" if "dark" in variants else "light"
    return ParsedPalette(mode=mode, mode_source=mode_source, variants=variants)


class MatugenSource(Source):
    id = "matugen"
    label = "Matugen file"

    def candidates(self, settings):
        custom = str((settings or {}).get("customPalettePath") or "").strip()
        return [paths.expand(custom)] if custom else []

    def parse(self, path, settings):
        return parse_palette_file(path)
