"""Palette sources, in auto-detection order."""

from .base import ParsedPalette, Source, SourceError
from .caelestia import CaelestiaSource
from .dms import DmsSource
from .end4 import End4Source
from .gnome import GnomeSource
from .kde import KdeSource
from .matugen import MatugenSource
from .noctalia import NoctaliaSource
from .pywal import PywalSource

REGISTRY = {s.id: s for s in (DmsSource(), CaelestiaSource(), NoctaliaSource(), End4Source(),
                              KdeSource(), GnomeSource(), PywalSource(), MatugenSource())}
AUTO_ORDER = ["dms", "caelestia", "noctalia", "end4", "kde", "gnome", "pywal", "matugen"]

__all__ = ["AUTO_ORDER", "REGISTRY", "ParsedPalette", "Source", "SourceError"]
