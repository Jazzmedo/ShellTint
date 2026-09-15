"""Chooses a source, resolves light/dark, and writes ~/.cache/shelltint/palette.json."""

import hashlib
import json
import time

from . import colors, paths
from .sources import AUTO_ORDER, REGISTRY, SourceError

FORMAT = 1


def _mtime(path):
    try:
        return path.stat().st_mtime
    except OSError:
        return None


def detect(settings):
    """Every source with what was found on this computer, for the options page."""
    rows = []
    for source_id in AUTO_ORDER:
        source = REGISTRY[source_id]
        path = source.find(settings)
        row = {"id": source.id, "label": source.label, "found": bool(path),
               "path": str(path or (source.candidates(settings) or [""])[0]),
               "mtime": _mtime(path) if path else None, "ok": False, "error": None, "mode": None}
        if path:
            try:
                parsed = source.parse(path, settings)
                roles = parsed.variants.get(parsed.mode) or next(iter(parsed.variants.values()), {})
                missing = colors.missing_roles(roles)
                row["ok"] = not missing
                row["error"] = f"lacks {', '.join(missing)}" if missing else None
                row["mode"] = parsed.mode
            except SourceError as e:
                row["error"] = str(e)
        rows.append(row)
    try:
        active = pick_source(settings)[0].id
    except SourceError:
        active = None
    return {"active": active, "sources": rows}


def pick_source(settings):
    """(source, path, parsed) for the manual choice, or the first usable one in auto order."""
    choice = (settings or {}).get("paletteSource") or "auto"
    if choice != "auto":
        source = REGISTRY.get(choice)
        if source is None:
            raise SourceError(f"unknown palette source {choice!r}")
        path = source.find(settings)
        if path is None:
            where = ", ".join(str(p) for p in source.candidates(settings)) or "no file chosen"
            raise SourceError(f"{source.label} colours not found ({where})")
        return source, path, source.parse(path, settings)

    problems = []
    for source_id in AUTO_ORDER:
        source = REGISTRY[source_id]
        path = source.find(settings)
        if path is None:
            continue
        try:
            return source, path, source.parse(path, settings)
        except SourceError as e:
            problems.append(f"{source.label}: {e}")
    if problems:
        raise SourceError("; ".join(problems))
    raise SourceError("no supported shell colours found; choose a source in ShellTint's settings")


def resolve(settings):
    source, path, parsed = pick_source(settings)
    warnings = list(parsed.warnings)

    forced = (settings or {}).get("mode")
    if forced in ("dark", "light"):
        mode, mode_source = forced, "forced"
    else:
        mode, mode_source = parsed.mode, parsed.mode_source

    roles = parsed.variants.get(mode)
    if roles is None:
        other = "light" if mode == "dark" else "dark"
        roles = parsed.variants.get(other)
        if roles is None:
            raise SourceError(f"{path} has no colours")
        warnings.append(f"{source.label} has no {mode} colours; using its {other} ones")
    elif forced in ("dark", "light") and colors.infer_mode(roles) not in (None, mode):
        # DMS custom themes write the current mode into both blocks.
        warnings.append(f"{source.label}'s {mode} colours look {colors.infer_mode(roles)}")

    missing = colors.missing_roles(roles)
    if missing:
        raise SourceError(f"{path} lacks {', '.join(missing)}")

    extras = {}
    for name, per_mode in parsed.extras.items():
        chosen = per_mode.get(mode) or next((v for v in per_mode.values() if v), None)
        if chosen:
            extras[name] = chosen

    palette = {
        "format": FORMAT,
        "source": {"id": source.id, "label": source.label, "path": str(path), "mtime": _mtime(path)},
        "mode": mode,
        "modeSource": mode_source,
        "roles": roles,
        "extras": extras,
        "warnings": warnings,
    }
    palette["hash"] = palette_hash(palette)
    palette["generatedAt"] = time.time()
    return palette


def palette_hash(palette):
    """Identity of what the builder and the toolbar see; the file time is left out."""
    key = {k: palette.get(k) for k in ("mode", "roles", "extras")}
    key["source"] = (palette.get("source") or {}).get("id")
    return hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:16]


def load(path=None):
    try:
        with open(path or paths.palette_file(), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) and data.get("format") == FORMAT else None
    except (OSError, ValueError):
        return None


def write(palette, path=None):
    """Writes only when the hash changed, so the file time marks real changes. Returns True if written."""
    target = path or paths.palette_file()
    current = load(target)
    if current and current.get("hash") == palette["hash"] and current.get("warnings") == palette["warnings"]:
        return False
    paths.atomic_write(target, json.dumps(palette, indent=2) + "\n")
    return True
