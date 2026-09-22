import io
import json
import struct
import unittest
from unittest import mock

from helpers import TempHome
from shelltint import jobs, paths, settings, userstyles
from shelltint.host import Host
from shelltint.protocol import EOF, INVALID, MAX_MESSAGE_BYTES, Channel, encode, read_message, split_for_message
from shelltint.watcher import Debouncer


class FakeChannel:
    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)
        return True

    def of(self, kind):
        return [m for m in self.sent if m.get("type") == kind]


class Protocol(unittest.TestCase):
    def test_round_trip_and_eof(self):
        stream = io.BytesIO(encode({"type": "ST_SYNC"}) + struct.pack("=I", 3) + b"{x}")
        self.assertEqual(read_message(stream), {"type": "ST_SYNC"})
        self.assertIs(read_message(stream), INVALID)
        self.assertIs(read_message(stream), EOF)

    def test_oversized_messages_are_refused(self):
        out = io.BytesIO()
        channel = Channel(out, log=lambda _: None)
        self.assertFalse(channel.send({"type": "X", "css": "a" * MAX_MESSAGE_BYTES}))
        self.assertEqual(out.getvalue(), b"")
        self.assertTrue(channel.send({"type": "X"}))

    def test_split_for_message_respects_limit(self):
        text = ('"\\\n' * 5000) + "é" * 3000
        pieces = split_for_message(text, 4096)
        self.assertEqual("".join(pieces), text)
        self.assertTrue(all(len(json.dumps(p)) <= 4096 for p in pieces))
        self.assertEqual(split_for_message("", 10), [""])


class Userstyles(TempHome):
    def make_generation(self, gen, blocks):
        root = paths.userstyles_dir()
        (root / f"gen-{gen}" / "blocks").mkdir(parents=True)
        for block_hash, css in blocks.items():
            (root / f"gen-{gen}" / "blocks" / f"{block_hash}.css").write_text(css)
        (root / f"gen-{gen}" / "index.json").write_text(json.dumps({"format": 1, "gen": gen, "styles": []}))
        link = root / "current"
        if link.is_symlink():
            link.unlink()
        link.symlink_to(f"gen-{gen}")
        return root

    def test_find_block_rejects_traversal_and_falls_back_to_old_generations(self):
        old, new = "a" * 64, "b" * 64
        self.make_generation("1-1", {old: "old{}"})
        root = self.make_generation("2-2", {new: "new{}"})
        self.assertEqual(userstyles.find_block(root, new).read_text(), "new{}")
        self.assertEqual(userstyles.find_block(root, old).read_text(), "old{}")
        for bad in ("../../etc/passwd", "a" * 8, "A" * 64, None, "g" * 64):
            self.assertIsNone(userstyles.find_block(root, bad))

    def test_site_css_chunks_stay_under_the_limit(self):
        big, small = "c" * 64, "d" * 64
        root = self.make_generation("3-3", {big: "x{color:red}" * 200000, small: "y{}"})
        messages = list(userstyles.site_css_messages(root, 7, [big, small, "e" * 64, "../x"]))
        self.assertTrue(messages[-1]["final"])
        self.assertEqual(messages[-1]["missing"], ["e" * 64])
        self.assertTrue(all(len(encode(m)) < MAX_MESSAGE_BYTES for m in messages))
        parts = [i for m in messages for i in m["items"] if i["hash"] == big]
        self.assertEqual("".join(p["css"] for p in sorted(parts, key=lambda p: p["part"])), "x{color:red}" * 200000)
        self.assertEqual(userstyles.load_index(userstyles.index_key(root))["gen"], "3-3")

    def test_styles_for_blocks_finds_the_styles_that_own_missing_blocks(self):
        index = {"styles": [
            {"id": "homepage", "blocks": [{"hash": "a" * 64}, {"hash": "b" * 64}]},
            {"id": "reddit", "blocks": [{"hash": "c" * 64}]},
            {"id": "broken"},
            "not a style",
        ]}
        self.assertEqual(userstyles.styles_for_blocks(index, ["b" * 64]), ["homepage"])
        self.assertEqual(userstyles.styles_for_blocks(index, ["a" * 64, "c" * 64]), ["homepage", "reddit"])
        self.assertEqual(userstyles.styles_for_blocks(index, ["z" * 64]), [])
        self.assertEqual(userstyles.styles_for_blocks(None, ["a" * 64]), [])


