#!/usr/bin/env bash
# ShellTint installer and uninstaller — the only script you need.
#
#   shelltint.sh                                              install (asks which browsers)
#   shelltint.sh [--browsers LIST|all|auto|none]              install without the question
#   shelltint.sh --uninstall [--purge]                        remove the helper and manifests
#   also: [--prefix DIR] [--no-build] [--dry-run] [--with-matugen-hook]
#
# One line, from anywhere (it downloads the repo to a temp folder itself):
#   curl -fsSL https://raw.githubusercontent.com/Jazzmedo/ShellTint/main/shelltint.sh | bash
#
# The install copies host/ and builder/ to ~/.local/share/shelltint, installs
# the builder's npm dependencies, detects the installed browsers (config
# folders, /opt, AppImages), asks which ones to register, and fetches and
# builds the website styles.
set -euo pipefail

# ─── Browser registry ───
# One line per browser:
#   id|family|label|binaries|opt-dirs|config-dirs|appimage-globs
# - family: gecko browsers read <dir>/native-messaging-hosts, chromium read
#   <dir>/NativeMessagingHosts.
# - Dir tokens: @home@ ($HOME), @config@ (${XDG_CONFIG_HOME:-$HOME/.config}),
#   @var@ ($HOME/.var/app — Flatpak; only written when the app dir exists).
# - LibreWolf moved its data dir in newer builds, so it lists both; Zen and
#   Helium ship official AppImages, which use the same XDG dirs as native
#   installs, so one manifest covers both.
# - DuckDuckGo has no Linux browser (as of 2026-11), so it has no entry.
#
# CHROMIUM_ID is pinned by the public key in scripts/package.sh; the Chromium
# native-messaging manifest allows chrome-extension://$CHROMIUM_ID/.
CHROMIUM_ID=paiglabcdaphmocanlbnikkipilidmfk

st_browser_table=(
  "firefox|gecko|Firefox|firefox firefox-bin|/usr/lib/firefox /opt/firefox|@home@/.mozilla @var@/org.mozilla.firefox/.mozilla|"
  "zen|gecko|Zen|zen zen-browser|/opt/zen|@home@/.zen @var@/app.zen_browser.zen/.zen|zen-*.AppImage zen-*.appimage zen.*.appimage"
  "librewolf|gecko|LibreWolf|librewolf|/opt/librewolf|@home@/.librewolf @config@/librewolf/librewolf @var@/io.gitlab.librewolf-community/.librewolf|librewolf*.AppImage librewolf*.appimage"
  "waterfox|gecko|Waterfox|waterfox|/opt/waterfox|@home@/.waterfox @var@/net.waterfox.waterfox/.waterfox|waterfox*.AppImage waterfox*.appimage"
  "floorp|gecko|Floorp|floorp|/opt/floorp|@home@/.floorp @var@/one.ablaze.floorp/.floorp|floorp*.AppImage floorp*.appimage"
  "chromium|chromium|Chromium|chromium chromium-browser||@config@/chromium @var@/org.chromium.Chromium/config/chromium|chromium*.AppImage chromium*.appimage"
  "google-chrome|chromium|Google Chrome|google-chrome google-chrome-stable|/opt/google/chrome|@config@/google-chrome @var@/com.google.Chrome/config/google-chrome|chrome*.AppImage"
  "google-chrome-beta|chromium|Google Chrome Beta|google-chrome-beta|/opt/google/chrome-beta|@config@/google-chrome-beta|"
  "google-chrome-unstable|chromium|Google Chrome Dev|google-chrome-unstable|/opt/google/chrome-unstable|@config@/google-chrome-unstable|"
  "brave|chromium|Brave|brave brave-browser brave-stable|/opt/brave.com/brave|@config@/BraveSoftware/Brave-Browser @var@/com.brave.Browser/config/BraveSoftware/Brave-Browser|brave*.AppImage"
  "brave-beta|chromium|Brave Beta|brave-beta brave-browser-beta|/opt/brave.com/brave-beta|@config@/BraveSoftware/Brave-Browser-Beta|"
  "brave-nightly|chromium|Brave Nightly|brave-nightly brave-browser-nightly|/opt/brave.com/brave-nightly|@config@/BraveSoftware/Brave-Browser-Nightly|"
  "brave-origin|chromium|Brave Origin|brave-origin brave-origin-stable|/opt/brave.com/brave-origin|@config@/BraveSoftware/Brave-Origin|"
  "brave-origin-beta|chromium|Brave Origin Beta||/opt/brave.com/brave-origin-beta|@config@/BraveSoftware/Brave-Origin-Beta|"
  "brave-origin-nightly|chromium|Brave Origin Nightly||/opt/brave.com/brave-origin-nightly|@config@/BraveSoftware/Brave-Origin-Nightly|"
  "vivaldi|chromium|Vivaldi|vivaldi vivaldi-stable|/opt/vivaldi|@config@/vivaldi @var@/com.vivaldi.Vivaldi/config/vivaldi|vivaldi*.AppImage"
  "vivaldi-snapshot|chromium|Vivaldi Snapshot|vivaldi-snapshot|/opt/vivaldi-snapshot|@config@/vivaldi-snapshot|"
  "microsoft-edge|chromium|Microsoft Edge|microsoft-edge microsoft-edge-stable|/opt/microsoft/msedge|@config@/microsoft-edge @var@/com.microsoft.Edge/config/microsoft-edge|edge*.AppImage"
  "helium|chromium|Helium|helium|/opt/helium|@config@/net.imput.helium|helium*.AppImage helium*.appimage"
  "thorium|chromium|Thorium|thorium-browser thorium|/opt/thorium|@config@/thorium|thorium*.AppImage thorium*.appimage"
)

