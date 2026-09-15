#!/usr/bin/env bash
# Remove the ShellTint helper.
#
#   scripts/uninstall.sh [--prefix DIR] [--purge]
#
# --purge also deletes the palette, built styles and mirrored settings.
# The browser extension itself is removed from the browser's Add-ons page.
set -euo pipefail

prefix="${XDG_DATA_HOME:-$HOME/.local/share}/shelltint"
purge=false
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) prefix="${2:?--prefix needs a directory}"; shift ;;
    --purge) purge=true ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

for manifest in "$HOME/.mozilla/native-messaging-hosts/shelltint.json" \
                "$HOME/.librewolf/native-messaging-hosts/shelltint.json" \
                "$HOME/.waterfox/native-messaging-hosts/shelltint.json" \
                "$HOME/.floorp/native-messaging-hosts/shelltint.json" \
                "$HOME/.var/app/org.mozilla.firefox/.mozilla/native-messaging-hosts/shelltint.json" \
                "$HOME/.var/app/io.gitlab.librewolf-community/.librewolf/native-messaging-hosts/shelltint.json"; do
  if [ -f "$manifest" ]; then
    rm -f "$manifest"
    echo "removed $manifest"
  fi
done

if [ -d "$prefix" ]; then
  rm -rf "$prefix"
  echo "removed $prefix"
fi

if $purge; then
  for dir in "${XDG_CACHE_HOME:-$HOME/.cache}/shelltint" "${XDG_CONFIG_HOME:-$HOME/.config}/shelltint"; do
    [ -d "$dir" ] && rm -rf "$dir" && echo "removed $dir"
  done
fi

echo "ShellTint helper removed. Remove the extension from the browser's Add-ons page."
