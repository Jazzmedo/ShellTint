#!/usr/bin/env bash
# Render extension/icons/icon.svg to the PNG sizes the manifest uses.
# Needs ImageMagick 7 (`magick`). The PNGs are committed, so this only runs
# when the SVG changes.
set -euo pipefail

icons="$(cd "$(dirname "$0")/../extension/icons" && pwd)"
command -v magick >/dev/null || { echo "ImageMagick 7 (magick) is required" >&2; exit 1; }

for size in 16 32 48 96 128; do
  magick -background none -density 384 "$icons/icon.svg" -resize "${size}x${size}" "$icons/icon-$size.png"
done
echo "rendered $(ls "$icons"/icon-*.png | wc -l) icons into $icons"
