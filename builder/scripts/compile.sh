#!/usr/bin/env bash
# Compile styles into the published generation, for a site the user just opened
# that was only indexed. The full build leaves most styles uncompiled, so this
# is what makes them appear.
#
#   compile.sh <style-id>[,<style-id>...]
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
root="$(dirname "$(dirname "$here")")"
cache="${SHELLTINT_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/shelltint}"
log="$cache/build.log"
ids="${1:-}"

say() { printf '[%s] compile: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$log"; }
idle() { if command -v ionice >/dev/null; then nice -n 10 ionice -c 3 "$@"; else nice -n 10 "$@"; fi; }

[ -n "$ids" ] || exit 0
node="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1)"
[ -x "$node" ] || node="$(command -v node || true)"
[ -n "$node" ] || { say "node is not installed"; exit 0; }

mkdir -p "$cache"
# A rebuild is already queued: it will publish a new generation, which makes
# these blocks stale before they are written.
[ -e "$cache/userstyles.dirty" ] && exit 0

# One at a time, and never while a full build is replacing the generation.
{
  flock -w 30 9 || { say "busy; $ids not compiled"; exit 0; }
  idle "$node" "$root/builder/build.mjs" --compile "$ids" >>"$log" 2>&1
} 9>"$cache/userstyles.lock"

# rebuild.sh gives up rather than queue behind this lock, so a theme change that
# arrived while compiling would otherwise be dropped.
[ -e "$cache/userstyles.dirty" ] && setsid -f bash "$here/rebuild.sh" </dev/null >/dev/null 2>&1
exit 0
