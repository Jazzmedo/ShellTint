import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HOST = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(HOST))


class TempHome(unittest.TestCase):
    """Runs each test with an empty HOME and no XDG overrides."""

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="shelltint-test-")
        self.home = Path(self._tmp)
        self._env = {k: os.environ.get(k) for k in
                     ("HOME", "XDG_STATE_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "SHELLTINT_CACHE", "NOCTALIA_CONFIG_DIR")}
        for key in self._env:
            os.environ.pop(key, None)
        os.environ["HOME"] = self._tmp

    def tearDown(self):
        for key, value in self._env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        shutil.rmtree(self._tmp, ignore_errors=True)

    def place(self, fixture, relative):
        target = self.home / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURES / fixture, target)
        return target

    def install_dms(self):
        self.place("dms/dms-colors.json", ".cache/DankMaterialShell/dms-colors.json")
        return self.place("dms/session.json", ".local/state/DankMaterialShell/session.json")
