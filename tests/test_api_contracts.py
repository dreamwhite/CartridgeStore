from __future__ import annotations

import json
import hashlib
import io
import zipfile
from pathlib import Path

import pytest

from cartridge_store import create_app
from tests.test_api import (
    csrf_token,
    login_default_admin,
    upload_bundle,
    verify_submission,
)
from tests.test_prg32_format import PNG_1X1, fake_cart, colophon, metadata


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "api_contracts.json"


@pytest.fixture()
def contract_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def isolated_client(tmp_path):
    app = create_app({"TESTING": True, "DATA_DIR": str(tmp_path / "data")})
    return app.test_client()


def screenshot_bundle() -> bytes:
    manifest = {
        **metadata(),
        "assets": {"icon": "icon.png", "splash": "splash.png"},
        "architectures": [
            {"id": "qemu", "file": "game-qemu.prg32", "variant": "assembly"},
            {"id": "esp32c6", "file": "game-esp32c6.prg32"},
        ],
        "colophon": colophon(),
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as package:
        package.writestr("manifest.json", json.dumps(manifest))
        package.writestr("icon.png", PNG_1X1)
        package.writestr("splash.png", PNG_1X1)
        package.writestr("game-qemu.prg32", fake_cart())
        package.writestr("game-esp32c6.prg32", fake_cart())
    return output.getvalue()


def test_public_contract_envelopes_are_stable(isolated_client, contract_fixture) -> None:
    discovery = isolated_client.get("/.well-known/prg32-store.json")
    assert discovery.status_code == 200
    discovery_body = discovery.get_json()
    assert set(contract_fixture["discovery_fields"]).issubset(discovery_body)
    assert discovery_body["abi"] == "prg32-store-discovery-1.0"
    assert isinstance(discovery_body["services"], dict)
    assert all(isinstance(value, str) for value in discovery_body["services"].values())

    games = isolated_client.get("/api/games")
    assert games.status_code == 200
    games_body = games.get_json()
    assert games_body["ok"] is True
    assert games_body["games"] == []
    assert set(contract_fixture["pagination_fields"]).issubset(games_body["pagination"])

    anonymous_response = isolated_client.get("/api/me")
    assert anonymous_response.status_code == 200
    anonymous_body = anonymous_response.get_json()
    assert anonymous_body["ok"] is True
    anonymous = anonymous_body["user"]
    assert set(contract_fixture["anonymous_principal_fields"]) == set(anonymous)
    assert anonymous["authenticated"] is False

    assert isolated_client.get("/auth/me").status_code == 302
    login_default_admin(isolated_client)
    authenticated = isolated_client.get("/auth/me")
    assert authenticated.status_code == 200
    assert authenticated.get_json()["user"]["authenticated"] is True
    assert isinstance(isolated_client.get("/api/scores").get_json(), list)
    assert isolated_client.get("/api/metrics").get_json()["ok"] is True
    assert isinstance(isolated_client.get("/api/runs").get_json(), list)
    assert isolated_client.get("/api/multiplayer").get_json()["ok"] is True
    assert isolated_client.get("/api/multiplayer/status").get_json()["ok"] is True

    for path in ("/api/stats/downloads", "/api/stats/scores", "/api/stats/runs"):
        response = isolated_client.get(path)
        assert response.status_code == 200
        assert response.is_json

    assert set(contract_fixture["required_abis"]) == {
        discovery_body["abi"],
        "prg32-metadata-1.0",
        "prg32-colophon-1.0",
    }


def test_catalog_version_architecture_and_binary_contracts(
    isolated_client, contract_fixture
) -> None:
    login_default_admin(isolated_client)
    uploaded = upload_bundle(isolated_client)
    assert uploaded.status_code == 200
    submission_id = uploaded.get_json()["submission_id"]
    verified = verify_submission(isolated_client, submission_id)
    assert verified.status_code == 200

    listing = isolated_client.get("/api/games").get_json()
    game = listing["games"][0]
    assert set(contract_fixture["game_fields"]).issubset(game)
    assert set(game["architectures"]) == set(contract_fixture["required_architectures"])
    assert game["versions"] == ["1.0.0"]
    assert game["metadata"]["abi"] == "prg32-metadata-1.0"
    assert game["colophon"]["abi"] == "prg32-colophon-1.0"

    detail = isolated_client.get("/api/games/org.example.test?version=1.0.0")
    assert detail.status_code == 200
    assert detail.get_json()["game"]["selected_version"] == "1.0.0"

    icon = isolated_client.get("/api/games/org.example.test/icon?version=1.0.0")
    assert icon.status_code == 200
    assert icon.mimetype == "image/png"

    colophon = isolated_client.get("/api/games/org.example.test/colophon?version=1.0.0")
    assert colophon.status_code == 200
    assert colophon.get_json()["colophon"]["abi"] == "prg32-colophon-1.0"

    for architecture in contract_fixture["required_architectures"]:
        download = isolated_client.get(
            f"/api/games/org.example.test/download?version=1.0.0&architecture={architecture}"
        )
        assert download.status_code == 200
        assert download.mimetype == "application/vnd.prg32.cartridge"
        assert download.data.startswith(b"PRG2")
        assert b"PRG32META" in download.data
        assert hashlib.sha256(download.data).hexdigest() == contract_fixture["expected_download_sha256"][architecture]
        disposition = download.headers.get("Content-Disposition", "")
        assert "attachment" in disposition
        assert f"org.example.test-1.0.0-{architecture}.prg32" in disposition


def test_screenshot_and_missing_resource_contracts(isolated_client) -> None:
    login_default_admin(isolated_client)
    uploaded = isolated_client.post(
        "/api/publish/bundle",
        data={
            "bundle": (io.BytesIO(screenshot_bundle()), "screenshot-bundle.zip"),
            "csrf_token": csrf_token(isolated_client),
        },
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 200
    assert verify_submission(isolated_client, uploaded.get_json()["submission_id"]).status_code == 200

    screenshot = isolated_client.get("/api/games/org.example.test/screenshot?architecture=qemu")
    assert screenshot.status_code == 200
    assert screenshot.mimetype == "image/png"
    assert screenshot.data == PNG_1X1

    for path in (
        "/api/games/does-not-exist",
        "/api/games/does-not-exist/icon",
        "/api/games/does-not-exist/screenshot",
        "/api/games/does-not-exist/colophon",
        "/api/games/does-not-exist/download",
    ):
        response = isolated_client.get(path)
        assert response.status_code == 400
        assert response.is_json
        assert response.get_json()["ok"] is False
        assert isinstance(response.get_json()["error"], str)


def test_protected_workflows_keep_authentication_boundaries(isolated_client) -> None:
    for method, path in (
        ("post", "/api/publish"),
        ("get", "/api/submissions"),
        ("get", "/admin/users"),
    ):
        response = getattr(isolated_client, method)(path)
        assert response.status_code in {302, 401}

    score = isolated_client.post(
        "/api/scores", json={"game": "synthetic", "player": "fixture", "score": 1}
    )
    assert score.status_code in {302, 401}


def test_auth_registration_and_token_contracts(isolated_client) -> None:
    csrf = isolated_client.get("/auth/csrf").get_json()["csrf_token"]
    registration = isolated_client.post(
        "/auth/register",
        data={"email": "synthetic@example.test", "csrf_token": csrf},
        headers={"Accept": "application/json"},
    )
    assert registration.status_code == 200
    assert registration.get_json() == {
        "ok": True,
        "email": "synthetic@example.test",
        "message": "registration email sent",
    }
    registration_token = isolated_client.application.extensions["prg32_last_registration"]["token"]
    completed = isolated_client.post(
        "/auth/register/complete",
        data={
            "token": registration_token,
            "password": "synthetic-password",
            "password_confirm": "synthetic-password",
            "csrf_token": csrf,
        },
        headers={"Accept": "application/json"},
    )
    assert completed.status_code == 200
    assert completed.get_json()["ok"] is True
    assert completed.get_json()["user"]["authenticated"] is True

    login_default_admin(isolated_client)
    created = isolated_client.post(
        "/auth/tokens",
        json={"label": "contract-test"},
        headers={"X-CSRFToken": isolated_client.get("/auth/csrf").get_json()["csrf_token"]},
    )
    assert created.status_code == 200
    token_body = created.get_json()
    assert token_body["ok"] is True
    assert isinstance(token_body["id"], int)
    assert isinstance(token_body["token"], str)
    assert token_body["label"] == "contract-test"

    token_client = isolated_client.application.test_client()
    token_score = token_client.post(
        "/api/scores",
        json={"game": "token-game", "player": "synthetic", "score": 7},
        headers={"Authorization": f"Bearer {token_body['token']}"},
    )
    assert token_score.status_code == 200
    assert token_score.get_json() == {"ok": True}

    listed = isolated_client.get("/auth/tokens", headers={"Accept": "application/json"})
    assert listed.status_code == 200
    assert listed.get_json()["ok"] is True
    assert listed.get_json()["tokens"][0]["label"] == "contract-test"

    updated = isolated_client.patch(
        f"/auth/tokens/{token_body['id']}",
        json={"label": "updated-contract-test"},
        headers={"X-CSRFToken": csrf_token(isolated_client)},
    )
    assert updated.status_code == 200
    assert updated.get_json() == {
        "ok": True,
        "id": token_body["id"],
        "label": "updated-contract-test",
    }
    revoked = isolated_client.delete(
        f"/auth/tokens/{token_body['id']}",
        headers={"X-CSRFToken": csrf_token(isolated_client)},
    )
    assert revoked.status_code == 200
    assert revoked.get_json() == {"ok": True}
    assert isolated_client.delete(
        f"/auth/tokens/{token_body['id']}",
        headers={"X-CSRFToken": csrf_token(isolated_client)},
    ).get_json() == {"ok": False}


def test_publish_review_scores_stats_and_admin_contracts(isolated_client) -> None:
    login_default_admin(isolated_client)

    submission = upload_bundle(isolated_client)
    assert submission.status_code == 200
    pending = submission.get_json()
    assert isinstance(pending["submission_id"], int)
    assert pending["status"] == "pending"
    submissions = isolated_client.get("/api/submissions").get_json()
    assert submissions["ok"] is True
    assert submissions["submissions"][0]["id"] == pending["submission_id"]
    detail = isolated_client.get(f"/api/submissions/{pending['submission_id']}").get_json()
    assert detail["ok"] is True
    assert detail["submission"]["id"] == pending["submission_id"]

    verified = verify_submission(isolated_client, pending["submission_id"])
    assert verified.status_code == 200
    assert verified.get_json()["ok"] is True
    assert verified.get_json()["submission"]["status"] == "verified"

    rejected_upload = upload_bundle(isolated_client)
    rejected_id = rejected_upload.get_json()["submission_id"]
    rejected = isolated_client.post(
        f"/api/submissions/{rejected_id}/reject",
        headers={"X-CSRFToken": csrf_token(isolated_client)},
    )
    assert rejected.status_code == 200
    assert rejected.get_json()["submission"]["status"] == "rejected"

    score = isolated_client.post(
        "/api/scores",
        json={"game": "org.example.test", "player": "synthetic", "score": 42},
        headers={"X-CSRFToken": csrf_token(isolated_client)},
    )
    assert score.status_code == 200
    assert score.get_json() == {"ok": True}
    scores = isolated_client.get("/api/scores?game=org.example.test")
    assert scores.status_code == 200
    assert scores.is_json
    assert scores.get_json()[0]["score"] == 42

    assert isolated_client.get("/api/stats/scores").get_json()["scores"][0]["score"] == 42
    assert isinstance(isolated_client.get("/api/stats/downloads").get_json()["series"], list)
    assert isinstance(isolated_client.get("/api/stats/runs").get_json()["total"], int)

    for path in ("/admin/users", "/admin/groups", "/admin/roles", "/admin/cartridges", "/admin/backup"):
        assert isolated_client.get(path).status_code == 200
    backup = isolated_client.get("/admin/backup/download")
    assert backup.status_code == 200
    assert backup.mimetype == "application/zip"
    assert "attachment" in backup.headers["Content-Disposition"]


def test_metrics_receiver_and_exports_are_compatible(isolated_client) -> None:
    run = isolated_client.post(
        "/api/runs",
        json={"run_id": "fixture-run", "board_id": "fixture-board", "target": "qemu"},
    )
    assert run.status_code == 200
    assert run.get_json() == {"ok": True, "run_id": "fixture-run"}

    batch = isolated_client.post(
        "/api/metrics/batch",
        json={"run_id": "fixture-run", "samples": [{"frame": 1, "frame_us": 10}]},
    )
    assert batch.status_code == 200
    assert batch.get_json()["ok"] is True

    finished = isolated_client.post("/api/runs/fixture-run/finish", json={"finished_ms": 2})
    assert finished.status_code == 200
    assert isolated_client.get("/api/runs/fixture-run?format=json").status_code == 403
    assert isolated_client.get("/api/runs/fixture-run/samples.csv").status_code == 403
    assert isolated_client.get("/api/runs/fixture-run/report.md").status_code == 403
    login_default_admin(isolated_client)
    assert isolated_client.get("/api/runs/fixture-run?format=json").status_code == 200
    assert isolated_client.get("/api/runs/fixture-run/samples.csv").status_code == 200
    assert isolated_client.get("/api/runs/fixture-run/report.md").status_code == 200


def test_metrics_error_envelopes_and_statistics_types(isolated_client) -> None:
    bad_run = isolated_client.post("/api/runs", json={"run_id": "only-id"})
    assert bad_run.status_code == 400
    assert bad_run.get_json()["ok"] is False
    bad_batch = isolated_client.post(
        "/api/metrics/batch", json={"run_id": "missing", "samples": []}
    )
    assert bad_batch.status_code == 404
    assert isinstance(bad_batch.get_json()["error"], str)
    assert bad_batch.get_json()["code"] == "run_not_found"
    missing_run = isolated_client.get("/api/runs/missing?format=json")
    assert missing_run.status_code == 404
    assert missing_run.get_json()["ok"] is False
