# Adding a palette source

A palette source (adapter) teaches the helper to read one shell's colour file. Each adapter is a small Python module that turns the file into Material 3 roles in snake_case. Everything else (mode handling, the normalised `palette.json`, rebuilds, the toolbar theme) is shared.

## 1. Write the adapter

Create `host/shelltint/sources/<id>.py` implementing `Source` from `host/shelltint/sources/base.py`:

```python
from pathlib import Path

from ..colors import normalise_roles
from .base import ParsedPalette, Source, SourceError


class ExampleShell(Source):
    id = "example"
    label = "Example Shell"

    def candidates(self, settings) -> list[Path]:
        """Files to try, most likely first."""
        return [Path.home() / ".local/state/example/colors.json"]

    def mode_hint(self, settings) -> str | None:
        """'dark', 'light', or None when the shell does not say."""
        return None

    def watch_paths(self, settings) -> list[Path]:
        """Files whose changes should trigger a rebuild (palette and mode files)."""
        return self.candidates(settings)

    def parse(self, path: Path, settings) -> ParsedPalette:
        data = ...  # read and decode the file
        roles = normalise_roles(data["colors"])
        if not roles:
            raise SourceError("no colours in the file")
        return ParsedPalette(
            mode=data.get("mode"),        # or self.mode_hint(settings)
            variants={"dark": roles},     # 'dark' and/or 'light'
            extras={},                    # optional, e.g. a terminal palette
            warnings=[],
        )
```

Rules:

- Use `colors.normalise_roles`. It converts camelCase to snake_case, strips `m`, `m3`, `mg-`, `--` and `md-sys-color-` prefixes, accepts `#rgb`, `#rrggbb`, hex without `#` and `rgb()`, and drops values that are not colours.
- Required roles, after normalisation: `primary`; `surface` or `background`; `on_surface` or `on_background`. Missing required roles must raise `SourceError`.
- Raise `SourceError` with a short, readable reason (it is shown on the Colours page). Never return a partial palette silently; add a warning for anything you had to derive.
- Respect XDG variables (`XDG_STATE_HOME`, `XDG_CONFIG_HOME`) and the shell's own overrides when listing candidates.
- Do not write to the shell's files.

## 2. Register it

In `host/shelltint/sources/__init__.py`, add the class to `REGISTRY` and its id to `AUTO_ORDER` at the position auto-detection should try it. Put generic sources (such as the matugen file) last.

## 3. Test it

- Add a real-world sample under `host/tests/fixtures/<id>/`, taken from the shell's writer code or an actual file (no personal paths).
- Add tests to `host/tests/test_sources.py`: the fixture parses, required roles are present in snake_case, the mode is right, and a broken file raises `SourceError`.
- Tests must point `HOME` (and XDG variables) at a temporary directory.

```sh
python3 -m unittest discover -s host/tests
```

## 4. Expose it

Add the id to the extension's source list (the `paletteSource` values in `extension/shared/defaults.js` and the Colours page) and a row to the README's source table.
