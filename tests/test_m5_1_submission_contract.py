from __future__ import annotations

import io
import json

from cartridge_store import create_app
from tests.test_api import bundle_bytes, csrf_token, login_default_admin


def contract_fixture() -> dict:
    with open("backend/tests/fixtures/m5-1-submission-contract.json", encoding="utf-8") as handle:
        return json.load(handle)


def upload(client, payload: bytes):
    return client.post(
        "/api/publish/bundle",
        data={"bundle": (io.BytesIO(payload), "bundle.zip"), "csrf_token": csrf_token(client)},
        content_type="multipart/form-data",
    )


def test_flask_submission_contract_matches_sanitized_fixture(tmp_path):
    expected = contract_fixture()
    app = create_app({"TESTING": True, "DATA_DIR": str(tmp_path / "data")})
    anonymous = app.test_client()
    unauthenticated = anonymous.post(
        "/api/publish/bundle",
        data={"bundle": (io.BytesIO(bundle_bytes()), "bundle.zip")},
        content_type="multipart/form-data",
    )
    assert unauthenticated.status_code == expected["unauthenticated_status"]

    client = app.test_client()
    login_default_admin(client)
    response = upload(client, bundle_bytes())
    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == expected["success"]["status"]
    assert body["review_required"] is expected["success"]["review_required"]
    assert body["id"] == "org.example.test"
    assert body["version"] == expected["success"]["version"]
    assert {item["architecture"] for item in body["submitted"]} == {"qemu", "esp32c6"}

    invalid = upload(client, b"not-a-zip")
    assert invalid.status_code == expected["invalid_request_status"]
    assert invalid.get_json() == {"ok": False, "error": "invalid request", "code": "invalid_request"}
