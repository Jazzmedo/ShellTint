#!/usr/bin/env bash
# Fetch a pinned Catppuccin userstyles bundle, for development and offline
# builds. Files are checked against builder/SHA256SUMS; pass --update to accept
# new upstream versions and record their sums. (update.sh, which the helper
# runs, follows upstream without pinning.)
set -euo pipefail

cache="${SHELLTINT_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/shelltint}"
dest="${SHELLTINT_BUNDLE:-$cache/catppuccin}"
sums="$(cd "$(dirname "$0")/.." && pwd)/SHA256SUMS"
update=false
[ "${1:-}" = "--update" ] && update=true

mkdir -p "$dest"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL --retry 3 -o "$tmp/import.json" \
  https://github.com/catppuccin/userstyles/releases/download/all-userstyles-export/import.json
curl -fsSL --retry 3 -o "$tmp/std-v1.less" \
  https://userstyles.catppuccin.com/lib/std/v1.less

if $update; then
  (cd "$tmp" && sha256sum import.json std-v1.less) > "$sums"
  echo "recorded new sums in $sums"
elif ! (cd "$tmp" && sha256sum --quiet -c "$sums"); then
  echo "upstream changed; review it, then rerun with --update" >&2
  exit 1
fi

mv -f "$tmp/import.json" "$tmp/std-v1.less" "$dest/"
cp -f "$sums" "$dest/SHA256SUMS"
echo "bundle ready in $dest"
