"""The interface every palette source implements."""

import json
from dataclasses import dataclass, field

from .. import paths


class SourceError(Exception):
    """A source's file is missing, unreadable or lacks the colours ShellTint needs."""


@dataclass
class ParsedPalette:
    # "dark", "light" or None when the source doesn't say.
    mode: object = None
    # How mode was learnt: "shell" (the shell reports it) or "inferred".
    mode_source: str = "shell"
    # Normalised roles per mode; a source may provide only one of them.
    variants: dict = field(default_factory=dict)
    # Per-mode extras, e.g. {"dank16": {"dark": {...}, "light": {...}}}.
    extras: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


class Source:
    id = ""
    label = ""

    def candidates(self, settings):
        """Files this source may read, most preferred first."""
        return []

    def find(self, settings):
        for path in self.candidates(settings):
            if path.is_file():
                return path
        return None

    def watch_paths(self, settings):
        """Files whose change means the palette may have changed."""
        return self.candidates(settings)

    def parse(self, path, settings):
        raise NotImplementedError


def read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except OSError as e:
        raise SourceError(f"cannot read {path}: {e.strerror or e}") from e
    except ValueError as e:
        raise SourceError(f"{path} is not valid JSON ({e})") from e


def read_json_quietly(path):
    try:
        return read_json(path)
    except SourceError:
        return None


def mode_word(value):
    text = str(value or "").strip().lower()
    return text if text in ("dark", "light") else None


__all__ = ["ParsedPalette", "Source", "SourceError", "read_json", "read_json_quietly", "mode_word", "paths"]
