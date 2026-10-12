from __future__ import annotations

import io
import json
import warnings
import zipfile

from cartridge_store import create_app
from tests.test_api import bundle_bytes, csrf_token, login_default_admin
from tests.test_prg32_format import fake_cart, metadata


def upload_bundle(client, payload: bytes):
    return client.post(
        "/api/publish/bundle",
        data={
            "bundle": (io.BytesIO(payload), "bundle.zip"),
            "csrf_token": csrf_token(client),
        },
        content_type="multipart/form-data",
    )


def make_zip(entries: list[tuple[str, bytes]], *, compression=zipfile.ZIP_DEFLATED) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=compression) as archive:
        for name, data in entries:
            archive.writestr(name, data)
    return output.getvalue()


def make_owner_client(app, email: str):
    client = app.test_client()
    token = csrf_token(client)
    assert client.post(
        "/auth/register", data={"email": email, "csrf_token": token}
    ).status_code == 200
    registration_token = app.extensions["prg32_last_registration"]["token"]
    response = client.post(
        "/auth/register/complete",
        data={
            "token": registration_token,
            "password": "longpassword",
            "password_confirm": "longpassword",
            "csrf_token": token,
        },
    )
    assert response.status_code in {200, 302}
    return client


def create_run(client, run_id: str):
    return client.post(
        "/api/runs",
        headers={"X-CSRFToken": csrf_token(client)} if client.get_cookie("session") else {},
        json={"run_id": run_id, "board_id": "board", "target": "qemu"},
    )


def sample(frame: int = 1) -> dict:
    return {
        "frame": frame,
        "timestamp_ms": 1000 + frame,
        "update_us": 10,
        "draw_us": 20,
        "present_us": 30,
        "frame_us": 60,
        "heap_free": 100,
        "heap_min_free": 90,
        "input_mask": 0,
        "fps_x100": 6000,
        "upload_queue_depth": 0,
        "deadline_missed": False,
    }


def test_zip_limits_reject_duplicate_and_unsafe_entries(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "BUNDLE_MAX_ENTRIES": 4,
            "BUNDLE_MAX_MANIFEST_BYTES": 256 * 1024,
        }
    )
    client = app.test_client()
    login_default_admin(client)

    too_many_payload = io.BytesIO(bundle_bytes())
    with zipfile.ZipFile(too_many_payload, "a") as archive:
        archive.writestr("extra.bin", b"extra")
    too_many = upload_bundle(client, too_many_payload.getvalue())
    assert too_many.status_code == 400
    assert too_many.get_json()["code"] == "invalid_request"

    manifest = {
        **metadata(),
        "assets": {"icon": "../icon.png"},
        "architectures": [{"id": "qemu", "file": "game.prg32"}],
    }
    unsafe = upload_bundle(client, bundle_bytes(manifest=manifest))
    assert unsafe.status_code == 400
    assert unsafe.get_json()["code"] == "invalid_request"

    app.config["BUNDLE_MAX_ENTRIES"] = 128
    output = io.BytesIO(bundle_bytes())
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(output, "a") as archive:
            archive.writestr("manifest.json", b"{}")
    duplicate_response = upload_bundle(client, output.getvalue())
    assert duplicate_response.status_code == 400
    assert duplicate_response.get_json()["code"] == "invalid_request"


def test_zip_limits_reject_compression_ratio_and_archive_size(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "BUNDLE_MAX_COMPRESSION_RATIO": 5.0,
            "BUNDLE_MAX_ARCHIVE_BYTES": 32,
        }
    )
    client = app.test_client()
    login_default_admin(client)

    oversized = upload_bundle(client, bundle_bytes())
    assert oversized.status_code == 400
    assert oversized.get_json()["code"] == "invalid_request"

    app.config["BUNDLE_MAX_ARCHIVE_BYTES"] = 10 * 1024 * 1024
    ratio_payload = make_zip(
        [
            ("manifest.json", json.dumps({"abi": "prg32-metadata-1.0"}).encode()),
            ("zeros.bin", b"0" * 32_768),
        ]
    )
    ratio_response = upload_bundle(client, ratio_payload)
    assert ratio_response.status_code == 400
    assert ratio_response.get_json()["code"] == "invalid_request"


