"""Public filesystem-store constants and errors."""

from __future__ import annotations

import re

INDEX_ABI = "prg32-cartridge-store-index-1.0"
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
SAFE_VERSION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$")


class StoreError(ValueError):
    """Raised when a catalog or cartridge-store operation is invalid."""
