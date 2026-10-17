"""SQLite and metadata-field contracts for legacy review."""

REVIEW_SCHEMA = """
CREATE TABLE IF NOT EXISTS cartridge_submissions (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id              TEXT NOT NULL,
    version              TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'pending',
    submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_by         TEXT NOT NULL DEFAULT '',
    reviewed_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by          TEXT NOT NULL DEFAULT '',
    pending_dir          TEXT NOT NULL DEFAULT '',
    metadata_json        TEXT NOT NULL,
    architectures_json   TEXT NOT NULL,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at          TEXT
);

CREATE INDEX IF NOT EXISTS cartridge_submissions_status_idx
ON cartridge_submissions(status, created_at);
"""

EDITABLE_METADATA_FIELDS = {
    "title",
    "summary",
    "description",
    "tags",
    "license",
    "homepage",
    "repository",
}