def test_zip_limits_reject_entry_total_and_manifest_sizes(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "BUNDLE_MAX_ENTRY_UNCOMPRESSED_BYTES": 64,
            "BUNDLE_MAX_TOTAL_UNCOMPRESSED_BYTES": 100,
            "BUNDLE_MAX_MANIFEST_BYTES": 16,
        }
    )
    client = app.test_client()
    login_default_admin(client)

    entry_response = upload_bundle(
        client,
        make_zip([("manifest.json", b"{}"), ("large.bin", b"x" * 65)]),
    )
    assert entry_response.status_code == 400

    total_response = upload_bundle(
        client,
        make_zip([("one.bin", b"x" * 50), ("two.bin", b"x" * 51)]),
    )
    assert total_response.status_code == 400

    manifest_response = upload_bundle(
        client,
        make_zip([("manifest.json", b"{" + b"x" * 32 + b"}")]),
    )
    assert manifest_response.status_code == 400


def test_metrics_ingestion_limits_and_valid_firmware_shape(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "METRICS_MAX_SAMPLES_PER_REQUEST": 1,
            "METRICS_MAX_DB_WORK": 1,
        }
    )
    client = app.test_client()

    run = create_run(client, "firmware-run")
    assert run.status_code == 200
    valid = client.post(
        "/api/metrics/batch",
        json={"run_id": "firmware-run", "samples": [sample()]},
    )
    assert valid.status_code == 200
    assert valid.get_json()["inserted"] == 1

    too_many = client.post(
        "/api/metrics/batch",
        json={"run_id": "firmware-run", "samples": [sample(2), sample(3)]},
    )
    assert too_many.status_code == 413
    assert too_many.get_json()["code"] == "metrics_sample_limit"

    nested = client.post(
        "/api/metrics/batch",
        json={"run_id": "firmware-run", "samples": [{"frame": {"nested": 1}}]},
    )
    assert nested.status_code == 400
    assert nested.get_json()["code"] == "invalid_sample_structure"

    app.config["METRICS_MAX_DB_WORK"] = 1
    work = client.post(
        "/api/metrics/batch",
        json={"run_id": "firmware-run", "dropped_samples": 1, "samples": [sample(4)]},
    )
    assert work.status_code == 413
    assert work.get_json()["code"] == "metrics_work_limit"


def test_metrics_payload_limit_has_stable_error(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "METRICS_MAX_CONTENT_LENGTH": 128,
        }
    )
    client = app.test_client()
    response = client.post(
        "/api/metrics/batch",
        json={"run_id": "x", "samples": [{"frame": 1, "padding": "x" * 512}]},
    )
    assert response.status_code == 413
    assert response.get_json() == {
        "ok": False,
        "error": "metrics payload is too large",
        "code": "metrics_payload_too_large",
    }


def test_metrics_exports_follow_owner_admin_and_anonymous_policy(tmp_path):
    app = create_app({"TESTING": True, "DATA_DIR": str(tmp_path / "data")})
    admin = app.test_client()
    login_default_admin(admin)

    anonymous = app.test_client()
    assert create_run(anonymous, "anonymous-run").status_code == 200
    assert anonymous.post(
        "/api/metrics/batch", json={"run_id": "anonymous-run", "samples": [sample()]}
    ).status_code == 200
    for suffix in ("", "/samples.csv", "/report.md"):
        assert anonymous.get(f"/api/runs/anonymous-run{suffix}").status_code == 403

    owner = make_owner_client(app, "owner@example.test")
    assert create_run(owner, "owner-run").status_code == 200
    assert owner.post(
        "/api/metrics/batch",
        headers={"X-CSRFToken": csrf_token(owner)},
        json={"run_id": "owner-run", "samples": [sample()]},
    ).status_code == 200
    other = make_owner_client(app, "other@example.test")
    for suffix in ("", "/samples.csv", "/report.md"):
        assert owner.get(f"/api/runs/owner-run{suffix}").status_code == 200
        assert other.get(f"/api/runs/owner-run{suffix}").status_code == 403

    for suffix in ("", "/samples.csv", "/report.md"):
        assert admin.get(f"/api/runs/anonymous-run{suffix}").status_code == 200

    assert anonymous.get("/api/runs").get_json() == []
    assert owner.get("/api/runs").get_json()[0]["run_id"] == "owner-run"
    assert admin.get("/api/runs").status_code == 200
