"""Generate sanitized M2.1 oracle fixtures from the authoritative Flask code."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from cartridge_store.app import create_app  # noqa: E402
from cartridge_store.auth import Principal, token_hash  # noqa: E402
from cartridge_store.store import GameStore  # noqa: E402
from werkzeug.security import check_password_hash  # noqa: E402


TABLES = [
    "api_tokens",
    "cartridge_submissions",
    "download_events",
    "groups",
    "registration_tokens",
    "runs",
    "samples",
    "scores",
    "store_settings",
    "user_groups",
    "users",
]


def schema_snapshot(db: sqlite3.Connection) -> dict[str, Any]:
    tables: list[dict[str, Any]] = []
    for (name,) in db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ):
        columns = [
            {
                "name": row[1],
                "type": row[2],
                "notNull": bool(row[3]),
                "defaultValue": row[4],
                "primaryKeyPosition": row[5],
            }
            for row in db.execute(f'PRAGMA table_info("{name.replace(chr(34), chr(34) * 2)}")')
        ]
        indexes: list[dict[str, Any]] = []
        for row in db.execute(f'PRAGMA index_list("{name}")'):
            index_name = row[1]
            info = list(db.execute(f'PRAGMA index_xinfo("{index_name}")'))
            key_columns = [item for item in info if item[5] == 1]
            indexes.append(
                {
                    "name": index_name,
                    "unique": bool(row[2]),
                    "columns": [item[2] for item in key_columns if item[2] is not None],
                    "orders": ["DESC" if item[3] else "ASC" for item in sorted(key_columns, key=lambda item: item[0])],
                }
            )
        foreign_keys = [
            {
                "column": row[3],
                "foreignTable": row[2],
                "foreignColumn": row[4],
                "onUpdate": row[5],
                "onDelete": row[6],
                "match": row[7],
            }
            for row in db.execute(f'PRAGMA foreign_key_list("{name}")')
        ]
        sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
        ).fetchone()[0] or ""
        tables.append(
            {
                "name": name,
                "columns": columns,
                "indexes": indexes,
                "foreignKeys": foreign_keys,
                "sql": sql,
                "autoIncrement": bool(re.search(r"AUTOINCREMENT", sql, re.I)),
            }
        )
    return {"tables": tables}


def create_authoritative_fixture(input_data: dict[str, Any]) -> tuple[Path, tempfile.TemporaryDirectory[str]]:
    temporary = tempfile.TemporaryDirectory(prefix="prg32-m21-python-")
    directory = Path(temporary.name)
    database_path = directory / "cartridge_store.sqlite"
    data_path = directory / "data"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "m2.1-synthetic-only",
            "DATABASE": str(database_path),
            "DATA_DIR": str(data_path),
        }
    )
    # Every database-owning Flask module registers a before_request initializer.
    app.test_client().get("/api/scores")
    db = sqlite3.connect(database_path)
    db.execute("PRAGMA foreign_keys = ON")
    db.row_factory = sqlite3.Row
    # Flask may seed development defaults while creating its schema. The oracle
    # must contain only the explicit synthetic fixture, never those defaults.
    for table in ("samples", "runs", "api_tokens", "registration_tokens", "user_groups", "groups", "cartridge_submissions", "download_events", "scores", "store_settings", "users"):
        db.execute(f"DELETE FROM {table}")
    for table in ("users", "groups", "user_groups", "api_tokens", "registration_tokens", "store_settings", "runs", "samples", "scores", "download_events", "cartridge_submissions"):
        rows = input_data.get(table, [])
        if not rows:
            continue
        columns = list(rows[0])
        placeholders = ",".join("?" for _ in columns)
        db.executemany(
            f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders})",
            [[row[column] for column in columns] for row in rows],
        )
    db.commit()
    db.close()
    return database_path, temporary


def rows_from_fixture(database_path: Path, input_data: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    db = sqlite3.connect(database_path)
    db.row_factory = sqlite3.Row
    rows: dict[str, list[dict[str, Any]]] = {}
    for table in TABLES:
        order = "id" if table not in {"runs", "store_settings", "user_groups"} else {
            "runs": "run_id",
            "store_settings": "key",
            "user_groups": "user_id, group_id",
        }[table]
        rows[table] = [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY {order}")]
    db.close()
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=ROOT / "backend" / "tests" / "fixtures")
    args = parser.parse_args()
    input_path = args.output_dir / "compatibility-input.json"
    input_data = json.loads(input_path.read_text(encoding="utf-8"))
    database_path, temporary = create_authoritative_fixture(input_data)
    try:
        db = sqlite3.connect(database_path)
        schema = schema_snapshot(db)
        db.close()

        with tempfile.TemporaryDirectory(prefix="prg32-m21-catalog-") as catalog_dir:
            catalog_path = Path(catalog_dir)
            (catalog_path / "index.json").write_text(
                json.dumps(input_data["catalog_index"], ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            binary = bytes.fromhex(input_data["catalog_binary_hex"])
            binary_path = catalog_path / "cartridges/compat-game/1.0.0/esp32c6.prg32"
            binary_path.parent.mkdir(parents=True)
            binary_path.write_bytes(binary)
            catalog_public = GameStore(catalog_path).public_game("compat-game")

        publisher = Principal(
            id=1,
            name="compat-publisher",
            email="publisher@example.test",
            role="publisher",
            authenticated=True,
            groups=("editors",),
        )
        password_results: dict[str, Any] = {}
        for user in input_data["users"]:
            for label, password in input_data["password_cases"].items():
                try:
                    password_results[f"{user['username']}:{label}"] = check_password_hash(user["password_hash"], password)
                except ValueError as exc:
                    password_results[f"{user['username']}:{label}"] = {"unsupported": str(exc)}

        oracle = {
            "rows": rows_from_fixture(database_path, input_data),
            "principal": publisher.as_dict(),
            "json": {
                "metadata": json.loads(input_data["cartridge_submissions"][0]["metadata_json"]),
                "architectures": json.loads(input_data["cartridge_submissions"][0]["architectures_json"]),
            },
            "catalog_public": catalog_public,
            "token_hashes": {
                key: token_hash(value) for key, value in input_data["token_cases"].items()
            },
            "password_results": password_results,
        }
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "python-schema-snapshot.json").write_text(
            json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        (args.output_dir / "python-compatibility-oracle.json").write_text(
            json.dumps(oracle, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()
