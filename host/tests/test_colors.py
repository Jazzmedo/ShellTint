import unittest

from helpers import HOST  # noqa: F401  (puts the host package on sys.path)
from shelltint import colors


class ParseColor(unittest.TestCase):
    def test_accepted_forms(self):
        self.assertEqual(colors.parse_color("#A8B665"), "#a8b665")
        self.assertEqual(colors.parse_color("a8b665"), "#a8b665")
        self.assertEqual(colors.parse_color("#abc"), "#aabbcc")
        self.assertEqual(colors.parse_color("#a8b665cc"), "#a8b665")
        self.assertEqual(colors.parse_color("rgb(88, 100, 32)"), "#586420")
        self.assertEqual(colors.parse_color("rgba(88 100 32 / 50%)"), "#586420")

    def test_rejected_forms(self):
        for value in ("abc", "red", "rgb(300, 0, 0)", "", None, 12, "'Inter'", "#12345"):
            self.assertIsNone(colors.parse_color(value), value)


class RoleNames(unittest.TestCase):
    def test_prefixes_and_case(self):
        cases = {
            "--mg-on-primary": "on_primary",
            "--primary": "primary",
            "--md-sys-color-surface-container-high": "surface_container_high",
            "mOnSurfaceVariant": "on_surface_variant",
            "onPrimaryContainer": "on_primary_container",
            "surface_container": "surface_container",
            "m3primary": "primary",
            "mauve": "mauve",
        }
        for key, expected in cases.items():
            self.assertEqual(colors.role_name(key), expected, key)

    def test_normalise_keeps_known_roles_only(self):
        roles = colors.normalise_roles({"--mg-primary": "#a8b665", "--mg-font": "Inter", "term1": "b3261e",
                                        "primary_paletteKeyColor": "7e8a4f", "mSurface": "#070722"})
        self.assertEqual(roles, {"primary": "#a8b665", "surface": "#070722"})

    def test_missing_roles(self):
        self.assertEqual(colors.missing_roles({}), ["primary", "surface", "on_surface"])
        self.assertEqual(colors.missing_roles({"primary": "#000000", "background": "#000000", "on_background": "#ffffff"}), [])


class Lightness(unittest.TestCase):
    def test_mode_inference_and_mix(self):
        self.assertEqual(colors.infer_mode({"surface": "#1d2021"}), "dark")
        self.assertEqual(colors.infer_mode({"background": "#fbf8f2"}), "light")
        self.assertIsNone(colors.infer_mode({}))
        self.assertEqual(colors.mix("#000000", "#ffffff", 0.5), "#808080")


if __name__ == "__main__":
    unittest.main()
