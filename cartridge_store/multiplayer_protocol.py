"""Peer and wire-format helpers for the PRG32 multiplayer protocol."""

from __future__ import annotations

import math
import re
from typing import Any, Callable

from .auth import ANONYMOUS, Principal


SIGNATURE_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,47}$")


class MultiplayerPeer:
    """Connection state shared by the multiplayer hub and WebSocket adapter."""

    def __init__(
        self,
        send_json: Callable[[dict[str, Any]], None],
        *,
        connection_token: str = "",
        principal: Principal = ANONYMOUS,
    ) -> None:
        self.send_json = send_json
        self.connection_token = connection_token
        self.principal = principal
        self.signature = ""
        self.flags = 0
        self.player_id = 0
        self.state: dict[str, Any] | None = None

    def send(self, message: dict[str, Any]) -> None:
        """Send one protocol message through the connection adapter."""

        self.send_json(message)


def _number(value: Any) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(number):
        return 0
    return int(number)


def _clamp(value: Any, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, _number(value)))


def _uint32(value: Any) -> int:
    return _number(value) & 0xffffffff


def _peer_message(player_id: int, state: dict[str, Any]) -> dict[str, Any]:
    """Normalize a peer state into the firmware-compatible wire shape."""

    return {
        "type": "peer",
        "player_id": player_id,
        "x": _clamp(state.get("x"), -32768, 32767),
        "y": _clamp(state.get("y"), -32768, 32767),
        "sprite": _clamp(state.get("sprite"), 0, 65535),
        "flags": _clamp(state.get("flags"), 0, 65535),
        "input": _clamp(state.get("input"), 0, 0xffffffff),
        "frame": _clamp(state.get("frame"), 0, 0xffffffff),
    }
