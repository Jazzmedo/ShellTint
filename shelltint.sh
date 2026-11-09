#!/usr/bin/env bash
# ShellTint installer and uninstaller — the only script you need.
#
#   shelltint.sh                                              install (a picker asks which browsers)
#   shelltint.sh [--browsers LIST|all|auto|none]              install without the picker
#   shelltint.sh --uninstall [--purge]                        pick what to remove (--purge ticks cache and settings)
#   also: [--prefix DIR] [--no-build] [--dry-run] [--with-matugen-hook]
#
# One line, from anywhere (it downloads the repo to a temp folder itself):
#   curl -fsSL https://raw.githubusercontent.com/Jazzmedo/ShellTint/main/shelltint.sh | bash
#
# The install checks the tools it needs, downloads the repo when piped, detects
# the installed browsers (config folders, /opt, AppImages), opens a checklist
# to choose which ones to register, copies host/ and builder/ to
# ~/.local/share/shelltint, installs the builder's npm dependencies, and
# fetches and builds the website styles.
set -euo pipefail

# ─── Colours — the ShellTint "Dusk" palette ───
# violet #6A4FD8 · lilac #B8A4F4 · peach #F2A68A · cream #FBEBD8 · ink #15131C
# COLOR_MODE=auto (default) colours when output is a terminal; NO_COLOR=1 or
# COLOR_MODE=never turn it off.
COLOR_MODE=${COLOR_MODE:-auto}
[[ -n ${NO_COLOR:-} ]] && COLOR_MODE=never

st_set_colors() {
  local on=0
  case $COLOR_MODE in
    always) on=1 ;;
    never)  on=0 ;;
    *)      [[ -t 1 || -t 2 ]] && on=1 ;;
  esac
  if (( on )); then
    if [[ ${COLORTERM:-} == *truecolor* || ${COLORTERM:-} == *24bit* ]]; then
      C_VIOLET=$'\e[38;2;106;79;216m'; C_LILAC=$'\e[38;2;184;164;244m'
      C_PEACH=$'\e[38;2;242;166;138m'; C_CREAM=$'\e[38;2;251;235;216m'
    elif [[ ${TERM:-} == *256color* ]]; then
      C_VIOLET=$'\e[38;5;62m'; C_LILAC=$'\e[38;5;147m'
      C_PEACH=$'\e[38;5;216m'; C_CREAM=$'\e[38;5;230m'
    else
      C_VIOLET=$'\e[95m'; C_LILAC=$'\e[95m'; C_PEACH=$'\e[33m'; C_CREAM=$'\e[97m'
    fi
    C_OK=$'\e[38;5;114m'; C_GREY=$'\e[38;5;245m'; C_FAINT=$'\e[38;5;238m'
    C_DIM=$'\e[2m'; C_BOLD=$'\e[1m'; C_OFF=$'\e[0m'
  else
    C_VIOLET=""; C_LILAC=""; C_PEACH=""; C_CREAM=""
    C_OK=""; C_GREY=""; C_FAINT=""; C_DIM=""; C_BOLD=""; C_OFF=""
  fi
}
st_set_colors

ST_WIDTH=$(tput cols 2>/dev/null || true)
[[ $ST_WIDTH =~ ^[0-9]+$ ]] || ST_WIDTH=${COLUMNS:-80}

