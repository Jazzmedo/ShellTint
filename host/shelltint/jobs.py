"""Starts builder scripts detached, and tracks their results in state.json."""

import fcntl
import json
import subprocess
import time

from . import paths

LAST_UPDATE_RESULTS = ("unchanged", "updated", "offline", "damaged", "busy", "failed")


def script(name):
    return paths.install_dir() / "builder" / "scripts" / name


def spawn(name, *args, log=None):
    """Runs a builder script in its own session. Its output never touches stdout,
    which is the messaging channel; the scripts log to build.log themselves."""
    path = script(name)
    if not path.is_file():
        if log:
            log(f"ShellTint: {path} is missing")
        return False
    try:
        subprocess.Popen(["bash", str(path), *args], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True, close_fds=True)
        return True
    except OSError as e:
        if log:
            log(f"ShellTint: cannot start {name}: {e}")
        return False


def read_state(path=None):
    try:
        with open(path or paths.state_file(), "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {}
    return {
        "building": bool(data.get("building")),
        "lastBuild": data.get("lastBuild") if isinstance(data.get("lastBuild"), dict) else None,
        "lastUpdateCheck": data.get("lastUpdateCheck") if isinstance(data.get("lastUpdateCheck"), dict) else None,
    }


def update_state(changes, path=None):
    """Merges changes into state.json under a lock; both scripts write it."""
    target = path or paths.state_file()
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target.with_name(".state.lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = read_state(target)
        state.update(changes)
        paths.atomic_write(target, json.dumps(state, indent=2) + "\n")
    return state


def record_build(exit_code, path=None):
    index = paths.userstyles_dir() / "current" / "index.json"
    gen = None
    try:
        with open(index, "r", encoding="utf-8") as f:
            gen = json.load(f).get("gen")
    except (OSError, ValueError):
        pass
    ok = exit_code == 0
    return update_state({
        "building": False,
        "lastBuild": {"at": time.time(), "ok": ok, "gen": gen,
                      "error": None if ok else f"build exited with {exit_code}; see {paths.build_log()}"},
    }, path)


def record_update_check(result, path=None):
    if result not in LAST_UPDATE_RESULTS:
        result = "failed"
    return update_state({"lastUpdateCheck": {"at": time.time(), "result": result}}, path)
