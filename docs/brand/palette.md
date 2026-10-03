# ShellTint palette — "Dusk Wallpaper"

Tonal steps pulled from one dusk wallpaper, cool violet to warm cream.

| Role | Name | Hex | RGB | Use |
| --- | --- | --- | --- | --- |
| Base | Shell Ink | `#15131C` | 21, 19, 28 | Background, icon tile |
| Primary | Tint Violet | `#6A4FD8` | 106, 79, 216 | Spiral core, main brand colour |
| Secondary | Lilac Glow | `#B8A4F4` | 184, 164, 244 | Second band, highlights |
| Accent | Wallpaper Peach | `#F2A68A` | 242, 166, 138 | Third band, warm accent |
| Light | Paper Cream | `#FBEBD8` | 251, 235, 216 | Outer band, toolbar strip, text on dark |

Lilac, peach and cream are readable on Shell Ink; violet is for fills, not small text on it.

```css
:root {
  --shell-ink: #15131c;
  --tint-violet: #6a4fd8;
  --lilac-glow: #b8a4f4;
  --wallpaper-peach: #f2a68a;
  --paper-cream: #fbebd8;
}
```

Plain hex list: [`palette.hex`](palette.hex) (Lospec / Aseprite / Krita format).
