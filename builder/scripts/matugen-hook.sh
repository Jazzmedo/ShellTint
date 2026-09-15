#!/usr/bin/env bash
# Optional matugen post_hook: rebuild website styles after a theme change even
# while the browser is closed (the helper already watches while it is open).
# Returns immediately so matugen is never held up.
here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
setsid -f bash "$here/rebuild.sh" </dev/null >/dev/null 2>&1
exit 0
