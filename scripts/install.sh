#!/usr/bin/env bash
# Install the ShellTint helper for the current user.
#
#   scripts/install.sh [--prefix DIR] [--no-build] [--dry-run] [--with-matugen-hook]
#
# Copies host/ and builder/ to ~/.local/share/shelltint, installs the builder's
# npm dependencies, registers the native messaging host for Firefox-based
# browsers, and fetches and builds the website styles.
set -euo pipefail

repo="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
prefix="${XDG_DATA_HOME:-$HOME/.local/share}/shelltint"
build=true
dry=false
hook=false

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) prefix="${2:?--prefix needs a directory}"; shift ;;
    --no-build) build=false ;;
    --dry-run) dry=true ;;
    --with-matugen-hook) hook=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

run() { if $dry; then printf '  would run: %s\n' "$*"; else "$@"; fi; }
say() { printf '%s\n' "$*"; }
fail() { printf 'shelltint: %s\n' "$*" >&2; exit 1; }

hint() {
  if command -v dnf >/dev/null; then echo "sudo dnf install $1"
  elif command -v apt-get >/dev/null; then echo "sudo apt install $2"
  elif command -v pacman >/dev/null; then echo "sudo pacman -S $3"
  else echo "install $1 with your package manager"; fi
}

# ─── Preflight ───
missing=0
python="$(command -v python3 || true)"
if [ -z "$python" ] || ! "$python" -c 'import sys; sys.exit(sys.version_info < (3, 8))'; then
  say "✗ Python 3.8 or newer is required: $(hint python3 python3 python)"; missing=1
fi
node="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1 || true)"
[ -x "$node" ] || node="$(command -v node || true)"
if [ -z "$node" ] || [ "$("$node" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  say "✗ Node.js 18 or newer is required: $(hint 'nodejs npm' 'nodejs npm' 'nodejs npm')"; missing=1
fi
npm="$(dirname "${node:-/nonexistent}")/npm"
[ -x "$npm" ] || npm="$(command -v npm || true)"
[ -n "$npm" ] || { say "✗ npm is required: $(hint npm npm npm)"; missing=1; }
command -v curl >/dev/null || { say "✗ curl is required: $(hint curl curl curl)"; missing=1; }
command -v flock >/dev/null || { say "✗ flock is required: $(hint util-linux util-linux util-linux)"; missing=1; }
[ "$missing" -eq 0 ] || fail "install the missing tools above, then run this again"
say "✓ python3, node $("$node" -v), npm, curl and flock found"

# ─── Files ───
say "Installing the helper into $prefix"
run mkdir -p "$prefix"
for part in host builder; do
  run rm -rf "$prefix/$part.new"
  run mkdir -p "$prefix/$part.new"
  run tar -C "$repo/$part" --exclude=node_modules --exclude=__pycache__ --exclude=tests --exclude=test -cf - . \
    | { if $dry; then cat >/dev/null; else tar -C "$prefix/$part.new" -xf -; fi; }
  # Keep installed dependencies when the lockfile is unchanged.
  if [ "$part" = builder ] && [ -d "$prefix/builder/node_modules" ] &&
     cmp -s "$prefix/builder/package-lock.json" "$repo/builder/package-lock.json"; then
    run mv "$prefix/builder/node_modules" "$prefix/builder.new/node_modules"
  fi
  run rm -rf "$prefix/$part"
  run mv "$prefix/$part.new" "$prefix/$part"
done
run chmod +x "$prefix/host/shelltint_host.py" "$prefix/host/shelltint_palette.py" "$prefix"/builder/scripts/*.sh
if [ ! -d "$prefix/builder/node_modules" ] || $dry; then
  say "Installing the builder's npm packages"
  run env PATH="$(dirname "$node"):$PATH" "$npm" ci --omit=dev --no-audit --no-fund --prefix "$prefix/builder"
fi

# ─── Native messaging manifests ───
manifest="{
  \"name\": \"shelltint\",
  \"description\": \"ShellTint helper\",
  \"path\": \"$prefix/host/shelltint_host.py\",
  \"type\": \"stdio\",
  \"allowed_extensions\": [\"shelltint@jazzmedo\"]
}"
# Firefox, Zen, Floorp and LibreWolf read ~/.mozilla. The others get a manifest
# only when their folder already exists: creating a browser's folder can make it
# start a new, empty profile (Zen does this with ~/.zen, so it is never touched).
targets=("$HOME/.mozilla/native-messaging-hosts")
for dir in "$HOME/.librewolf" "$HOME/.waterfox" "$HOME/.floorp" \
           "$HOME/.var/app/org.mozilla.firefox/.mozilla" \
           "$HOME/.var/app/io.gitlab.librewolf-community/.librewolf"; do
  [ -d "$dir" ] && targets+=("$dir/native-messaging-hosts")
done
for target in "${targets[@]}"; do
  case "$target" in "$HOME/.zen"*) continue ;; esac
  run mkdir -p "$target"
  if $dry; then say "  would write: $target/shelltint.json"; else printf '%s\n' "$manifest" > "$target/shelltint.json"; fi
  say "✓ registered the helper in $target"
done
case " ${targets[*]} " in *"/.var/app/"*)
  say "! Flatpak browsers can't run programs outside their sandbox by default; the helper may not start there." ;;
esac

# ─── Colours and styles ───
cache="${XDG_CACHE_HOME:-$HOME/.cache}/shelltint"
run mkdir -p "$cache" "${XDG_CONFIG_HOME:-$HOME/.config}/shelltint"
say "Colour sources on this computer:"
if ! $dry; then
  "$python" "$prefix/host/shelltint_palette.py" detect || say "! No supported shell colours found yet. Choose a source in ShellTint's settings."
fi
if $build; then
  say "Fetching Catppuccin userstyles and building website styles (about a minute)…"
  run bash "$prefix/builder/scripts/update.sh" --now
  if ! $dry; then
    if [ -e "$cache/userstyles/current/index.json" ]; then
      say "✓ website styles built"
    else
      say "! Styles weren't built yet; see $cache/build.log. They build when the browser connects."
    fi
  fi
fi

if $hook; then
  cat <<EOF

To rebuild website styles while the browser is closed, add this to your
matugen config (~/.config/matugen/config.toml) under an existing template:

  post_hook = "$prefix/builder/scripts/matugen-hook.sh"

EOF
fi

say "
Done. Install the ShellTint extension, restart the browser, and open
ShellTint's settings to check that the helper is connected."
