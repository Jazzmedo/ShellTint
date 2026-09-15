#!/usr/bin/env python3
"""ShellTint palette tool, used by the builder scripts and for troubleshooting.

  shelltint_palette.py detect            list the colour sources found on this computer
  shelltint_palette.py show              print the palette the current settings resolve to
  shelltint_palette.py write             resolve and write ~/.cache/shelltint/palette.json
  shelltint_palette.py state building    mark a build as running
  shelltint_palette.py state build CODE  record a finished build's exit code
  shelltint_palette.py state update RESULT  record an update check's result

Settings come from ~/.config/shelltint/settings.json; --source and --mode override them.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from shelltint import jobs, palette, settings as settings_mod  # noqa: E402
from shelltint.sources import SourceError  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(prog="shelltint_palette.py", description="ShellTint palette tool")
    parser.add_argument("--source", choices=settings_mod.SOURCES)
    parser.add_argument("--mode", choices=("follow", "dark", "light"))
    parser.add_argument("--file", help="colour file for the matugen source")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("detect")
    sub.add_parser("show")
    sub.add_parser("write")
    state = sub.add_parser("state")
    state.add_argument("what", choices=("building", "build", "update"))
    state.add_argument("value", nargs="?")
    args = parser.parse_args(argv)

    current = settings_mod.load_mirror() or settings_mod.normalise({})
    if args.source:
        current["paletteSource"] = args.source
    if args.mode:
        current["mode"] = args.mode
    if args.file:
        current["customPalettePath"] = args.file

    if args.command == "detect":
        result = palette.detect(current)
        for row in result["sources"]:
            mark = "*" if row["id"] == result["active"] else " "
            status = "ok" if row["ok"] else (row["error"] or "not found")
            print(f"{mark} {row['label']:<26} {status:<10} {row['mode'] or '':<6} {row['path']}")
        return 0 if result["active"] else 1

    if args.command in ("show", "write"):
        try:
            resolved = palette.resolve(current)
        except SourceError as e:
            print(f"shelltint: {e}", file=sys.stderr)
            return 1
        if args.command == "show":
            print(json.dumps(resolved, indent=2))
        else:
            written = palette.write(resolved)
            print(f"{resolved['source']['label']}, {resolved['mode']}: palette {'written' if written else 'unchanged'}")
        return 0

    if args.what == "building":
        jobs.update_state({"building": True})
    elif args.what == "build":
        jobs.record_build(int(args.value or 1))
    else:
        jobs.record_update_check(args.value or "failed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
