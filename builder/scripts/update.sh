#!/usr/bin/env bash
# Check Catppuccin for new userstyles and rebuild when they changed.
#
#   update.sh [--now]
#
# The helper starts this when the browser connects. Checks run at most once
# per SHELLTINT_UPDATE_INTERVAL seconds (default 600) unless --now is given.
# A bundle that fails to download, parse or build is thrown away, so the
# styles already in use stay in place.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
root="$(dirname "$(dirname "$here")")"
cache="${SHELLTINT_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/shelltint}"
bundle="$cache/catppuccin"
interval="${SHELLTINT_UPDATE_INTERVAL:-600}"
import_url="https://github.com/catppuccin/userstyles/releases/download/all-userstyles-export/import.json"
std_url="https://userstyles.catppuccin.com/lib/std/v1.less"
now=false
[ "${1:-}" = "--now" ] && now=true

mkdir -p "$bundle"
exec 9>"$cache/update.lock"
flock -n 9 || exit 0
exec >>"$cache/build.log" 2>&1

python="$(command -v python3 || true)"
say() { printf '[%s] update: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
result() { [ -n "$python" ] && "$python" "$root/host/shelltint_palette.py" state update "$1"; }

stamp="$cache/bundle-checked"
if ! $now && [ -f "$stamp" ] && [ $(( $(date +%s) - $(stat -c %Y "$stamp") )) -lt "$interval" ]; then
  exit 0
fi

node="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1)"
[ -x "$node" ] || node="$(command -v node || true)"
[ -n "$node" ] || { say "node is not installed"; result failed; exit 0; }

tmp="$(mktemp -d "$cache/.bundle-XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

if ! curl -fsSL --retry 2 --max-time 120 -o "$tmp/import.json" "$import_url" ||
   ! curl -fsSL --retry 2 --max-time 60 -o "$tmp/std-v1.less" "$std_url"; then
  say "could not reach Catppuccin; keeping the current styles"
  result offline
  exit 0
fi
touch "$stamp"

if ! "$node" -e '
  const b = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  process.exit(Array.isArray(b) && b.filter(e => e && typeof e.sourceCode === "string").length >= 50 ? 0 : 1);
' "$tmp/import.json" || ! grep -q '@catppuccin' "$tmp/std-v1.less"; then
  say "the downloaded bundle looks damaged; keeping the current styles"
  result damaged
  exit 0
fi

if cmp -s "$tmp/import.json" "$bundle/import.json" &&
   cmp -s "$tmp/std-v1.less" "$bundle/std-v1.less" &&
   [ -e "$cache/userstyles/current/index.json" ]; then
  result unchanged
  exit 0
fi

say "new Catppuccin styles; rebuilding"
{
  # rebuild.sh builds under the same lock.
  if ! flock -w 300 8; then
    say "another build is still running; will check again next launch"
    rm -f "$stamp"
    result busy
    exit 0
  fi
  if ! "$python" "$root/host/shelltint_palette.py" write; then
    say "no usable palette; the new styles will build once colours are found"
    result failed
    exit 0
  fi
  "$python" "$root/host/shelltint_palette.py" state building
  if command -v ionice >/dev/null; then idle=(nice -n 19 ionice -c 3); else idle=(nice -n 19); fi
  "${idle[@]}" "$node" "$root/builder/build.mjs" --bundle "$tmp" --palette "$cache/palette.json"
  code=$?
  "$python" "$root/host/shelltint_palette.py" state build "$code"
  if [ "$code" -eq 0 ]; then
    mv -f "$tmp/import.json" "$tmp/std-v1.less" "$bundle/"
    (cd "$bundle" && sha256sum import.json std-v1.less > SHA256SUMS)
    result updated
  else
    say "the new bundle did not build; kept the previous styles"
    result failed
  fi
} 8>"$cache/userstyles.lock"

# A palette change that arrived while this held the lock is still pending.
[ -e "$cache/userstyles.dirty" ] && "$here/rebuild.sh"
exit 0
