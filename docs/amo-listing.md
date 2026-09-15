# addons.mozilla.org listing

Copy these fields into the submission form at
https://addons.mozilla.org/developers/addon/submit/distribution

## Upload

- Distribution: **On this site**
- File: `dist/shelltint-1.0.0.zip` (build it with `./scripts/package.sh`)
- Platforms: all (the helper only works on Linux; the description says so)
- Source code: **No**. The package is plain, unminified JavaScript with no build step.

## Describe the add-on

**Name**

ShellTint

**Add-on URL**

shelltint

**Summary** (250 characters max)

Colours the browser and 130+ websites with your Linux desktop shell's palette: DankMaterialShell, Caelestia, Noctalia, end-4 or any matugen output. Follows light and dark automatically. Needs the free ShellTint helper.

**Description**

ShellTint makes the browser match your Linux desktop. It reads the Material You palette your shell generates from your wallpaper, colours the toolbar, tabs and menus with it, and restyles more than 130 websites, including YouTube, GitHub, Reddit and Wikipedia, using Catppuccin's userstyles recoloured with your palette.

When the shell changes theme, the browser and open tabs follow within seconds, without reloading.

<b>Supported shells</b>
• DankMaterialShell
• Caelestia
• Noctalia
• end-4 illogical-impulse
• Any matugen output file (JSON or CSS variables)

<b>Features</b>
• Tonal or vivid toolbar colours
• Light and dark follow the shell, or can be forced
• Pause styling on a single site from the toolbar button
• Style your own SearXNG instances
• My styles: write your own CSS for any site, like Stylus, using your shell colours as CSS variables
• Automatic rebuilds when your palette or Catppuccin's styles change

<b>Requirements</b>
ShellTint needs its companion helper, which reads your shell's colour files. It runs on Linux with Python 3.8+, Node.js 18+, curl and flock. Install it with:

git clone https://github.com/Jazzmedo/ShellTint
cd ShellTint
./scripts/install.sh

Then allow ShellTint to access all websites (Add-ons → ShellTint → Permissions) so it can style them.

<b>Privacy</b>
ShellTint collects no data. The extension only talks to the helper on your computer. The helper's only network use is downloading Catppuccin's public userstyles.

Based on MatugenFox by Ubaid (MIT). Website styles by Catppuccin (MIT).

**Categories**

Appearance

**Tags**

theme, dark mode, linux, material you, catppuccin

**Support email**

(optional; leave empty or use your own)

**Support website**

https://github.com/Jazzmedo/ShellTint/issues

**License**

MIT License

**Privacy policy**

Not required, because nothing is collected. To show one anyway, paste `PRIVACY.md`.

**Notes to reviewer**

Paste `docs/amo-review-notes.md`.

## Version notes (1.0.0)

First release of ShellTint.
