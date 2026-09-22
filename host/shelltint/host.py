"""The native messaging host the ShellTint extension talks to."""

import sys
import threading
import time
import traceback

from . import PROTOCOL, VERSION, jobs, palette, paths, settings as settings_mod, userstyles
from .protocol import EOF, INVALID, Channel, read_message
from .sources import AUTO_ORDER, REGISTRY, SourceError
from .watcher import Debouncer, signature

TICK = 0.25
INDEX_EVERY = 1.0
# Styles compiled per request, and never more than once each per generation:
# a style that cannot compile must not be retried on every page load.
MAX_ON_DEMAND = 12


def log(text):
    print(text, file=sys.stderr, flush=True)


class Host:
    def __init__(self, channel, stdin=None):
        self.channel = channel
        self.stdin = stdin or sys.stdin.buffer
        self.lock = threading.RLock()
        self.running = True
        self.settings = settings_mod.load_mirror() or settings_mod.normalise({})
        self.have_extension_settings = False
        self.palette = palette.load()
        self.palette_error = None
        self.debouncer = Debouncer()
        self.index_key = None
        self.compiling = set()
        self.compiling_gen = None
        self.state_sig = None
        self.updater_started = False
        self.last_index_poll = 0.0

    # ─── Outgoing ───
    def send(self, message):
        return self.channel.send(message)

    def hello(self):
        self.send({
            "type": "ST_HELLO",
            "hostVersion": VERSION,
            "protocol": PROTOCOL,
            "settingsMirror": settings_mod.load_mirror(),
            "paths": {
                "install": str(paths.install_dir()),
                "cache": str(paths.cache_dir()),
                "config": str(paths.config_dir()),
                "log": str(paths.build_log()),
            },
        })

    def send_palette(self):
        if self.palette_error:
            self.send({"type": "ST_PALETTE", "error": self.palette_error, "lastGood": self.palette})
        elif self.palette:
            self.send({"type": "ST_PALETTE", "palette": self.palette})

    def send_index(self, index):
        if index is not None and not userstyles.fits_in_message(index):
            self.send({"type": "ST_ERROR", "reason": "index-too-large", "detail": "the styles index exceeds 1 MB"})
            return
        self.send({"type": "ST_STYLES_INDEX", "index": index})

    def send_status(self):
        self.send({"type": "ST_STATUS", **jobs.read_state()})

    # ─── Palette ───
    def watch_paths(self):
        chosen = self.settings.get("paletteSource", "auto")
        ids = AUTO_ORDER if chosen == "auto" else [chosen]
        out = []
        for source_id in ids:
            source = REGISTRY.get(source_id)
            if source:
                out.extend(source.watch_paths(self.settings))
        return paths.unique(out)

    def refresh_palette(self, rebuild=True, force_send=False):
        """Resolves colours; on a change writes palette.json, tells the extension, and rebuilds."""
        with self.lock:
            try:
                resolved = palette.resolve(self.settings)
            except SourceError as e:
                changed = self.palette_error != str(e)
                self.palette_error = str(e)
                if changed or force_send:
                    self.send_palette()
                return False
            changed = self.palette_error is not None or not self.palette or self.palette.get("hash") != resolved["hash"] \
                or self.palette.get("warnings") != resolved["warnings"]
            self.palette_error = None
            try:
                palette.write(resolved)
            except OSError as e:
                log(f"ShellTint: cannot write the palette: {e}")
            if changed:
                self.palette = resolved
            if changed or force_send:
                self.send_palette()
            if changed and rebuild and self.settings.get("websiteStyling"):
                jobs.spawn("rebuild.sh", log=log)
            return changed

    # ─── Incoming ───
    def handle(self, message):
        kind = message.get("type")
        req_id = message.get("reqId")

        if kind == "ST_SETTINGS":
            incoming = settings_mod.normalise(message.get("settings"))
            with self.lock:
                before = self.settings
                self.settings = incoming
                first = not self.have_extension_settings
                self.have_extension_settings = True
            try:
                settings_mod.save_mirror(incoming)
            except OSError as e:
                log(f"ShellTint: cannot save settings: {e}")
            palette_changed = any(before.get(k) != incoming.get(k) for k in settings_mod.PALETTE_KEYS)
            if palette_changed or first:
                self.debouncer.reset(signature(self.watch_paths()))
                self.refresh_palette(force_send=palette_changed)
            if incoming["websiteStyling"]:
                self.ensure_styles()

        elif kind == "ST_SYNC":
            self.send_palette()
            self.send_index(userstyles.load_index(userstyles.index_key(paths.userstyles_dir())))
            self.send_status()

        elif kind == "ST_GET_SITE_CSS":
            hashes = message.get("hashes")
            if isinstance(req_id, int) and isinstance(hashes, list):
                missing = []
                for reply in userstyles.site_css_messages(paths.userstyles_dir(), req_id, hashes):
                    self.send(reply)
                    missing = reply.get("missing") or missing
                if missing:
                    self.compile_on_demand(missing)

        elif kind == "ST_DETECT_SOURCES":
            result = palette.detect(self.settings)
            self.send({"type": "ST_SOURCES", "reqId": req_id, **result})

        elif kind == "ST_REBUILD":
            self.refresh_palette(rebuild=False)
            if self.palette_error:
                self.send({"type": "ST_ACTION_RESULT", "reqId": req_id, "ok": False, "error": self.palette_error})
            else:
                ok = jobs.spawn("rebuild.sh", *(["--force"] if message.get("force") else []), log=log)
                self.send({"type": "ST_ACTION_RESULT", "reqId": req_id, "ok": ok,
                           "error": None if ok else "the builder scripts are missing; reinstall the helper"})

        elif kind == "ST_CHECK_UPDATES":
            ok = jobs.spawn("update.sh", "--now", log=log)
            self.send({"type": "ST_ACTION_RESULT", "reqId": req_id, "ok": ok,
                       "error": None if ok else "the builder scripts are missing; reinstall the helper"})

        else:
            self.send({"type": "ST_ERROR", "reason": "unknown-message", "detail": str(kind)[:100]})

    def compile_on_demand(self, hashes):
        """Build the CSS for blocks a page asked for that were only indexed.

        The builder leaves most styles uncompiled so a theme change costs a
        second rather than eight; this fills one in the first time it is
        needed. The page it was meant for stays unstyled until the build lands,
        at which point the new index revision refreshes it.
        """
        index = userstyles.load_index(userstyles.index_key(paths.userstyles_dir()))
        wanted = userstyles.styles_for_blocks(index, hashes)
        gen = index.get("gen") if isinstance(index, dict) else None
        with self.lock:
            if gen != self.compiling_gen:
                self.compiling_gen = gen
                self.compiling = set()
            fresh = [i for i in wanted if i not in self.compiling][:MAX_ON_DEMAND]
            if not fresh:
                return
            self.compiling.update(fresh)
        if not jobs.spawn("compile.sh", ",".join(fresh), log=log):
            with self.lock:
                self.compiling.difference_update(fresh)

    def ensure_styles(self):
        """Once per browser session: look for new Catppuccin styles, or build if nothing is built."""
        with self.lock:
            if self.updater_started or self.palette_error:
                return
            self.updater_started = True
        if self.settings.get("autoCheckUpdates"):
            jobs.spawn("update.sh", log=log)
        elif userstyles.index_key(paths.userstyles_dir()) is None:
            jobs.spawn("rebuild.sh", log=log)

    def read_loop(self):
        invalid = 0
        while self.running:
            message = read_message(self.stdin)
            if message is EOF:
                self.running = False
                break
            if message is INVALID:
                invalid += 1
                if invalid > 10:
                    self.running = False
                continue
            invalid = 0
            try:
                self.handle(message)
            except Exception as e:  # keep serving the other requests
                log(f"ShellTint: error handling {message.get('type')}: {e}")
                traceback.print_exc(file=sys.stderr)
                self.send({"type": "ST_ERROR", "reason": "handler", "detail": str(e)[:300]})

    # ─── Polling ───
    def tick(self, now):
        if self.have_extension_settings and self.debouncer.poll(signature(self.watch_paths()), now):
            self.refresh_palette()
        if now - self.last_index_poll >= INDEX_EVERY:
            self.last_index_poll = now
            key = userstyles.index_key(paths.userstyles_dir())
            if key != self.index_key:
                index = userstyles.load_index(key)
                if index is not None or key is None:
                    self.index_key = key
                    self.send_index(index)
            state_sig = signature([paths.state_file()])
            if state_sig != self.state_sig:
                self.state_sig = state_sig
                self.send_status()

    def run(self):
        self.hello()
        threading.Thread(target=self.read_loop, daemon=True).start()
        while self.running:
            try:
                self.tick(time.monotonic())
            except Exception as e:
                log(f"ShellTint: error while polling: {e}")
                time.sleep(2)
            time.sleep(TICK)
        return 0


def main():
    return Host(Channel()).run()