# Where to look for /opt installs and AppImages; overridable for tests.
st_opt_dir="${SHELLTINT_OPT_DIR:-/opt}"
st_appimage_dirs="${SHELLTINT_APPIMAGE_DIRS:-$HOME/Applications $HOME/AppImages $HOME/.local/bin $st_opt_dir}"

st_browser_expand() {
    local dir="$1"
    dir="${dir//@config@/${XDG_CONFIG_HOME:-$HOME/.config}}"
    dir="${dir//@var@/$HOME/.var/app}"
    dir="${dir//@home@/$HOME}"
    printf '%s' "$dir"
}

st_browser_field() {
    cut -d'|' -f"$(( $2 + 1 ))" <<<"$1"
}

st_browser_config_dirs() {
    local line="$1" dir
    for dir in $(st_browser_field "$line" 5); do
        st_browser_expand "$dir"
        printf '\n'
    done
}

st_manifest_subdir() {
    case "$(st_browser_field "$1" 1)" in
        gecko) printf 'native-messaging-hosts' ;;
        *) printf 'NativeMessagingHosts' ;;
    esac
}

# A config dir counts as "in use" only when it holds more than a
# native-messaging manifest folder (installers create those for browsers that
# never ran).
st_browser_dir_in_use() {
    local dir="$1" others
    [[ -d "$dir" ]] || return 1
    others=$(ls -A "$dir" 2>/dev/null | command grep -iv 'ativemessaginghosts' || true)
    [[ -n $others ]]
}

st_browser_where() {
    local line="$1" dir binary found
    for dir in $(st_browser_config_dirs "$line"); do
        st_browser_dir_in_use "$dir" && { printf 'in use'; return; }
    done
    for binary in $(st_browser_field "$line" 3); do
        command -v "$binary" >/dev/null 2>&1 && { printf 'in PATH'; return; }
    done
    for dir in $(st_browser_field "$line" 4); do
        [[ -d "$dir" ]] && { printf 'under /opt'; return; }
    done
    for binary in $(st_browser_field "$line" 3); do
        found=$(find "$st_opt_dir" -maxdepth 3 -type f -name "$binary" -print -quit 2>/dev/null)
        [[ -n $found ]] && { printf 'under /opt'; return; }
    done
    for dir in $st_appimage_dirs; do
        for pattern in $(st_browser_field "$line" 6); do
            found=$(find "$dir" -maxdepth 2 -iname "$pattern" -print -quit 2>/dev/null)
            [[ -n $found ]] && { printf 'as AppImage'; return; }
        done
    done
    return 1
}

