"""Public schema and input contract for legacy download statistics."""

from __future__ import annotations

import re

STATS_SCHEMA = """
CREATE TABLE IF NOT EXISTS download_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       TEXT NOT NULL,
    version       TEXT NOT NULL,
    architecture  TEXT NOT NULL,
    user_id       INTEGER,
    ip_hash       TEXT,
    user_agent    TEXT,
    downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS download_events_game_idx
ON download_events(game_id, downloaded_at);

CREATE INDEX IF NOT EXISTS download_events_arch_idx
ON download_events(architecture);
"""

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
