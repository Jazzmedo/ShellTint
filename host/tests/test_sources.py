import json
import os
import re
import time
import unittest

from helpers import FIXTURES, TempHome
from shelltint import colors, palette
from shelltint.sources import AUTO_ORDER, REGISTRY, SourceError

HEX = re.compile(r"^#[0-9a-f]{6}$")
SNAKE = re.compile(r"^[a-z][a-z0-9_]*$")


class Sources(TempHome):
    def check_roles(self, roles):
        self.assertTrue(roles)
        for name, value in roles.items():
            self.assertRegex(name, SNAKE)
            self.assertRegex(value, HEX)
        for required in ("primary", "surface", "on_surface"):
            self.assertIn(required, roles)

    def resolve(self, **settings):
        return palette.resolve({"paletteSource": "auto", "mode": "follow", **settings})

    def test_dms_follows_session_mode_and_keeps_dank16(self):
        session = self.install_dms()
        result = self.resolve()
        self.assertEqual((result["source"]["id"], result["mode"], result["modeSource"]), ("dms", "light", "shell"))
        self.assertEqual(result["roles"]["surface"], "#fbf8f2")
        self.assertEqual(len(result["extras"]["dank16"]), 16)
        self.check_roles(result["roles"])

        session.write_text(json.dumps({"isLightMode": False}))
        dark = self.resolve()
        self.assertEqual(dark["mode"], "dark")
        self.assertNotEqual(dark["hash"], result["hash"])

    def test_caelestia(self):
        self.place("caelestia/scheme.json", ".local/state/caelestia/scheme.json")
        result = self.resolve()
        self.assertEqual((result["source"]["id"], result["mode"]), ("caelestia", "light"))
        self.assertEqual(result["roles"]["primary"], "#586420")
        self.assertEqual(result["roles"]["primary_container"], "#dcea9a")
        self.assertNotIn("primary_palette_key_color", result["roles"])
        self.assertEqual(result["extras"]["dank16"]["color1"], "#b3261e")
        self.check_roles(result["roles"])

    def test_caelestia_honours_xdg_state_home(self):
        os.environ["XDG_STATE_HOME"] = str(self.home / "state")
        self.place("caelestia/scheme.json", "state/caelestia/scheme.json")
        self.assertEqual(self.resolve()["source"]["id"], "caelestia")

    def test_noctalia_v4_derives_missing_roles(self):
        self.place("noctalia/colors.json", ".config/noctalia/colors.json")
        self.place("noctalia/settings.json", ".config/noctalia/settings.json")
        result = self.resolve()
        self.assertEqual((result["source"]["id"], result["mode"], result["modeSource"]), ("noctalia", "dark", "shell"))
        for role in ("background", "primary_container", "surface_container", "surface_container_high", "outline_variant"):
            self.assertIn(role, result["roles"])
        self.assertEqual(result["roles"]["tertiary"], "#9bfece")
        self.assertTrue(any("derived" in w for w in result["warnings"]))
        self.check_roles(result["roles"])

    def test_noctalia_template_file_is_preferred(self):
        self.place("noctalia/colors.json", ".config/noctalia/colors.json")
        self.place("matugen/template.json", ".cache/shelltint/sources/noctalia.json")
        result = self.resolve(paletteSource="noctalia")
        self.assertEqual((result["mode"], result["roles"]["primary"]), ("light", "#586420"))

    def test_end4_infers_mode(self):
        self.place("end4/colors.json", ".local/state/quickshell/user/generated/colors.json")
        result = self.resolve()
        self.assertEqual((result["source"]["id"], result["mode"], result["modeSource"]), ("end4", "dark", "inferred"))
        self.check_roles(result["roles"])

    def test_matugen_css_with_mg_prefix(self):
        # Regression: MatugenFox's toolbar looked for --primary and ignored --mg-primary.
        path = FIXTURES / "matugen" / "mg.css"
        result = self.resolve(paletteSource="matugen", customPalettePath=str(path))
        self.assertEqual(result["roles"], {"on_primary": "#252423", "on_surface": "#ddc7a1", "primary": "#a8b665", "surface": "#32302f"})
        self.assertEqual((result["mode"], result["modeSource"]), ("dark", "inferred"))

    def test_matugen_css_md_sys_color_and_color_scheme(self):
        result = self.resolve(paletteSource="matugen", customPalettePath=str(FIXTURES / "matugen" / "md3.css"))
        self.assertEqual((result["mode"], result["modeSource"], result["roles"]["primary"]), ("light", "shell", "#586420"))

    def test_matugen_json_forms(self):
        template = self.resolve(paletteSource="matugen", customPalettePath=str(FIXTURES / "matugen" / "template.json"))
        self.assertEqual((template["mode"], template["roles"]["secondary"]), ("light", "#5d6146"))
        nested = self.resolve(paletteSource="matugen", customPalettePath=str(FIXTURES / "matugen" / "nested.json"))
        self.assertEqual((nested["mode"], nested["roles"]["primary"]), ("dark", "#a8b665"))
        light = self.resolve(paletteSource="matugen", mode="light", customPalettePath=str(FIXTURES / "matugen" / "nested.json"))
        self.assertEqual((light["mode"], light["modeSource"], light["roles"]["primary"]), ("light", "forced", "#586420"))

    def test_matugen_path_expands_home(self):
        self.place("matugen/mg.css", "themes/mg.css")
        result = self.resolve(paletteSource="matugen", customPalettePath="~/themes/mg.css")
        self.assertEqual(result["source"]["path"], str(self.home / "themes" / "mg.css"))

    def test_broken_file_raises(self):
        with self.assertRaises(SourceError):
            self.resolve(paletteSource="matugen", customPalettePath=str(FIXTURES / "matugen" / "broken.json"))

    def test_forced_mode_on_single_mode_source_warns(self):
        self.place("end4/colors.json", ".local/state/quickshell/user/generated/colors.json")
        result = self.resolve(mode="light")
        self.assertEqual(result["mode"], "light")
        self.assertTrue(any("no light colours" in w for w in result["warnings"]))

    def test_auto_order_and_manual_override(self):
        self.install_dms()
        self.place("caelestia/scheme.json", ".local/state/caelestia/scheme.json")
        self.assertEqual(self.resolve()["source"]["id"], "dms")
        self.assertEqual(self.resolve(paletteSource="caelestia")["source"]["id"], "caelestia")
        with self.assertRaises(SourceError):
            self.resolve(paletteSource="end4")

    def test_auto_skips_a_broken_source(self):
        self.place("matugen/broken.json", ".cache/DankMaterialShell/dms-colors.json")
        self.place("caelestia/scheme.json", ".local/state/caelestia/scheme.json")
        self.assertEqual(self.resolve()["source"]["id"], "caelestia")

    def test_nothing_found(self):
        with self.assertRaisesRegex(SourceError, "no supported shell colours"):
            self.resolve()

    def test_detect_lists_every_source(self):
        self.install_dms()
        result = palette.detect({"paletteSource": "auto"})
        self.assertEqual([r["id"] for r in result["sources"]], AUTO_ORDER)
        self.assertEqual(result["active"], "dms")
        dms = result["sources"][0]
        self.assertTrue(dms["found"] and dms["ok"])
        self.assertFalse(result["sources"][1]["found"])

    def test_write_is_stable_and_atomic(self):
        self.install_dms()
        first = self.resolve()
        self.assertTrue(palette.write(first))
        time.sleep(0.01)
        again = self.resolve()
        self.assertEqual(first["hash"], again["hash"])
        self.assertFalse(palette.write(again))
        stored = palette.load()
        self.assertEqual(stored["hash"], first["hash"])
        self.assertEqual(sorted(p.name for p in (self.home / ".cache/shelltint").iterdir()), ["palette.json"])

    def test_registry_matches_auto_order(self):
        self.assertEqual(sorted(REGISTRY), sorted(AUTO_ORDER))

    # ─── KDE Plasma ───
    def test_kde_accent_and_window_colors(self):
        self.place("kde/kdeglobals", ".config/kdeglobals")
        result = self.resolve()
        self.assertEqual((result["source"]["id"], result["mode"], result["modeSource"]), ("kde", "dark", "shell"))
        self.assertEqual(result["roles"]["primary"], "#7676d3")
        self.assertEqual(result["roles"]["surface"], "#1b1e20")
        self.assertEqual(result["roles"]["on_surface"], "#eff0f1")
        for role in ("primary_container", "surface_container_high", "outline_variant"):
            self.assertIn(role, result["roles"])
        self.assertEqual(result["roles"]["error"], "#ed1515")
        self.check_roles(result["roles"])

    def test_kde_auto_accent_falls_back_to_selection(self):
        self.place("kde/kdeglobals-auto", ".config/kdeglobals")
        result = self.resolve()
        self.assertEqual(result["roles"]["primary"], "#3daee9")
        self.assertEqual(result["mode"], "light")

    # ─── pywal ───
    def test_pywal_anchors_on_wal_colors(self):
        self.place("wal/colors.json", ".cache/wal/colors.json")
        result = self.resolve()
        self.assertEqual((result["source"]["id"], result["mode"], result["modeSource"]), ("pywal", "dark", "inferred"))
        self.assertEqual(result["roles"]["primary"], "#7aa2f7")
        self.assertEqual(result["roles"]["background"], "#1a1b26")
        self.assertEqual(result["roles"]["on_surface"], "#c0caf5")
        self.assertEqual(len(result["extras"]["dank16"]), 16)
        self.check_roles(result["roles"])

    def test_pywal_broken_file_raises(self):
        self.place("matugen/broken.json", ".cache/wal/colors.json")
        with self.assertRaises(SourceError):
            self.resolve()

    # ─── GNOME ───
    def test_gnome_accent_engine_roles(self):
        from shelltint.sources.de import GNOME_ACCENTS, accent_engine
        dark = accent_engine(GNOME_ACCENTS["purple"], "dark")
        self.assertEqual(dark["primary"], "#9141ac")
        self.assertEqual(dark["on_primary"], "#ffffff")
        self.assertLess(int(dark["background"][1:3], 16), 60)   # dark bg
        light = accent_engine(GNOME_ACCENTS["red"], "light")
        self.assertEqual(light["on_primary"], "#ffffff")
        self.assertGreater(int(light["background"][1:3], 16), 200)  # light bg
        self.check_roles(colors.derive_missing(dark, "dark"))

    def test_gnome_parse_reads_gsettings(self):
        import os
        from unittest import mock
        from shelltint.sources import gnome
        old = os.environ.get("XDG_CURRENT_DESKTOP")
        os.environ["XDG_CURRENT_DESKTOP"] = "GNOME:ubuntu"
        try:
            with mock.patch.object(gnome, "gsettings_get",
                                   side_effect=["purple", "prefer-dark"]):
                result = self.resolve(paletteSource="gnome", mode="follow")
        finally:
            if old is None:
                os.environ.pop("XDG_CURRENT_DESKTOP", None)
            else:
                os.environ["XDG_CURRENT_DESKTOP"] = old
        self.assertEqual((result["source"]["id"], result["mode"], result["modeSource"]), ("gnome", "dark", "shell"))
        self.assertEqual(result["roles"]["primary"], "#9141ac")
        self.assertTrue(any("derived" in w for w in result["warnings"]))
        self.check_roles(result["roles"])


if __name__ == "__main__":
    unittest.main()
