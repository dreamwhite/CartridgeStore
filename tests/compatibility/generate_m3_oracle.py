"""Generate the synthetic Flask oracle used by the M3 read-only parity tests."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from cartridge_store import create_app
from cartridge_store import prg32_format as fmt
from cartridge_store.store import INDEX_ABI
from tests.test_prg32_format import JPEG_TINY, PNG_1X1, colophon, fake_cart, metadata


OUTPUT = ROOT / "backend" / "tests" / "fixtures" / "m3-python-oracle.json"
FIXED_TIME = 1_700_000_000


def response_fixture(response: Any) -> dict[str, Any]:
    return {
        "status": response.status_code,
        "content_type": response.headers.get("Content-Type"),
        "headers": {
            key.lower(): response.headers.get(key)
            for key in (
                "Content-Type",
                "Content-Length",
                "Content-Disposition",
                "Cache-Control",
                "Last-Modified",
                "Accept-Ranges",
                "Content-Range",
            )
            if response.headers.get(key) is not None
        },
        "body_base64": base64.b64encode(response.data).decode("ascii"),
        "sha256": hashlib.sha256(response.data).hexdigest(),
    }


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="prg32-m3-python-") as temporary:
        root = Path(temporary)
        data_dir = root / "data"
        db_path = root / "cartridge_store.sqlite"
        data_dir.mkdir()

        full_metadata = {**metadata(), "summary": "M3 synthetic catalog"}
        full_colophon = colophon()
        full_binary: dict[str, bytes] = {}
        for architecture in ("esp32c6", "qemu"):
            full_binary[architecture] = fmt.build_cartridge(
                fake_cart(),
                metadata=full_metadata,
                icon=PNG_1X1,
                screenshot=JPEG_TINY,
                colophon=full_colophon,
                architecture=architecture,
            )
        no_media_binary = fmt.build_cartridge(
            fake_cart(),
            metadata={**metadata(), "id": "m3.no-media", "title": "M3 No Media", "summary": ""},
            icon=PNG_1X1,
            architecture="esp32c6",
        )

        files: dict[str, bytes] = {}
        games: dict[str, Any] = {}
        for game_id, title, binaries, include_media in (
            ("org.example.test", "M3 Synthetic Game", full_binary, True),
            ("m3.no-media", "M3 No Media", {"esp32c6": no_media_binary}, False),
        ):
            game_metadata = fmt.parse_cartridge(next(iter(binaries.values()))).metadata
            game_colophon = fmt.parse_cartridge(next(iter(binaries.values()))).colophon if include_media else None
            architectures: dict[str, Any] = {}
            for architecture, binary in binaries.items():
                relative = f"cartridges/{game_id}/1.0.0/{architecture}.prg32"
                target = data_dir / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(binary)
                target.touch()
                target.stat()
                target.chmod(0o644)
                import os
                os.utime(target, (FIXED_TIME, FIXED_TIME))
                files[relative] = binary
                architectures[architecture] = {
                    "architecture": architecture,
                    "filename": relative,
                    "size": len(binary),
                    "sha256": hashlib.sha256(binary).hexdigest(),
                    "icon_mime": "image/png",
                    "screenshot_mime": "image/jpeg" if include_media else None,
                    "has_screenshot": include_media,
                    "has_signature": False,
                    "updated_at": "2026-01-01T00:00:00Z",
                }
            games[game_id] = {
                "id": game_id,
                "title": title,
                "summary": "M3 synthetic catalog" if include_media else "",
                "authors": [{"name": "PRG32"}],
                "tags": ["m3", "synthetic"],
                "latest_version": "1.0.0",
                "updated_at": "2026-01-01T00:00:00Z",
                "versions": {
                    "1.0.0": {
                        "version": "1.0.0",
                        "published_at": "2026-01-01T00:00:00Z",
                        "metadata": game_metadata,
                        "colophon": game_colophon,
                        "architectures": architectures,
                    }
                },
            }

        index = {"abi": INDEX_ABI, "updated_at": "2026-01-01T00:00:00Z", "games": games}
        (data_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
        app = create_app({"TESTING": True, "DATA_DIR": str(data_dir), "DATABASE": str(db_path)})
        client = app.test_client()

        requests: dict[str, Any] = {}
        requests["discovery"] = response_fixture(client.get("/.well-known/prg32-store.json", headers={"Host": "store.local:5080"}))
        requests["listing"] = response_fixture(client.get("/api/games"))
        requests["search_listing"] = response_fixture(client.get("/api/games?q=synthetic&per_page=1&page=1"))
        requests["limit_listing"] = response_fixture(client.get("/api/games?limit=1&page=2"))
        requests["detail"] = response_fixture(client.get("/api/games/org.example.test?version=1.0.0"))
        requests["icon"] = response_fixture(client.get("/api/games/org.example.test/icon?version=1.0.0&architecture=qemu"))
        requests["screenshot"] = response_fixture(client.get("/api/games/org.example.test/screenshot?version=1.0.0&architecture=qemu"))
        requests["colophon"] = response_fixture(client.get("/api/games/org.example.test/colophon?version=1.0.0&architecture=qemu"))
        requests["download"] = response_fixture(client.get("/api/games/org.example.test/download?version=1.0.0&architecture=qemu"))
        requests["download_default"] = response_fixture(client.get("/api/games/org.example.test/download?version=1.0.0"))
        requests["missing_game"] = response_fixture(client.get("/api/games/does-not-exist"))
        requests["invalid_version"] = response_fixture(client.get("/api/games/org.example.test?version=9.9.9"))
        requests["invalid_architecture"] = response_fixture(client.get("/api/games/org.example.test/download?architecture=unknown"))
        requests["missing_screenshot"] = response_fixture(client.get("/api/games/m3.no-media/screenshot"))
        requests["missing_colophon"] = response_fixture(client.get("/api/games/m3.no-media/colophon"))
        download_etag = client.get("/api/games/org.example.test/download?version=1.0.0&architecture=qemu").headers.get("ETag")
        requests["conditional_download"] = response_fixture(client.get("/api/games/org.example.test/download?version=1.0.0&architecture=qemu", headers={"If-None-Match": download_etag or ""}))
        requests["range_download"] = response_fixture(client.get("/api/games/org.example.test/download?version=1.0.0&architecture=qemu", headers={"Range": "bytes=0-7"}))

        database = app.config["DATABASE"]
        import sqlite3
        connection = sqlite3.connect(database)
        download_count = connection.execute("SELECT COUNT(*) FROM download_events").fetchone()[0]
        connection.close()
        oracle = {
            "index": index,
            "files": {name: base64.b64encode(value).decode("ascii") for name, value in files.items()},
            "requests": requests,
            "download_event_count_after_flask_requests": download_count,
        }
        OUTPUT.write_text(json.dumps(oracle, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