class Watcher(unittest.TestCase):
    def test_debounce_waits_for_quiet_and_caps_bursts(self):
        d = Debouncer(quiet=0.75, ceiling=5)
        self.assertFalse(d.poll("a", 0))
        self.assertFalse(d.poll("b", 1))
        self.assertFalse(d.poll("b", 1.5))
        self.assertTrue(d.poll("b", 1.8))
        self.assertFalse(d.poll("b", 3))
        # Changes every 0.5 s never go quiet, so only the 5 s ceiling can fire.
        fired = [d.poll(f"burst{i}", 10 + i * 0.5) for i in range(12)]
        self.assertEqual(fired.index(True), 10)


class Settings(TempHome):
    def test_normalise_whitelists_and_mirror_round_trips(self):
        clean = settings.normalise({"paletteSource": "nope", "mode": "light", "toolbarTheming": "yes",
                                    "disabledSites": ["YouTube.com", 3, "youtube.com", " "], "evil": 1})
        self.assertEqual(clean["paletteSource"], "auto")
        self.assertEqual(clean["mode"], "light")
        self.assertTrue(clean["toolbarTheming"])
        self.assertEqual(clean["disabledSites"], ["youtube.com"])
        self.assertNotIn("evil", clean)
        self.assertTrue(settings.save_mirror(clean))
        self.assertFalse(settings.save_mirror(clean))
        self.assertEqual(settings.load_mirror(), clean)

    def test_self_hosted_instances_migrate_from_the_searxng_only_setting(self):
        legacy = settings.normalise({"searxngInstances": ["searxng.home.internal", 3, " "]})
        self.assertEqual(legacy["siteInstances"], {"searxng": ["searxng.home.internal"]})
        self.assertNotIn("searxngInstances", legacy)

        fresh = settings.normalise({"siteInstances": {"homepage": ["homepage.home.internal"], "evil": ["x"]}})
        self.assertEqual(fresh["siteInstances"], {"homepage": ["homepage.home.internal"]})

        # The new shape wins once it has been written.
        both = settings.normalise({"searxngInstances": ["old.example"],
                                   "siteInstances": {"searxng": ["new.example"]}})
        self.assertEqual(both["siteInstances"], {"searxng": ["new.example"]})
        self.assertEqual(settings.normalise({})["siteInstances"], {})

    def test_matches_extension_defaults(self):
        text = (paths.install_dir() / "extension" / "shared" / "defaults.js").read_text()
        for key in settings.DEFAULTS:
            self.assertIn(f"{key}:", text)


