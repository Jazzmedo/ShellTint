# Chromium-based browsers, sourced by install.sh and uninstall.sh.
#
# CHROMIUM_ID is pinned by the public key in scripts/package.sh. When ShellTint
# is in the Chrome Web Store, add the store's ID to allowed_origins in install.sh.
CHROMIUM_ID=paiglabcdaphmocanlbnikkipilidmfk

config="${XDG_CONFIG_HOME:-$HOME/.config}"
# Each browser's config folder; the helper's manifest goes in its NativeMessagingHosts.
CHROMIUM_DIRS=(
  "$config/chromium"
  "$config/google-chrome"
  "$config/google-chrome-beta"
  "$config/google-chrome-unstable"
  "$config/BraveSoftware/Brave-Browser"
  "$config/vivaldi"
  "$config/microsoft-edge"
  "$config/net.imput.helium"
  "$HOME/.var/app/org.chromium.Chromium/config/chromium"
  "$HOME/.var/app/com.google.Chrome/config/google-chrome"
  "$HOME/.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser"
  "$HOME/.var/app/com.vivaldi.Vivaldi/config/vivaldi"
  "$HOME/.var/app/com.microsoft.Edge/config/microsoft-edge"
)
unset config
