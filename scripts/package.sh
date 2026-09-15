#!/usr/bin/env bash
# Lint the extension and build the zip uploaded to addons.mozilla.org.
#
#   scripts/package.sh
#
# Output: dist/shelltint-<version>.zip and its .sha256.
set -euo pipefail

repo="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
version="$(node -p "require('$repo/extension/manifest.json').version")"
dist="$repo/dist"
web_ext=(npx --yes web-ext@8)

mkdir -p "$dist"
"${web_ext[@]}" lint --source-dir "$repo/extension" --self-hosted=false --warnings-as-errors
"${web_ext[@]}" build --source-dir "$repo/extension" --artifacts-dir "$dist" \
  --filename "shelltint-$version.zip" --overwrite-dest

zip="$dist/shelltint-$version.zip"
if unzip -l "$zip" | grep -Eq 'node_modules|\.test\.|/tests?/|icon\.png$'; then
  echo "package contains files that don't belong in the extension" >&2
  exit 1
fi
(cd "$dist" && sha256sum "shelltint-$version.zip" > "shelltint-$version.zip.sha256")
echo "built $zip"
cat "$zip.sha256"