st_browser_detect_all() {
    local line id where
    for line in "${st_browser_table[@]}"; do
        id=$(st_browser_field "$line" 0)
        where=$(st_browser_where "$line") || continue
        printf '%s %s\n' "$id" "$where"
    done
}

line_of() {
    local line
    for line in "${st_browser_table[@]}"; do
        [[ $(st_browser_field "$line" 0) == "$1" ]] && { printf '%s' "$line"; return; }
    done
    return 1
}

# ─── Args ───
prefix="${XDG_DATA_HOME:-$HOME/.local/share}/shelltint"
build=true
dry=false
hook=false
browsers_arg=""
uninstall=false
purge=false

usage() { sed -n '2,9p' "${BASH_SOURCE[0]:-}" 2>/dev/null | sed 's/^# \{0,1\}//'; }
while [ $# -gt 0 ]; do
  case "$1" in
    --browsers) browsers_arg="${2:?--browsers needs a list, all, auto or none}"; shift ;;
    --prefix) prefix="${2:?--prefix needs a directory}"; shift ;;
    --no-build) build=false ;;
    --dry-run) dry=true ;;
    --with-matugen-hook) hook=true ;;
    --uninstall) uninstall=true ;;
    --purge) purge=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

run() { if $dry; then printf '  would run: %s\n' "$*"; else "$@"; fi; }
say() { printf '%s\n' "$*"; }
fail() { printf 'shelltint: %s\n' "$*" >&2; exit 1; }

# Prompts must work when stdin is the install pipe (curl | bash), so questions
# come from the terminal, never from the pipe.
ask() {
  local reply=""
  if [[ -n ${SHELLTINT_ANSWER:-} ]]; then     # test hook: answers the next question only
    printf '%s' "$SHELLTINT_ANSWER"
    return
  fi
  # -t: a headless run must not block forever; two minutes is plenty for a human.
  if [[ -t 0 ]]; then
    read -r -t 120 -p "$1" reply || true
  elif [[ -r /dev/tty ]]; then
    read -r -t 120 -p "$1" reply </dev/tty 2>/dev/null || true
  fi
  printf '%s' "$reply"
}

# ─── Uninstall ───
if $uninstall; then
  # Every manifest the installer could have written, across the whole registry.
  for line in "${st_browser_table[@]}"; do
    subdir="$(st_manifest_subdir "$line")"
    for dir in $(st_browser_config_dirs "$line"); do
      manifest="$dir/$subdir/shelltint.json"
      if [ -f "$manifest" ]; then
        run rm -f "$manifest"
        $dry || echo "removed $manifest"
      fi
    done
  done
  if [ -d "$prefix" ]; then
    run rm -rf "$prefix"
    $dry || echo "removed $prefix"
  fi
  if $purge; then
    for dir in "${XDG_CACHE_HOME:-$HOME/.cache}/shelltint" "${XDG_CONFIG_HOME:-$HOME/.config}/shelltint"; do
      [ -d "$dir" ] && { run rm -rf "$dir"; $dry || echo "removed $dir"; }
    done
  fi
  $dry || echo "ShellTint helper removed. Remove the extension from the browser's Add-ons page."
  exit 0
fi

# ─── Repo: this checkout, or a download when piped ───
script_file="${BASH_SOURCE[0]:-}"
if [[ -n $script_file && -f $script_file && -d "$(dirname "$script_file")/host" ]]; then
  repo="$(cd "$(dirname "$script_file")" && pwd)"
