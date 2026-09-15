"""Palette sources, in auto-detection order."""

from .base import ParsedPalette, Source, SourceError
from .caelestia import CaelestiaSource
from .dms import DmsSource
from .end4 import End4Source
from .matugen import MatugenSource
from .noctalia import NoctaliaSource

REGISTRY = {s.id: s for s in (DmsSource(), CaelestiaSource(), NoctaliaSource(), End4Source(), MatugenSource())}
AUTO_ORDER = ["dms", "caelestia", "noctalia", "end4", "matugen"]

__all__ = ["AUTO_ORDER", "REGISTRY", "ParsedPalette", "Source", "SourceError"]
