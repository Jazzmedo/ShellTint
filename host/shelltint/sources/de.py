"""Desktop-environment colour helpers, ported from the tested PhotoCraft
adapters (fedora-nothing/config/theming/photocraft/bin).

GNOME and KDE expose exactly one identity colour — the user's accent — and no
Material palette. The accent engine below rebuilds the palette the way GNOME
and KDE apps actually look: neutral surfaces barely tinted with the accent,
plus the accent itself for identity colours.
"""

from .. import colors

# GNOME 47+'s nine named accents (org.gnome.desktop.interface accent-color).
GNOME_ACCENTS = {
    "blue": "#3584e4", "teal": "#2190a4", "green": "#3a944a", "yellow": "#c88800",
    "orange": "#ed5b00", "red": "#e62d42", "pink": "#d56199", "purple": "#9141ac",
    "slate": "#6f8396",
}

# Per-mode neutral anchors the accent tints (dark and light desktop defaults).
ANCHORS = {
    "dark": {"bg": (27, 27, 31), "fg": (242, 242, 245)},
    "light": {"bg": (250, 250, 251), "fg": (36, 36, 40)},
}


def parse_de_color(value):
    """'#aabbcc' or 'r,g,b' (Plasma style) as '#rrggbb'; else None."""
    if not isinstance(value, str):
        return None
    text = value.strip().strip("'\"")
    hexed = colors.parse_color(text)
    if hexed:
        return hexed
    parts = text.split(",")
    if len(parts) == 3:
        try:
            channels = [int(p.strip()) for p in parts]
        except ValueError:
            return None
        if all(0 <= c <= 255 for c in channels):
            return "#" + "".join(f"{c:02x}" for c in channels)
    return None


def accent_engine(accent, mode):
    """A desktop palette from one accent colour: dark or light."""
    dark = mode != "light"
    anchor = ANCHORS["dark" if dark else "light"]
    a = colors.parse_color(accent) or "#3584e4"
    a_rgb = [int(a[i:i + 2], 16) for i in (1, 3, 5)]

    def tinted(name, t):
        base = anchor[name]
        blended = [round(b + (x - b) * t) for b, x in zip(base, a_rgb)]
        return "#" + "".join(f"{c:02x}" for c in blended)

    bg = tinted("bg", 0.05)
    fg = tinted("fg", 0.08)

    def step(t):
        return colors.mix(bg, fg, t)

    roles = {
        "background": bg,
        "surface": bg,
        "on_background": fg,
        "on_surface": fg,
        "surface_variant": step(0.55),
        "primary": a,
        "on_primary": colors.on_color(a),
        "secondary": colors.mix(a, fg, 0.25),
        "tertiary": colors.mix(a, "#c061cb" if dark else "#9141ac", 0.4),
        "error": "#ff7b72" if dark else "#c01c28",
        "on_error": "#000000" if dark else "#ffffff",
        "outline": step(0.45),
    }
    return roles
