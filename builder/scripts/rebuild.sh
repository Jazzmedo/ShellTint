#!/usr/bin/env bash
# Resolve the shell palette and rebuild the website styles.
#
#   rebuild.sh [--force]
#
# Returns at once when another build holds the lock: the .dirty flag makes
# that build run once more, so bursts of changes collapse into one extra build.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
root="$(dirname "$(dirname "$here")")"
cache="${SHELLTINT_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/shelltint}"
log="$cache/build.log"
force=()
[ "${1:-}" = "--force" ] && force=(--force)

mkdir -p "$cache"
touch "$cache/userstyles.dirty"

node="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1)"
[ -x "$node" ] || node="$(command -v node || true)"
python="$(command -v python3 || true)"
say() { printf '[%s] rebuild: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$log"; }
[ -n "$node" ] || { say "node is not installed"; exit 0; }
[ -n "$python" ] || { say "python3 is not installed"; exit 0; }
[ -f "$cache/catppuccin/import.json" ] || { say "no Catppuccin bundle yet; run update.sh"; exit 0; }

while :; do
  {
    flock -n 9 || exit 0
    while [ -e "$cache/userstyles.dirty" ]; do
      rm -f "$cache/userstyles.dirty"
      [ -f "$log" ] && [ "$(stat -c %s "$log")" -gt 1048576 ] && mv -f "$log" "$log.1"
      if ! "$python" "$root/host/shelltint_palette.py" write >>"$log" 2>&1; then
        say "no usable palette; keeping the current styles"
        continue
      fi
      "$python" "$root/host/shelltint_palette.py" state building
      nice -n 10 "$node" "$root/builder/build.mjs" --palette "$cache/palette.json" "${force[@]}" >>"$log" 2>&1
      "$python" "$root/host/shelltint_palette.py" state build "$?"
      force=()
    done
  } 9>"$cache/userstyles.lock"
  # A change may have landed after the last check but before the lock was released.
  [ -e "$cache/userstyles.dirty" ] || exit 0
done
