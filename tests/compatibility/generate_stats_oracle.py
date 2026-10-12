"""Generate deterministic Flask statistics responses for the Fastify parity tests."""

from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from cartridge_store.app import create_app  # noqa: E402
import cartridge_store.stats as stats_module  # noqa: E402


NOW = 1_700_000_000


def fixture_input() -> dict:
    return {
        "downloads": [
            ["a-game", "1.0.0", "esp32c6", "2026-01-01 00:00:00"],
            ["a-game", "1.0.0", "qemu", "2026-01-01 12:00:00"],
            ["a-game", "1.0.0", "esp32c6", "2026-01-02 00:00:00"],
            ["b-game", "2.0.0", "qemu", "2026-01-08 00:00:00"],
            ["b-game", "2.0.0", "esp32c6", "2026-02-01 00:00:00"],
        ],
        "scores": [
            ["a-game", "alice", 100, 1_700_000_010, "anonymous"],
            ["b-game", "bob", 100, 1_700_000_000, "anonymous"],
            ["a-game", "carol", 50, 1_700_000_020, "tester"],
        ],
        "runs": [
            ["run-current", 1_700_000_000, None, None],
            ["run-boundary", NOW - 7 * 24 * 60 * 60, 1_700_000_100, None],
            ["run-old", NOW - 7 * 24 * 60 * 60 - 1, None, None],
            ["run-owned", NOW - 100, None, 1],
        ],
        "catalog": {
            "abi": "prg32-cartridge-store-index-1.0",
            "games": {
                "a-game": {
                    "id": "a-game",
                    "title": "Alpha Game",
                    "latest_version": "1.0.0",
                    "updated_at": "2026-01-03T00:00:00Z",
                    "versions": {
                        "1.0.0": {
                            "architectures": {"qemu": {"filename": "unused.prg32"}}
                        }
                    },
                }
            },
        },
        "cases": [
            {"name": "downloads-default", "path": "/api/stats/downloads"},
            {"name": "downloads-week", "path": "/api/stats/downloads?granularity=week"},
            {"name": "downloads-month-limited", "path": "/api/stats/downloads?granularity=month&limit=1"},
            {"name": "downloads-date-window", "path": "/api/stats/downloads?since=2026-01-01&until=2026-01-02&limit=2"},
            {"name": "downloads-invalid-values", "path": "/api/stats/downloads?granularity=hour&since=not-a-date&limit=invalid"},
            {"name": "game-downloads", "path": "/api/stats/downloads/a-game?since=2026-01-01&until=2026-01-02"},
            {"name": "unknown-game-downloads", "path": "/api/stats/downloads/unknown-game"},
            {"name": "scores-default", "path": "/api/stats/scores"},
            {"name": "scores-limited", "path": "/api/stats/scores?limit=1"},
            {"name": "scores-invalid-limit", "path": "/api/stats/scores?limit=invalid"},
            {"name": "runs", "path": "/api/stats/runs"},
        ],
    }


def generate(output: Path) -> None:
    data = fixture_input()
    with tempfile.TemporaryDirectory(prefix="prg32-m63a-flask-") as temporary:
        root = Path(temporary)
        database_path = root / "cartridge_store.sqlite"
        store_path = root / "store"
        store_path.mkdir()
        (store_path / "index.json").write_text(json.dumps(data["catalog"]), encoding="utf-8")
        app = create_app({
            "TESTING": True,
            "SECRET_KEY": "m6-3a-statistics-fixture",
            "DATABASE": str(database_path),
            "DATA_DIR": str(store_path),
        })
        client = app.test_client()
        client.get("/api/stats/runs")
        with sqlite3.connect(database_path) as database:
            database.execute("INSERT OR IGNORE INTO users(id, username, email, role) VALUES (1, 'owner', 'owner@example.test', 'user')")
            database.executemany(
                "INSERT INTO download_events(game_id, version, architecture, downloaded_at) VALUES (?, ?, ?, ?)",
                data["downloads"],
            )
            database.executemany(
                "INSERT INTO scores(game, player, score, created_at, submitted_by) VALUES (?, ?, ?, ?, ?)",
                data["scores"],
            )
            database.executemany(
                "INSERT INTO runs(run_id, board_id, target, started_at, created_at, finished_at, user_id) VALUES (?, 'board', 'qemu', ?, ?, ?, ?)",
                [[run_id, created_at * 1000, created_at, finished_at, user_id] for run_id, created_at, finished_at, user_id in data["runs"]],
            )
            database.commit()

        original_time = stats_module.time.time
        stats_module.time.time = lambda: NOW
        try:
            responses = []
            for case in data["cases"]:
                response = client.get(case["path"])
                responses.append({"name": case["name"], "status": response.status_code, "body": response.get_json()})
        finally:
            stats_module.time.time = original_time
        output.write_text(json.dumps({"input": data, "responses": responses}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    destination = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "backend/tests/fixtures/stats-compatibility-oracle.json"
    generate(destination)
