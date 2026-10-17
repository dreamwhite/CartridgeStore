"""Public constants and value objects for the PRG32 cartridge format."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

CART_MAGIC = b"PRG2"
PRG32_CART_FLAG_AUDIO_BLOCK = 1 << 0
AUDIO_BLOCK_MAGIC = b"AUD0"
AUDIO_BLOCK_HEADER_SIZE = 40
AUDIO_BLOCK_SIZE_OFFSET = 36

TRAILER_MAGIC = b"PRG32META"
TRAILER_VERSION = 1

METADATA_ABI = "prg32-metadata-1.0"
COLOPHON_ABI = "prg32-colophon-1.0"

BLOCK_META = "META"
BLOCK_ICON = "ICON"
BLOCK_SCREENSHOT = "SCRN"
BLOCK_SIGNATURE = "SIGN"
BLOCK_COLOPHON = "COLO"
KNOWN_BLOCKS = {
    BLOCK_META,
    BLOCK_ICON,
    BLOCK_SCREENSHOT,
    BLOCK_SIGNATURE,
    BLOCK_COLOPHON,
}

ARCHITECTURE_PROFILES: dict[str, dict[str, str]] = {
    "esp32c6": {
        "id": "esp32c6",
        "label": "ESP32-C6 hardware",
        "platform": "PRG32",
        "target": "esp32c6",
        "display": "ili9341",
        "isa": "RV32I",
    },
    "qemu": {
        "id": "qemu",
        "label": "QEMU virtual screen",
        "platform": "PRG32",
        "target": "esp32c3",
        "display": "qemu-rgb",
        "isa": "RV32I",
    },
}


class CartridgeFormatError(ValueError):
    """Raised when a cartridge binary cannot be parsed."""


class MetadataValidationError(ValueError):
    """Raised when cartridge metadata violates the metadata ABI."""


class ColophonValidationError(ValueError):
    """Raised when cartridge colophon data violates its ABI."""


@dataclass(frozen=True)
class TrailerBlock:
    """One typed block in a PRG32 metadata trailer."""

    block_type: str
    data: bytes


@dataclass(frozen=True)
class CartridgeImage:
    """Parsed cartridge bytes and their optional metadata blocks."""

    data: bytes
    legacy_payload: bytes
    trailer_present: bool
    blocks: tuple[TrailerBlock, ...]
    metadata: dict[str, Any] | None = None
    icon: bytes | None = None
    screenshot: bytes | None = None
    signature: bytes | None = None
    signature_json: Any | None = None
    colophon: dict[str, Any] | None = None

    @property
    def unknown_blocks(self) -> tuple[TrailerBlock, ...]:
        """Return trailer blocks unknown to this parser version."""

        return tuple(
            block for block in self.blocks if block.block_type not in KNOWN_BLOCKS
        )