else
  command -v curl >/dev/null || fail "curl is required (or run this from a ShellTint checkout)"
  tmp_repo="$(mktemp -d)"
  trap 'rm -rf "$tmp_repo"' EXIT
  say "Downloading ShellTint…"
  repo="$tmp_repo/ShellTint"
  repo_url="${SHELLTINT_REPO:-https://github.com/Jazzmedo/ShellTint}"   # local paths work, for testing
  if command -v git >/dev/null 2>&1; then
    git clone --quiet --depth=1 "$repo_url" "$repo"
  else
    command -v tar >/dev/null || fail "tar is required when git is missing"
    curl -fsSL "${repo_url%/}/archive/refs/heads/main.tar.gz" -o "$tmp_repo/src.tar.gz"
    mkdir -p "$repo"
    tar -xzf "$tmp_repo/src.tar.gz" -C "$repo" --strip-components=1
  fi
fi

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

# ─── Which browsers to register ───
# Detection (config folders, PATH, /opt, AppImages) comes from the registry above.
declare -a DETECT_IDS DETECT_WHERE
while read -r id where; do
  [[ -n $id ]] || continue
  DETECT_IDS+=("$id"); DETECT_WHERE+=("$where")
done < <(st_browser_detect_all)
((${#DETECT_IDS[@]})) || fail "no supported browser found (edit the registry at the top of this script to add yours)"

declare -a SELECTED=()
if [[ -n $browsers_arg ]]; then
  case "$browsers_arg" in
    none) say "Browser registration skipped (--browsers none)" ;;
    all|auto)
      for i in "${!DETECT_IDS[@]}"; do
        if [[ $browsers_arg == all || ${DETECT_WHERE[$i]} == "in use" ]]; then
          SELECTED+=("${DETECT_IDS[$i]}")
        fi
      done
      ;;
    *)
      for id in ${browsers_arg//,/ }; do
        line_of "$id" >/dev/null || fail "unknown browser '$id' (known: $(printf '%s ' "${st_browser_table[@]}" | cut -d'|' -f1 | tr '\n' ' '))"
        SELECTED+=("$id")
      done
      ;;
  esac
else
  say ""
  say "Detected browsers:"
  in_use_indexes=()
  for i in "${!DETECT_IDS[@]}"; do
    line="$(line_of "${DETECT_IDS[$i]}")"
    dir="$(st_browser_config_dirs "$line")"
    dir="${dir%%$'\n'*}"
    printf '  %2d) %-22s %-12s %s\n' "$((i + 1))" "${DETECT_IDS[$i]}" "(${DETECT_WHERE[$i]})" "$dir"
    [[ ${DETECT_WHERE[$i]} == "in use" ]] && in_use_indexes+=("$((i + 1))")
  done
  say ""
  default_list="${in_use_indexes[*]:-}"
  [ -n "$default_list" ] || default_list="a"
  while :; do
    reply="$(ask "Register which ones? [${default_list}] (Enter = in use, a = all detected, numbers like 1 3-5): ")"
    # the ask above runs in a subshell, so clear the test hook here, once
    [[ -z ${SHELLTINT_ANSWER:-} ]] || unset SHELLTINT_ANSWER
    reply="${reply:-$default_list}"
    if [[ $reply == [Aa] ]]; then
      for i in "${!DETECT_IDS[@]}"; do SELECTED+=("${DETECT_IDS[$i]}"); done
      break
    fi
    if [[ $reply =~ ^[0-9][0-9\ -]*$ ]]; then
      pick_ok=true
      SELECTED=()
      for token in $reply; do
        if [[ $token == *-* ]]; then
          lo="${token%-*}" hi="${token#*-}"
          [[ $lo =~ ^[0-9]+$ && $hi =~ ^[0-9]+$ && $lo -ge 1 && $lo -le $hi && $hi -le ${#DETECT_IDS[@]} ]] || { pick_ok=false; break; }
          for ((n = lo; n <= hi; n++)); do SELECTED+=("${DETECT_IDS[$((n - 1))]}"); done
        else
          [[ $token -ge 1 && $token -le ${#DETECT_IDS[@]} ]] || { pick_ok=false; break; }
          SELECTED+=("${DETECT_IDS[$((token - 1))]}")
        fi
      done
      $pick_ok && ((${#SELECTED[@]})) && break
    fi
    say "  ! pick numbers from the list, 'a' for all, or press Enter"
  done
fi
if ((${#SELECTED[@]})); then
  say "Registering the helper for: ${SELECTED[*]}"
else
  say "No browsers selected; the manifests stay as they are."
fi

# ─── Native messaging manifests ───
# Gecko browsers allow extensions by id; Chromium browsers allow them by
# origin, and the origin is pinned by the key in scripts/package.sh.
gecko_manifest="{
  \"name\": \"shelltint\",
  \"description\": \"ShellTint helper\",
  \"path\": \"$prefix/host/shelltint_host.py\",
  \"type\": \"stdio\",
  \"allowed_extensions\": [\"shelltint@jazzmedo\"]
}"
chromium_manifest="{
  \"name\": \"shelltint\",
  \"description\": \"ShellTint helper\",
  \"path\": \"$prefix/host/shelltint_host.py\",
  \"type\": \"stdio\",
  \"allowed_origins\": [\"chrome-extension://$CHROMIUM_ID/\"]
}"
flatpak_seen=false
for id in "${SELECTED[@]}"; do
  line="$(line_of "$id")"
  family="$(st_browser_field "$line" 1)"
  label="$(st_browser_field "$line" 2)"
  manifest="$gecko_manifest"
  [[ $family == chromium ]] && manifest="$chromium_manifest"
  subdir="$(st_manifest_subdir "$line")"
  # Write the folders that exist; when none does, create the first native one
  # (LibreWolf's old and new dirs are a case in point) rather than all of them.
  declare -a write_dirs=()
  first_native=""
  for dir in $(st_browser_config_dirs "$line"); do
    case "$dir" in
      "$HOME"/.var/app/*)
        appdir="${dir#"$HOME"/.var/app/}"        # <app-id>/<rest>
        appdir="$HOME/.var/app/${appdir%%/*}"
        [[ -d $appdir ]] || continue ;;          # Flatpak not installed
      :|"") continue ;;
    esac
    [[ -z $first_native ]] && first_native="$dir"
    [[ -d $dir ]] && write_dirs+=("$dir")
  done
  if ((${#write_dirs[@]} == 0)); then
    write_dirs=("$first_native")
    [[ $family == gecko ]] &&
      say "! $label hasn't run yet; its folder is created now (a first launch makes a fresh profile)"
  fi
  for dir in "${write_dirs[@]}"; do
    run mkdir -p "$dir/$subdir"
    if $dry; then
      say "  would write: $dir/$subdir/shelltint.json"
    else
      printf '%s\n' "$manifest" > "$dir/$subdir/shelltint.json"
      say "✓ $label: registered the helper in $dir/$subdir"
    fi
    case "$dir" in "$HOME"/.var/app/*) flatpak_seen=true ;; esac
  done
done
$flatpak_seen && say "! Flatpak browsers can't run programs outside their sandbox by default; the helper may not start there."

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

cat <<EOF

Done. Now install the extension itself:
  Firefox-based browsers: https://addons.mozilla.org/firefox/addon/shelltint/
  Chromium-based browsers: chrome://extensions → Developer mode → Load unpacked
    → the unzipped shelltint-<version>-chromium.zip from
      https://github.com/Jazzmedo/ShellTint/releases/latest
    (its ID must show $CHROMIUM_ID)
Then restart the browser and open ShellTint's settings to check that the
helper is connected.
EOF
