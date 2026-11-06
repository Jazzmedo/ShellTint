import unittest

from shelltint import userstyles


def index_with(searxng_matchers):
    return {
        "format": 1,
        "styles": [
            {"id": "searxng", "blocks": [{"hash": "a" * 64, "matchers": searxng_matchers}]},
            {"id": "homepage", "blocks": [{"hash": "b" * 64, "matchers": [{"t": "domain", "v": "homepage.example.com"}]}]},
        ],
    }


class SiteInstances(unittest.TestCase):
    settings = {"siteInstances": {
        "searxng": ["searxng.home.local", "searxng.home.internal"],
        "homepage": ["homepage.home.internal"],
    }}

    def test_parse_site_list_grammar(self):
        parsed = userstyles.parse_site_list(
            ["searxng.home.internal", "https://search.example.com/searx/", "# comment", "", "SEARXNG.Home.Internal"])
        self.assertEqual(parsed, [
            {"t": "domain", "v": "searxng.home.internal"},
            {"t": "url-prefix", "v": "https://search.example.com/searx"},
        ])

    def test_instances_merge_into_the_index_and_dedupe(self):
        index = index_with([{"t": "domain", "v": "search.inetol.net"}])
        merged = userstyles.with_site_instances(index, self.settings)
        searxng = merged["styles"][0]["blocks"][0]["matchers"]
        self.assertIn({"t": "domain", "v": "searxng.home.internal"}, searxng)
        self.assertIn({"t": "domain", "v": "search.inetol.net"}, searxng)
        homepage = merged["styles"][1]["blocks"][0]["matchers"]
        self.assertIn({"t": "domain", "v": "homepage.home.internal"}, homepage)
        # idempotent: merging again changes nothing
        self.assertEqual(userstyles.with_site_instances(merged, self.settings), merged)

    def test_empty_settings_leave_the_index_alone(self):
        index = index_with([])
        self.assertEqual(userstyles.with_site_instances(index, {}), index)
        self.assertEqual(userstyles.with_site_instances(None, self.settings), None)


if __name__ == "__main__":
    unittest.main()
