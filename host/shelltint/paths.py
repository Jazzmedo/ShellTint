"""Filesystem locations. Evaluated on each call so tests can swap HOME."""

import os
from pathlib import Path


def home():
    return Path(os.path.expanduser("~"))


def _xdg(var, default):
    value = os.environ.get(var, "")
    return Path(value) if os.path.isabs(value) else home() / default


def state_home():
    return _xdg("XDG_STATE_HOME", ".local/state")


def config_home():
    return _xdg("XDG_CONFIG_HOME", ".config")


def cache_home():
    return _xdg("XDG_CACHE_HOME", ".cache")


def cache_dir():
    override = os.environ.get("SHELLTINT_CACHE", "")
    return Path(override) if os.path.isabs(override) else cache_home() / "shelltint"


def config_dir():
    return config_home() / "shelltint"


def install_dir():
    """The folder holding host/ and builder/, in the repository or the installed copy."""
    return Path(__file__).resolve().parents[2]


def palette_file():
    return cache_dir() / "palette.json"


def settings_file():
    return config_dir() / "settings.json"


def state_file():
    return cache_dir() / "state.json"


def userstyles_dir():
    return cache_dir() / "userstyles"


def build_log():
    return cache_dir() / "build.log"


def expand(path):
    return Path(os.path.expandvars(os.path.expanduser(path)))


def unique(paths):
    seen, out = set(), []
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    try:
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()
