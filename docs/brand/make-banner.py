#!/usr/bin/python3
"""Draw docs/brand/banner.svg for the README: the logo, the name and what
ShellTint does, in the Dusk Wallpaper palette (docs/brand/palette.md).

Text is turned into outlines (Pango lays them out, cairo writes paths), so the
banner looks the same on every computer without the fonts installed.
Needs: the Poppins font, PyGObject with Pango and Rsvg.
Run: docs/brand/make-banner.py"""

import os

import cairo
import gi

gi.require_version("Pango", "1.0")
gi.require_version("PangoCairo", "1.0")
gi.require_version("Rsvg", "2.0")
from gi.repository import Pango, PangoCairo, Rsvg  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, RADIUS = 1280, 340, 28
LOGO = os.path.join(HERE, "..", "..", "extension", "icons", "icon.svg")
OUT = os.path.join(HERE, "banner.svg")


def hex_rgb(value):
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))


# The palette, see palette.md. MUTED is Paper Cream at 62% on Shell Ink.
INK = hex_rgb("#15131c")
VIOLET = hex_rgb("#6a4fd8")
LILAC = hex_rgb("#b8a4f4")
PEACH = hex_rgb("#f2a68a")
CREAM = hex_rgb("#fbebd8")
MUTED = tuple(c * 0.62 + i * 0.38 for c, i in zip(CREAM, INK))


def rounded_rect(cr, x, y, w, h, r):
    cr.new_sub_path()
    cr.arc(x + w - r, y + r, r, -1.5708, 0)
    cr.arc(x + w - r, y + h - r, r, 0, 1.5708)
    cr.arc(x + r, y + h - r, r, 1.5708, 3.1416)
    cr.arc(x + r, y + r, r, 3.1416, 4.7124)
    cr.close_path()


def text(cr, x, y, value, font, rgb):
    layout = PangoCairo.create_layout(cr)
    layout.set_font_description(Pango.FontDescription.from_string(font))
    layout.set_text(value, -1)
    cr.move_to(x, y)
    cr.set_source_rgb(*rgb)
    PangoCairo.layout_path(cr, layout)  # outlines, not <text>
    cr.fill()
    _ink, logical = layout.get_pixel_extents()
    return logical.width, logical.height


# --- feature icons, drawn in a 20 x 20 box at (x, y)

def _icon_toolbar(cr, x, y):
    # a window whose toolbar is painted
    rounded_rect(cr, x + 1, y + 2, 18, 16, 2.5)
    cr.stroke()
    rounded_rect(cr, x + 1, y + 2, 18, 5.5, 2.5)
    cr.fill()


def _icon_web(cr, x, y):
    cr.arc(x + 10, y + 10, 8.5, 0, 6.2832)
    cr.stroke()
    cr.save()
    cr.translate(x + 10, y + 10)
    cr.scale(0.45, 1)
    cr.arc(0, 0, 8.5, 0, 6.2832)
    cr.restore()
    cr.move_to(x + 1.5, y + 10)
    cr.line_to(x + 18.5, y + 10)
    cr.stroke()


def _icon_shell(cr, x, y):
    # three growing dots, like a row of the logo
    for cx, r in ((3, 2.2), (9, 3), (16, 4)):
        cr.arc(x + cx, y + 10, r, 0, 6.2832)
        cr.fill()


def _icon_theme(cr, x, y):
    # a half-filled circle: light and dark
    cr.arc(x + 10, y + 10, 8.5, 0, 6.2832)
    cr.stroke()
    cr.arc(x + 10, y + 10, 8.5, 1.5708, 4.7124)
    cr.close_path()
    cr.fill()


def _icon_css(cr, x, y):
    # </> : your own code
    cr.move_to(x + 6, y + 4.5)
    cr.line_to(x + 1, y + 10)
    cr.line_to(x + 6, y + 15.5)
    cr.move_to(x + 14, y + 4.5)
    cr.line_to(x + 19, y + 10)
    cr.line_to(x + 14, y + 15.5)
    cr.move_to(x + 11.5, y + 3)
    cr.line_to(x + 8.5, y + 17)
    cr.stroke()


def _icon_backup(cr, x, y):
    # a box with a lid: everything packed in one file
    rounded_rect(cr, x + 1.5, y + 2.5, 17, 5, 1.5)
    cr.stroke()
    rounded_rect(cr, x + 3, y + 7.5, 14, 11, 2)
    cr.stroke()
    cr.move_to(x + 7.5, y + 11.5)
    cr.line_to(x + 12.5, y + 11.5)
    cr.stroke()


def _icon_private(cr, x, y):
    cr.arc(x + 10, y + 7.5, 4.5, 3.1416, 0)
    cr.move_to(x + 5.5, y + 7.5)
    cr.line_to(x + 5.5, y + 9)
    cr.move_to(x + 14.5, y + 7.5)
    cr.line_to(x + 14.5, y + 9)
    cr.stroke()
    rounded_rect(cr, x + 2.5, y + 9, 15, 11, 2.5)
    cr.fill()


FEATURES = [
    [("Toolbar & tabs", _icon_toolbar), ("Catppuccin site styles", _icon_web),
     ("Follows your shell's theme", _icon_shell)],
    [("Light & dark", _icon_theme), ("Your own CSS", _icon_css),
     ("Backup & restore", _icon_backup), ("No data collected", _icon_private)],
]


def feature(cr, x, y, label, icon):
    """An icon in the accent colour and its label; returns the width used."""
    cr.set_source_rgb(*LILAC)
    cr.set_line_width(1.8)
    cr.set_line_cap(cairo.LINE_CAP_ROUND)
    cr.set_line_join(cairo.LINE_JOIN_ROUND)
    icon(cr, x, y + 3)
    layout = PangoCairo.create_layout(cr)
    layout.set_font_description(Pango.FontDescription.from_string("Poppins 19px"))
    layout.set_text(label, -1)
    _ink, logical = layout.get_pixel_extents()
    cr.move_to(x + 30, y + 13 - logical.height / 2)
    cr.set_source_rgb(*CREAM)
    PangoCairo.layout_path(cr, layout)
    cr.fill()
    return 30 + logical.width


def main():
    surface = cairo.SVGSurface(OUT, W, H)
    surface.set_document_unit(cairo.SVGUnit.PX)
    cr = cairo.Context(surface)

    rounded_rect(cr, 0, 0, W, H, RADIUS)
    cr.set_source_rgb(*INK)
    cr.fill_preserve()
    cr.clip()

    # logo, as vectors
    cy = H / 2
    logo = Rsvg.Handle.new_from_file(LOGO)
    viewport = Rsvg.Rectangle()
    viewport.x, viewport.y, viewport.width, viewport.height = 55, cy - 130, 260, 260
    logo.render_document(cr, viewport)

    # name, with "Tint" in the warm accent, and tagline
    x = 372
    width, _ = text(cr, x, 30, "Shell", "Poppins SemiBold 76px", CREAM)
    text(cr, x + width, 30, "Tint", "Poppins SemiBold 76px", PEACH)
    text(cr, x + 4, 140, "Your desktop shell's colours, on Firefox and 130+ websites.",
         "Poppins 25px", MUTED)

    # what it does: two quiet rows, no boxes
    y = 204
    for row in FEATURES:
        cx = x + 4
        for label, icon in row:
            cx += feature(cr, cx, y, label, icon) + 34
        y += 46

    surface.finish()
    print(OUT)


if __name__ == "__main__":
    main()
