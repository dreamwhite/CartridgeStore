"""Stable authentication data contracts and database schema."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ROLE_LEVELS = {
    "reader": 0,
    "user": 1,
    "player": 1,
    "publisher": 2,
    "admin": 3,
}

AUTH_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    username          TEXT    NOT NULL UNIQUE,
    email             TEXT    NOT NULL UNIQUE,
    password_hash     TEXT,
    role              TEXT    NOT NULL DEFAULT 'user',
    external_id       TEXT,
    external_provider TEXT,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login        TEXT
);

CREATE TABLE IF NOT EXISTS api_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT    NOT NULL UNIQUE,
    label       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used   TEXT
);

CREATE INDEX IF NOT EXISTS users_external_idx
ON users(external_provider, external_id);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx
ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS groups (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_groups (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, group_id)
);

CREATE TABLE IF NOT EXISTS registration_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    used_at    TEXT
);

CREATE INDEX IF NOT EXISTS registration_tokens_email_idx
ON registration_tokens(email, used_at, expires_at);
"""


@dataclass(frozen=True)
class Principal:
    """Authenticated identity used by the Flask application and relays."""

    name: str
    role: str
    token: str = ""
    authenticated: bool = False
    id: int | None = None
    email: str = ""
    external_provider: str | None = None
    groups: tuple[str, ...] = ()

    @property
    def username(self) -> str:
        """Return the legacy username alias for this principal."""

        return self.name

    def as_dict(self) -> dict[str, Any]:
        """Serialize the public identity fields used by API responses."""

        return {
            "id": self.id,
            "name": self.name,
            "username": self.name,
            "email": self.email,
            "role": self.role,
            "groups": list(self.groups),
            "authenticated": self.authenticated,
        }


ANONYMOUS = Principal(name="anonymous", role="reader", authenticated=False)