class HostMessages(TempHome):
    def setUp(self):
        super().setUp()
        self.spawned = []
        patcher = mock.patch.object(jobs, "spawn", side_effect=lambda name, *a, **k: self.spawned.append((name, a)) or True)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.channel = FakeChannel()
        self.host = Host(self.channel, stdin=io.BytesIO())

    def test_settings_resolve_palette_mirror_and_start_updater_once(self):
        self.install_dms()
        self.host.handle({"type": "ST_SETTINGS", "settings": {"mode": "follow"}})
        self.assertEqual(self.channel.of("ST_PALETTE")[-1]["palette"]["source"]["id"], "dms")
        self.assertTrue(paths.palette_file().is_file())
        self.assertTrue(paths.settings_file().is_file())
        self.assertIn(("update.sh", ()), self.spawned)

        self.host.handle({"type": "ST_SETTINGS", "settings": {"mode": "dark"}})
        self.assertEqual(self.channel.of("ST_PALETTE")[-1]["palette"]["mode"], "dark")
        self.assertEqual([s for s in self.spawned if s[0] == "update.sh"], [("update.sh", ())])
        self.assertIn(("rebuild.sh", ()), self.spawned)

    def test_palette_error_keeps_last_good(self):
        self.install_dms()
        self.host.handle({"type": "ST_SETTINGS", "settings": {}})
        good = self.channel.of("ST_PALETTE")[-1]["palette"]
        self.host.handle({"type": "ST_SETTINGS", "settings": {"paletteSource": "caelestia"}})
        last = self.channel.of("ST_PALETTE")[-1]
        self.assertIn("not found", last["error"])
        self.assertEqual(last["lastGood"]["hash"], good["hash"])

    def test_watcher_picks_up_a_mode_change(self):
        session = self.install_dms()
        self.host.handle({"type": "ST_SETTINGS", "settings": {}})
        self.host.tick(100)
        session.write_text(json.dumps({"isLightMode": False}))
        self.host.tick(101)
        self.host.tick(102)
        self.assertEqual(self.channel.of("ST_PALETTE")[-1]["palette"]["mode"], "dark")

    def test_actions_reply_with_their_request_id(self):
        self.install_dms()
        self.host.handle({"type": "ST_DETECT_SOURCES", "reqId": 4})
        self.assertEqual(self.channel.of("ST_SOURCES")[-1]["reqId"], 4)
        self.host.handle({"type": "ST_REBUILD", "reqId": 5, "force": True})
        self.assertEqual(self.channel.of("ST_ACTION_RESULT")[-1], {"type": "ST_ACTION_RESULT", "reqId": 5, "ok": True, "error": None})
        self.assertIn(("rebuild.sh", ("--force",)), self.spawned)
        self.host.handle({"type": "ST_CHECK_UPDATES", "reqId": 6})
        self.assertIn(("update.sh", ("--now",)), self.spawned)
        self.host.handle({"type": "NOPE"})
        self.assertEqual(self.channel.of("ST_ERROR")[-1]["reason"], "unknown-message")

    def test_a_missing_block_is_compiled_once_per_generation(self):
        root = paths.userstyles_dir() / "gen-9-9"
        (root / "blocks").mkdir(parents=True)
        index = {"format": 1, "gen": "9-9", "styles": [
            {"id": "homepage", "blocks": [{"hash": "a" * 64, "pending": True}]},
        ]}
        (root / "index.json").write_text(json.dumps(index))
        (paths.userstyles_dir() / "current").symlink_to("gen-9-9")

        self.host.handle({"type": "ST_GET_SITE_CSS", "reqId": 8, "hashes": ["a" * 64]})
        self.assertEqual(self.channel.of("ST_SITE_CSS")[-1]["missing"], ["a" * 64])
        self.assertIn(("compile.sh", ("homepage",)), self.spawned)

        # Asking again must not queue the same build twice.
        self.spawned.clear()
        self.host.handle({"type": "ST_GET_SITE_CSS", "reqId": 9, "hashes": ["a" * 64]})
        self.assertEqual(self.spawned, [])

    def test_hello_carries_mirror_and_paths(self):
        settings.save_mirror({"paletteSource": "end4"})
        self.host.hello()
        hello = self.channel.of("ST_HELLO")[-1]
        self.assertEqual(hello["protocol"], 1)
        self.assertEqual(hello["settingsMirror"]["paletteSource"], "end4")
        self.assertTrue(hello["paths"]["log"].endswith("build.log"))


class Jobs(TempHome):
    def test_state_records(self):
        jobs.update_state({"building": True})
        self.assertTrue(jobs.read_state()["building"])
        state = jobs.record_build(0)
        self.assertEqual((state["building"], state["lastBuild"]["ok"]), (False, True))
        self.assertEqual(jobs.record_update_check("bogus")["lastUpdateCheck"]["result"], "failed")


if __name__ == "__main__":
    unittest.main()
