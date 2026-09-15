"""Colour parsing and Material 3 role normalisation shared by every source."""

import re

ROLES = frozenset("""
background on_background surface on_surface surface_variant on_surface_variant
surface_dim surface_bright surface_tint surface_container_lowest surface_container_low
surface_container surface_container_high surface_container_highest
inverse_surface inverse_on_surface inverse_primary
primary on_primary primary_container on_primary_container
primary_fixed primary_fixed_dim on_primary_fixed on_primary_fixed_variant
secondary on_secondary secondary_container on_secondary_container
secondary_fixed secondary_fixed_dim on_secondary_fixed on_secondary_fixed_variant
tertiary on_tertiary tertiary_container on_tertiary_container
tertiary_fixed tertiary_fixed_dim on_tertiary_fixed on_tertiary_fixed_variant
error on_error error_container on_error_container
outline outline_variant shadow scrim source_color
""".split())

_HEX = re.compile(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
_RGB = re.compile(r"^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$", re.I)
_PREFIX = re.compile(r"^(?:md-sys-color-|mg-|m3[-_]?|m(?=[A-Z]))")


def parse_color(value):
    """'#rgb', '#rrggbb', '#rrggbbaa', bare 'rrggbb' or 'rgb(r, g, b)' as '#rrggbb'; else None."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    match = _HEX.match(text)
    if match:
        digits = match.group(1)
        # Bare three-digit words are too ambiguous to be colours.
        if len(digits) == 3:
            if not text.startswith("#"):
                return None
            digits = "".join(c * 2 for c in digits)
        return "#" + digits[:6].lower()
    match = _RGB.match(text)
    if match:
        channels = [int(c) for c in match.groups()]
        if all(c <= 255 for c in channels):
            return "#" + "".join(f"{c:02x}" for c in channels)
    return None


def role_name(key):
    """'--mg-on-primary', 'mOnPrimary', 'onPrimary', 'md-sys-color-on-primary' → 'on_primary'."""
    name = str(key).strip().lstrip("-")
    name = _PREFIX.sub("", name)
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    return re.sub(r"[-\s]+", "_", name).lower()


def normalise_roles(mapping):
    """Known Material 3 roles with valid colours; everything else is ignored."""
    roles = {}
    if not isinstance(mapping, dict):
        return roles
    for key, value in mapping.items():
        name = role_name(key)
        colour = parse_color(value)
        if name in ROLES and colour:
            roles[name] = colour
    return dict(sorted(roles.items()))


def missing_roles(roles):
    missing = []
    if "primary" not in roles:
        missing.append("primary")
    if "surface" not in roles and "background" not in roles:
        missing.append("surface")
    if "on_surface" not in roles and "on_background" not in roles:
        missing.append("on_surface")
    return missing


def _channels(hex_colour):
    return [int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)]


def lightness(hex_colour):
    """HSL lightness in 0..1, the measure Quickshell themes use to tell dark from light."""
    channels = _channels(hex_colour)
    return (max(channels) + min(channels)) / 510


def is_dark(hex_colour):
    return lightness(hex_colour) < 0.5


def mix(a, b, t):
    """Linear sRGB-space blend from a (t=0) to b (t=1)."""
    ca, cb = _channels(a), _channels(b)
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ca, cb))


def infer_mode(roles):
    base = roles.get("surface") or roles.get("background")
    return None if base is None else ("dark" if is_dark(base) else "light")