rule() { local r=""; printf -v r '%*s' "${1:-40}" ''; printf '%s' "${r// /─}"; }
step() { printf '\n%s▌ %s%s\n' "$C_VIOLET$C_BOLD" "$*" "$C_OFF"; }
say()  { printf '%s\n' "$*"; }
info() { printf '  %s→%s %s%s%s\n' "$C_FAINT" "$C_OFF" "$C_FAINT" "$*" "$C_OFF"; }
ok()   { printf '  %s✓%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '  %s▲%s %s\n' "$C_PEACH" "$C_OFF" "$*"; }
fail() { printf '\n  %s✘ %s%s\n' "$C_PEACH$C_BOLD" "$*" "$C_OFF" >&2; exit 1; }

_p_banner() {
  if (( UI_COMPACT )); then
    printf '  %s●●●●●%s %sShellTint%s\n' "$C_VIOLET" "$C_OFF" "$C_CREAM$C_BOLD" "$C_OFF"
    printf '  %s↑↓%s %sspace%s %senter%s %sq%s\n' \
      "$C_BOLD" "$C_OFF" "$C_BOLD" "$C_OFF" "$C_BOLD" "$C_OFF" "$C_BOLD" "$C_OFF"
  else
    printf '  %s●●●●●%s  %s%sShellTint%s\n' "$C_VIOLET" "$C_OFF" "$C_CREAM" "$C_BOLD" "$C_OFF"
    printf '  %s●● ●●%s  %syour desktop colours, in your browser%s\n\n' \
      "$C_LILAC" "$C_OFF" "$C_GREY" "$C_OFF"
    printf '  %s↑↓/jk%s move  %sspace%s tick  %sa%s all/none  %senter%s %s  %sq%s cancel\n' \
      "$C_BOLD" "$C_OFF" "$C_BOLD" "$C_OFF" "$C_BOLD" "$C_OFF" "$C_BOLD" "$C_OFF" "$UI_VERB" "$C_BOLD" "$C_OFF"
  fi
  printf '  %s%s%s\n' "$C_GREY" "$(rule $(( ST_WIDTH - 2 )))" "$C_OFF"
}

# ─── Browser registry ───
# One line per browser:
#   id|family|label|binaries|opt-dirs|config-dirs|appimage-globs
# - family: gecko browsers read <dir>/native-messaging-hosts, chromium read
#   <dir>/NativeMessagingHosts.
# - Dir tokens: @home@ ($HOME), @config@ (${XDG_CONFIG_HOME:-$HOME/.config}),
#   @var@ ($HOME/.var/app — Flatpak; only written when the app dir exists).
# - LibreWolf and Zen moved their data dir in newer builds, so they list both.
#   A Firefox-family fork opens an empty profile in its legacy folder (~/.zen)
#   whenever that exists, even if the data lives in ~/.config, so the installer
#   never creates one (see the registration loop).
# - Zen and Helium ship official AppImages, which use the same XDG dirs as
#   native installs, so one manifest covers both.
# - DuckDuckGo has no Linux browser (as of 2026-11), so it has no entry.
#
# CHROMIUM_ID is pinned by the public key in scripts/package.sh; the Chromium
# native-messaging manifest allows chrome-extension://$CHROMIUM_ID/.
CHROMIUM_ID=paiglabcdaphmocanlbnikkipilidmfk

st_browser_table=(
  "firefox|gecko|Firefox|firefox firefox-bin|/usr/lib/firefox /opt/firefox|@home@/.mozilla @var@/org.mozilla.firefox/.mozilla|"
  "zen|gecko|Zen|zen zen-browser|/opt/zen|@config@/zen @home@/.zen @var@/app.zen_browser.zen/.zen|zen-*.AppImage zen-*.appimage zen.*.appimage"
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
    others=$(ls -A "$dir" 2>/dev/null | command grep -ivE 'messaging-?hosts' || true)
    [[ -n $others ]]
}

# "in use" = a profile exists and the browser itself is here (binary, /opt,
# AppImage or Flatpak app). A profile with no browser, left behind after it was
# removed, is "data only": listed, but never pre-ticked or picked by --browsers auto.
st_browser_where() {
    local line="$1" dir binary found pattern id how="" used=false
    for dir in $(st_browser_config_dirs "$line"); do
        if st_browser_dir_in_use "$dir"; then used=true; fi
        case "$dir" in "$HOME"/.var/app/*)
            id="${dir#"$HOME"/.var/app/}"; id="${id%%/*}"
            if [[ -d $HOME/.var/app/$id && ( -d /var/lib/flatpak/app/$id || -d $HOME/.local/share/flatpak/app/$id ) ]]; then
                how="Flatpak"
            fi ;;
        esac
    done
    if [[ -z $how ]]; then
        for binary in $(st_browser_field "$line" 3); do
            if command -v "$binary" >/dev/null 2>&1; then how="in PATH"; break; fi
        done
    fi
    if [[ -z $how ]]; then
        for dir in $(st_browser_field "$line" 4); do
            if [[ -d $dir ]]; then how="under /opt"; break; fi
        done
    fi
    if [[ -z $how ]]; then
        for binary in $(st_browser_field "$line" 3); do
            found=$(find "$st_opt_dir" -maxdepth 3 -type f -name "$binary" -print -quit 2>/dev/null)
            if [[ -n $found ]]; then how="under /opt"; break; fi
        done
    fi
    if [[ -z $how ]]; then
        for dir in $st_appimage_dirs; do
            for pattern in $(st_browser_field "$line" 6); do
                found=$(find "$dir" -maxdepth 2 -iname "$pattern" -print -quit 2>/dev/null)
                if [[ -n $found ]]; then how="as AppImage"; break 2; fi
            done
        done
    fi
    if $used; then
        if [[ -n $how ]]; then printf 'in use'; else printf 'data only'; fi
        return
    fi
    [[ -n $how ]] || return 1
    printf '%s' "$how"
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

run() { if $dry; then printf '  %swould run:%s %s\n' "$C_FAINT" "$C_OFF" "$*"; else "$@"; fi; }

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
    # 2>/dev/null first: a missing /dev/tty must fail silently
    read -r -t 120 -p "$1" reply 2>/dev/null </dev/tty || true
  fi
  printf '%s' "$reply"
}

# Parallel arrays the picker (and the numbered fallback) render from.
declare -a P_LABEL P_FAMILY P_WHERE P_DIR
declare -A P_SEL=()

# --- the checklist (fedora-nothing style, Dusk colours) ---
UI_ROWS=(); UI_BODY=(); UI_CURSOR=0; UI_SCROLL=0; UI_CURSOR_LINE=0
UI_ALTSCREEN=0; UI_COMPACT=0; UI_STTY=""; P_TTY_FD=0
UI_VERB=register; UI_LEGEND='✓ in use   ~ never run   · data only'   # the uninstall changes both

# One fd for every touch of the terminal: stdin when it is the tty, /dev/tty
# otherwise (the curl | bash case, where stdin is the install pipe).
_p_use_tty() {
  if [[ -t 0 ]]; then P_TTY_FD=0
  elif [[ -r /dev/tty ]]; then exec 3</dev/tty; P_TTY_FD=3
  else return 1; fi
}

_p_group_label() {
  case $1 in gecko) printf 'Firefox-based' ;; files) printf 'ShellTint files' ;; *) printf 'Chromium-based' ;; esac
}

_p_build_rows() {
  UI_ROWS=()
  local fam i added
  for fam in gecko chromium files; do
    added=0
    for i in "${!P_FAMILY[@]}"; do
      [[ ${P_FAMILY[i]} == "$fam" ]] || continue
      if (( ! added )); then UI_ROWS+=("group:$fam"); added=1; fi
      UI_ROWS+=("item:$i")
    done
  done
}

_p_first_item() {
  local r
  for r in "${!UI_ROWS[@]}"; do
    [[ ${UI_ROWS[r]} == item:* ]] && { printf '%s' "$r"; return; }
  done
  printf '0'
}

_p_move() {
  local dir=$1 n=${#UI_ROWS[@]} r=$UI_CURSOR
  while :; do
    r=$(( r + dir ))
    (( r < 0 || r >= n )) && return
    [[ ${UI_ROWS[r]} == item:* ]] && { UI_CURSOR=$r; return; }
  done
}

_p_enter_screen() {
  UI_STTY=$(stty -g <&"$P_TTY_FD" 2>/dev/null) || UI_STTY=""
  stty -echo <&"$P_TTY_FD" 2>/dev/null || true
  local seq
  seq=$(tput smcup 2>/dev/null) || seq=""
  if [[ -n $seq ]]; then UI_ALTSCREEN=1; printf '%s' "$seq"; else UI_ALTSCREEN=0; fi
  tput clear 2>/dev/null || true
  tput civis 2>/dev/null || true
}

_p_leave_screen() {
  # Traps are global once set; without this, every later function return
  # would run the cleanup again and wipe the screen.
  trap - RETURN INT
  [[ -n $UI_STTY ]] && { stty "$UI_STTY" <&"$P_TTY_FD" 2>/dev/null || true; UI_STTY=""; }
  tput cnorm 2>/dev/null || true
  if (( UI_ALTSCREEN )); then tput rmcup 2>/dev/null || true; else tput clear 2>/dev/null || true; fi
  UI_ALTSCREEN=0
}

# Read one key, expanding escape sequences to names.
_p_key() {
  local k rest
  IFS= read -rsn1 -u "$P_TTY_FD" k || return 1
  if [[ $k == $'\e' ]]; then
    rest=""
    IFS= read -rsn2 -t 0.01 -u "$P_TTY_FD" rest || rest=""
    case $rest in
      '[A') printf 'up' ;;
      '[B') printf 'down' ;;
      *)    printf 'esc' ;;
    esac
    return
  fi
  case $k in
    '')  printf 'enter' ;;
    ' ') printf 'space' ;;
    *)   printf '%s' "$k" ;;
  esac
}

_p_body() {
  UI_BODY=()
  UI_CURSOR_LINE=0
  local r row i line mark badge name desc pad g
  for r in "${!UI_ROWS[@]}"; do
    row=${UI_ROWS[r]}
    if [[ $row == group:* ]]; then
      UI_BODY+=("")
      printf -v line '  %s%s%s' "$C_LILAC$C_BOLD" "$(_p_group_label "${row#group:}")" "$C_OFF"
      UI_BODY+=("$line")
      continue
    fi
    i=${row#item:}
    name=${P_LABEL[i]}
    # $i in the subscript: assoc reads take the subscript literally otherwise
    if [[ -n ${P_SEL[$i]:-} ]]; then
      mark="$C_VIOLET[x]$C_OFF"
    else
      mark="[ ]"
    fi
    case ${P_WHERE[i]} in
      "in use")    badge="$C_OK✓$C_OFF" ;;
      "data only") badge="$C_GREY·$C_OFF" ;;
      *)           badge="$C_PEACH~$C_OFF" ;;
    esac
    desc=${P_DIR[i]}
    # Everything left of the description is 13 columns plus the padded name.
    # A line that overflows the terminal wraps, and one wrapped line pushes
    # the frame off the top of the screen on the next repaint.
    local nlen=${#name}
    (( nlen < 20 )) && nlen=20
    printf -v pad '%*s' $(( 20 - ${#name} )) ''
    local descmax=$(( ST_WIDTH - 13 - nlen ))
    if (( descmax < 8 )); then
      desc=""
    elif (( ${#desc} > descmax )); then
      desc="${desc:0:$(( descmax - 1 ))}…"
    fi
    if (( r == UI_CURSOR )); then
      printf -v line '  %s❯%s %s %s %s%s%s%s %s%s%s' \
        "$C_VIOLET" "$C_OFF" "$mark" "$badge" "$C_BOLD" "$name" "$C_OFF" "$pad" "$C_GREY" "$desc" "$C_OFF"
      UI_CURSOR_LINE=${#UI_BODY[@]}
    else
      printf -v line '    %s %s %s%s %s%s%s' \
        "$mark" "$badge" "$name" "$pad" "$C_GREY" "$desc" "$C_OFF"
    fi
    UI_BODY+=("$line")
  done
}

# Two lines, always, so the body window keeps a fixed height.
_p_footer() {
  local total=$1 view=$2 n=0 i hint=""
  for i in "${!P_WHERE[@]}"; do
    [[ -n ${P_SEL[$i]:-} ]] && n=$(( n + 1 ))
  done
  if (( total > view )); then
    local up=" " down=" "
    (( UI_SCROLL > 0 ))            && up="↑"
    (( UI_SCROLL + view < total )) && down="↓"
    printf -v hint '   %s%s%s more%s' "$C_GREY" "$up" "$down" "$C_OFF"
  fi
  printf '\033[K\n'
  printf '  %s%s%s\033[K\n' "$C_GREY" "$(rule $(( ST_WIDTH - 2 )))" "$C_OFF"
  # No trailing newline: printing one on the last row scrolls the whole screen
  # up by a line, and the banner would creep off the top on every keypress.
  local legend=$UI_LEGEND
  (( ST_WIDTH < 60 )) && legend=''
  printf '  %s%d selected%s   %s%s%s%s\033[K' \
    "$C_BOLD" "$n" "$C_OFF" "$C_GREY" "$legend" "$C_OFF" "$hint"
}

# Repaint from the home position rather than clearing first, so nothing
# scrolls and the frame stays put.
_p_render() {
  _p_body
  local h view total hh
  h=$(tput lines 2>/dev/null) || h=""
  [[ $h =~ ^[0-9]+$ ]] || h=${LINES:-24}
  (( h < 10 )) && h=10
  UI_COMPACT=0; hh=5
  if (( h < 20 )); then UI_COMPACT=1; hh=3; fi
  view=$(( h - hh - 2 ))
  (( view < 3 )) && view=3
  total=${#UI_BODY[@]}
  # Keep the cursor inside the window, with one line of context either side.
  if (( total <= view )); then
    UI_SCROLL=0
    view=$total
  else
    (( UI_CURSOR_LINE - 1 < UI_SCROLL ))        && UI_SCROLL=$(( UI_CURSOR_LINE - 1 ))
    (( UI_CURSOR_LINE + 2 > UI_SCROLL + view )) && UI_SCROLL=$(( UI_CURSOR_LINE + 2 - view ))
    (( UI_SCROLL > total - view )) && UI_SCROLL=$(( total - view ))
    (( UI_SCROLL < 0 )) && UI_SCROLL=0
  fi
  printf '\033[H'
  _p_banner
  local j
  for (( j = UI_SCROLL; j < UI_SCROLL + view; j++ )); do
    if (( j < total )); then
      printf '%s\033[K\n' "${UI_BODY[j]}"
    else
      printf '\033[K\n'
    fi
  done
  _p_footer "$total" "$view"
  printf '\033[J'
}

# The checklist. Returns non-zero only when the terminal went away.
_p_select() {
  _p_build_rows
  UI_CURSOR=$(_p_first_item)
  UI_SCROLL=0
  _p_enter_screen
  trap '_p_leave_screen' RETURN
  trap '_p_leave_screen; exit 130' INT
  while :; do
    _p_render
    local key
    key=$(_p_key) || break
    local i=${UI_ROWS[$UI_CURSOR]#item:}
    case $key in
      up|k)  _p_move -1 ;;
      down|j) _p_move 1 ;;
      g)     UI_CURSOR=$(_p_first_item) ;;
      G)     local r
             for r in "${!UI_ROWS[@]}"; do
               [[ ${UI_ROWS[r]} == item:* ]] && UI_CURSOR=$r
             done ;;
      space) if [[ -n ${P_SEL[$i]:-} ]]; then unset "P_SEL[$i]"; else P_SEL[$i]=1; fi ;;
      a)     local any_off=0 j
             for j in "${!P_WHERE[@]}"; do
               [[ -z ${P_SEL[$j]:-} ]] && any_off=1
             done
             for j in "${!P_WHERE[@]}"; do
               if (( any_off )); then P_SEL[$j]=1; else unset "P_SEL[$j]"; fi
             done ;;
      enter) return 0 ;;
      q|esc) _p_leave_screen; fail "aborted by the user" ;;
    esac
  done
}

_tui_available() {
  [[ -t 1 ]] || return 1
  command -v tput >/dev/null 2>&1 || return 1
  [[ ${TERM:-} != dumb ]] || return 1
  [[ -t 0 || -r /dev/tty ]] || return 1
  return 0
}

# ─── Uninstall ───
# Lists what ShellTint put on this computer and lets you tick what to remove.
# Without a terminal it removes the defaults: the helper and every browser
# registration, plus the cache and settings only with --purge.
if $uninstall; then
  step "ShellTint uninstall"
  declare -a U_KIND=()
  u_add() {  # kind label group path on|off
    P_LABEL+=("$2"); P_FAMILY+=("$3"); P_WHERE+=("in use"); P_DIR+=("${4/#$HOME/\~}")
    [[ $5 == on ]] && P_SEL[${#U_KIND[@]}]=1
    U_KIND+=("$1")
  }
  # One row per browser that has our manifest. Firefox-based browsers (Zen,
  # Floorp...) also share ~/.mozilla/native-messaging-hosts, so each one that is
  # installed gets a row when that manifest exists, even with none of its own.
  shared="$HOME/.mozilla/native-messaging-hosts/shelltint.json"
  declare -a SHARED_USERS=()
  for line in "${st_browser_table[@]}"; do
    id="$(st_browser_field "$line" 0)"; family="$(st_browser_field "$line" 1)"
    subdir="$(st_manifest_subdir "$line")"
    own=""
    for dir in $(st_browser_config_dirs "$line"); do
      [[ $dir == "$HOME/.mozilla" ]] && continue
      [ -f "$dir/$subdir/shelltint.json" ] && { own="$dir/$subdir"; break; }
    done
    uses_shared=false
    if [[ $family == gecko && -f $shared ]] && { [[ $id == firefox ]] || { where="$(st_browser_where "$line")" && [[ $where != "data only" ]]; }; }; then
      uses_shared=true; SHARED_USERS+=("${#U_KIND[@]}")
    fi
    if [[ -n $own ]] || $uses_shared; then
      u_add "browser:$id" "$(st_browser_field "$line" 2)" "$family" "${own:-$HOME/.mozilla/native-messaging-hosts (shared)}" on
    fi
  done
  cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/shelltint"
  config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/shelltint"
  purge_state=off; $purge && purge_state=on
  [ -d "$prefix" ] && u_add "dir:$prefix" "Helper" files "$prefix" on
  [ -d "$cache_dir" ] && u_add "dir:$cache_dir" "Styles and cache" files "$cache_dir" "$purge_state"
  [ -d "$config_dir" ] && u_add "dir:$config_dir" "Settings & sites" files "$config_dir" "$purge_state"
  if ((${#U_KIND[@]} == 0)); then info "Nothing of ShellTint found."; exit 0; fi

  UI_VERB=remove; UI_LEGEND='✓ found on this computer'
  if _tui_available && _p_use_tty; then
    _p_select
    if (( P_TTY_FD != 0 )); then exec 3<&-; P_TTY_FD=0; fi
  fi

  removed=0
  for i in "${!U_KIND[@]}"; do
    [[ -n ${P_SEL[$i]:-} ]] || continue
    removed=$(( removed + 1 ))
    case ${U_KIND[i]} in
      browser:*)
        line="$(line_of "${U_KIND[i]#browser:}")"
        subdir="$(st_manifest_subdir "$line")"
        for dir in $(st_browser_config_dirs "$line"); do
          [[ $dir == "$HOME/.mozilla" ]] && continue      # shared, handled after the loop
          if [ -f "$dir/$subdir/shelltint.json" ]; then
            run rm -f "$dir/$subdir/shelltint.json"
            $dry || ok "removed $dir/$subdir/shelltint.json"
          fi
          # An empty ~/.zen would still make Zen open an empty profile; rmdir keeps anything non-empty.
          $dry || rmdir "$dir/$subdir" "$dir" 2>/dev/null || true
        done ;;
      dir:*)
        run rm -rf "${U_KIND[i]#dir:}"
        $dry || ok "removed ${U_KIND[i]#dir:}" ;;
    esac
  done
  # The shared manifest goes only when every browser using it is ticked.
  ticked=(); kept=()
  for i in "${SHARED_USERS[@]}"; do
    if [[ -n ${P_SEL[$i]:-} ]]; then ticked+=("${P_LABEL[i]}"); else kept+=("${P_LABEL[i]}"); fi
  done
  if ((${#ticked[@]})); then
    if ((${#kept[@]})); then
      printf -v kept_list '%s, ' "${kept[@]}"
      info "Kept ~/.mozilla/native-messaging-hosts/shelltint.json: ${kept_list%, } still uses it."
    else
      run rm -f "$shared"
      $dry || { ok "removed $shared"; rmdir "${shared%/*}" "${shared%/*/*}" 2>/dev/null || true; }
    fi
  fi
  if (( removed == 0 )); then info "Nothing selected; nothing removed."
  else $dry || ok "Done. Remove the extension from the browser's Add-ons page."; fi
  exit 0
fi

# ─── Hello ───
printf '  %s●●●●●%s  %s%sShellTint%s\n' "$C_VIOLET" "$C_OFF" "$C_CREAM" "$C_BOLD" "$C_OFF"
printf '  %s●● ●●%s  %syour desktop colours, in your browser%s\n\n' \
  "$C_LILAC" "$C_OFF" "$C_GREY" "$C_OFF"

# ─── Repo: this checkout, or a download when piped ───
script_file="${BASH_SOURCE[0]:-}"
if [[ -n $script_file && -f $script_file && -d "$(dirname "$script_file")/host" ]]; then
  repo="$(cd "$(dirname "$script_file")" && pwd)"
else
  command -v curl >/dev/null || fail "curl is required (or run this from a ShellTint checkout)"
  tmp_repo="$(mktemp -d)"
  trap 'rm -rf "$tmp_repo"' EXIT
  info "Downloading ShellTint…"
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
step "Preflight"
missing=0
python="$(command -v python3 || true)"
if [ -z "$python" ] || ! "$python" -c 'import sys; sys.exit(sys.version_info < (3, 8))'; then
  warn "Python 3.8 or newer is required: $(hint python3 python3 python)"; missing=1
fi
node="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -n 1 || true)"
[ -x "$node" ] || node="$(command -v node || true)"
if [ -z "$node" ] || [ "$("$node" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  warn "Node.js 18 or newer is required: $(hint 'nodejs npm' 'nodejs npm' 'nodejs npm')"; missing=1
fi
npm="$(dirname "${node:-/nonexistent}")/npm"
[ -x "$npm" ] || npm="$(command -v npm || true)"
[ -n "$npm" ] || { warn "npm is required: $(hint npm npm npm)"; missing=1; }
command -v curl >/dev/null || { warn "curl is required: $(hint curl curl curl)"; missing=1; }
command -v flock >/dev/null || { warn "flock is required: $(hint util-linux util-linux util-linux)"; missing=1; }
[ "$missing" -eq 0 ] || fail "install the missing tools above, then run this again"
ok "python3, node $("$node" -v), npm, curl and flock found"

# ─── Which browsers to register ───
# Detection (config folders, PATH, /opt, AppImages) comes from the registry above.
printf '  %sChecking which browsers are installed…%s\n' "$C_GREY" "$C_OFF"
declare -a DETECT_IDS DETECT_WHERE
while read -r id where; do
  [[ -n $id ]] || continue
  DETECT_IDS+=("$id"); DETECT_WHERE+=("$where")
done < <(st_browser_detect_all)
((${#DETECT_IDS[@]})) || fail "no supported browser found (edit the registry at the top of this script to add yours)"

for i in "${!DETECT_IDS[@]}"; do
  line="$(line_of "${DETECT_IDS[$i]}")"
  P_LABEL+=("$(st_browser_field "$line" 2)")
  P_FAMILY+=("$(st_browser_field "$line" 1)")
  P_WHERE+=("${DETECT_WHERE[$i]}")
  d="$(st_browser_config_dirs "$line")"; d="${d%%$'\n'*}"
  P_DIR+=("${d/#$HOME/\~}")
  [[ ${DETECT_WHERE[$i]} == "in use" ]] && P_SEL[$i]=1
done

declare -a SELECTED=()

# One plan line, wrapped under a fixed-width label so a long browser list
# does not run off the side of a narrow terminal. Items are comma-separated:
# browser labels contain spaces ("Google Chrome Dev"), so wrapping on
# whitespace ran them into each other.
_plan_row() {
  local label=$1 value=$2
  local indent=13
  local width=$(( ST_WIDTH - indent ))
  (( width < 24 )) && width=24
  local -a items=()
  local IFS=,
  read -ra items <<< "$value"
  unset IFS
  local first=1 line="" item
  _emit() {
    if (( first )); then
      printf '  %s%-9s%s  %s\n' "$C_GREY" "$label" "$C_OFF" "$1"
      first=0
    else
      printf '%*s%s\n' "$indent" '' "$1"
    fi
  }
  for item in "${items[@]}"; do
    item=${item#"${item%%[![:space:]]*}"}          # strip the leading space
    [[ -n $item ]] || continue
    if [[ -n $line ]] && (( ${#line} + ${#item} + 2 > width )); then
      _emit "$line,"
      line=$item
    else
      line="${line:+$line, }$item"
    fi
  done
  _emit "${line:-none}"
  unset -f _emit
}

show_plan() {
  local labels=() i
  for i in "${!SELECTED[@]}"; do
    labels+=("$(st_browser_field "$(line_of "${SELECTED[i]}")" 2)")
  done
  local colour_line="chosen in ShellTint's settings later"
  if [ -n "$python" ]; then
    detect_out="$("$python" "$repo/host/shelltint_palette.py" detect 2>/dev/null || true)"
    [[ -n $detect_out ]] && colour_line="${detect_out%%$'\n'*}"
  fi
  local styles_line="fetched and built (about a minute)"
  $build || styles_line="skipped (--no-build)"
  $dry && styles_line="nothing — dry run"
  printf '\n  %sHere is what will happen%s\n\n' "$C_BOLD" "$C_OFF"
  _plan_row "Helper"  "${prefix/#$HOME/\~}"
  _plan_row "Register" "$(_join_comma "${labels[@]+"${labels[@]}"}")"
  _plan_row "Colours" "$colour_line"
  _plan_row "Styles"  "$styles_line"
}

_join_comma() {
  local out="" item
  for item in "$@"; do out="${out:+$out, }$item"; done
  printf '%s' "${out:-nothing — the manifests stay as they are}"
}

use_tui=false
if [[ -z $browsers_arg && -z ${SHELLTINT_ANSWER:-} ]] && _tui_available; then
  use_tui=true
fi

if [[ -n $browsers_arg ]]; then
  case "$browsers_arg" in
    none) info "Browser registration skipped (--browsers none)" ;;
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
  while :; do
    SELECTED=()
    if $use_tui; then
      _p_use_tty || use_tui=false
      if $use_tui; then
        _p_select
        for i in "${!DETECT_IDS[@]}"; do
          [[ -n ${P_SEL[$i]:-} ]] && SELECTED+=("${DETECT_IDS[i]}")
        done
        if (( P_TTY_FD != 0 )); then exec 3<&-; P_TTY_FD=0; fi
      fi
    fi
    if ! $use_tui; then
      # Numbered fallback: a dumb terminal, or the SHELLTINT_ANSWER test hook.
      say ""
      say "Detected browsers:"
      in_use_indexes=()
      for i in "${!DETECT_IDS[@]}"; do
        case ${P_WHERE[i]} in
          "in use")    mark="$C_OK✓$C_OFF" ;;
          "data only") mark="$C_GREY·$C_OFF" ;;
          *)           mark="$C_PEACH~$C_OFF" ;;
        esac
        printf '  %2d) %s%-20s%s %s %s(%s)%s  %s\n' \
          "$((i + 1))" "$C_BOLD" "${P_LABEL[i]}" "$C_OFF" "$mark" "$C_GREY" "${P_WHERE[i]}" "$C_OFF" "${P_DIR[i]}"
        [[ ${P_WHERE[i]} == "in use" ]] && in_use_indexes+=("$((i + 1))")
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
        warn "pick numbers from the list, 'a' for all, or press Enter"
      done
    fi
    show_plan
    reply="$(ask "Look good? [Y/n] ")"
    [[ -z ${SHELLTINT_ANSWER:-} ]] || unset SHELLTINT_ANSWER
    case "${reply:-y}" in
      [Nn]*) ;;
      *) break ;;
    esac
    $use_tui || fail "aborted by the user"
  done
fi
if ((${#SELECTED[@]})); then
  printf '\n  Registering the helper for: %s%s%s\n' "$C_VIOLET$C_BOLD" "${SELECTED[*]}" "$C_OFF"
else
  info "No browsers selected; the manifests stay as they are."
fi

# ─── Files ───
step "Helper"
info "Installing into $prefix"
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
  info "Installing the builder's npm packages"
  run env PATH="$(dirname "$node"):$PATH" "$npm" ci --omit=dev --no-audit --no-fund --prefix "$prefix/builder"
fi

# ─── Native messaging manifests ───
# Gecko browsers allow extensions by id; Chromium browsers allow them by
# origin, and the origin is pinned by the key in scripts/package.sh.
step "Browsers"
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
  # Write the folders that exist. Gecko forks never get a folder of their own
  # created: Zen and LibreWolf open an empty profile in ~/.zen / ~/.librewolf
  # whenever it exists, hiding the real data in ~/.config. They also read
  # Firefox's shared ~/.mozilla/native-messaging-hosts, so that one is always
  # written. Chromium has a single data dir, so its first one is created.
  declare -a write_dirs=() stubs=()
  first_native=""
  in_use=false
  for dir in $(st_browser_config_dirs "$line"); do
    case "$dir" in
      "$HOME"/.var/app/*)
        appdir="${dir#"$HOME"/.var/app/}"        # <app-id>/<rest>
        appdir="$HOME/.var/app/${appdir%%/*}"
        [[ -d $appdir ]] || continue ;;          # Flatpak not installed
      :|"") continue ;;
    esac
    [[ -z $first_native ]] && first_native="$dir"
    [[ -d $dir ]] || continue
    if st_browser_dir_in_use "$dir"; then
      in_use=true
    elif [[ $family == gecko && $dir != "$HOME/.mozilla" ]]; then
      stubs+=("$dir"); continue
    fi
    write_dirs+=("$dir")
  done
  if [[ $family == gecko ]]; then
    for dir in "${stubs[@]}"; do
      if $in_use; then
        # Left by an older installer next to the real data; rmdir keeps anything non-empty.
        run rm -f "$dir/$subdir/shelltint.json"
        run rmdir "$dir/$subdir" "$dir" 2>/dev/null || true
      else
        write_dirs+=("$dir")
      fi
    done
    ((${#write_dirs[@]})) ||
      warn "$label has no data folder yet; registering in ~/.mozilla/native-messaging-hosts only. Open it once and run this installer again if the helper doesn't connect."
    [[ " ${write_dirs[*]} " == *" $HOME/.mozilla "* ]] || write_dirs+=("$HOME/.mozilla")
  elif ((${#write_dirs[@]} == 0)); then
    write_dirs=("$first_native")
  fi
  for dir in "${write_dirs[@]}"; do
    run mkdir -p "$dir/$subdir"
    if $dry; then
      info "would write: $dir/$subdir/shelltint.json"
    else
      printf '%s\n' "$manifest" > "$dir/$subdir/shelltint.json"
      ok "$label: registered the helper in $dir/$subdir"
    fi
    case "$dir" in "$HOME"/.var/app/*) flatpak_seen=true ;; esac
  done
done
$flatpak_seen && warn "Flatpak browsers can't run programs outside their sandbox by default; the helper may not start there."

# ─── Colours and styles ───
step "Colours and styles"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/shelltint"
run mkdir -p "$cache" "${XDG_CONFIG_HOME:-$HOME/.config}/shelltint"
info "Colour sources on this computer:"
if ! $dry; then
  "$python" "$prefix/host/shelltint_palette.py" detect || warn "No supported shell colours found yet. Choose a source in ShellTint's settings."
fi
if $build; then
  info "Fetching Catppuccin userstyles and building website styles (about a minute)…"
  run bash "$prefix/builder/scripts/update.sh" --now
  if ! $dry; then
    if [ -e "$cache/userstyles/current/index.json" ]; then
      ok "website styles built"
    else
      warn "Styles weren't built yet; see $cache/build.log. They build when the browser connects."
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

printf '\n%s●●●●●%s  %sDone%s — now install the extension itself:\n' "$C_VIOLET" "$C_OFF" "$C_CREAM$C_BOLD" "$C_OFF"
cat <<EOF
  Firefox-based browsers: https://addons.mozilla.org/firefox/addon/shelltint/
  Chromium-based browsers: chrome://extensions → Developer mode → Load unpacked
    → the unzipped shelltint-<version>-chromium.zip from
      https://github.com/Jazzmedo/ShellTint/releases/latest
    (its ID must show $CHROMIUM_ID)
Then restart the browser and open ShellTint's settings to check that the
helper is connected.
EOF
