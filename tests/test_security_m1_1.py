from __future__ import annotations

import sqlite3
import time
from datetime import timedelta

from cartridge_store import create_app


def csrf(client) -> str:
    response = client.get("/auth/csrf")
    assert response.status_code == 200
    return response.get_json()["csrf_token"]


def bootstrap(client, *, token: str = "operator-bootstrap-secret", password: str = "safe-password-123"):
    return client.post(
        "/auth/bootstrap",
        headers={"X-PRG32-Bootstrap-Token": token},
        json={
            "username": "admin",
            "email": "admin@example.test",
            "password": password,
            "password_confirm": password,
        },
    )


def test_fresh_install_requires_one_time_bootstrap_and_never_accepts_known_password(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "BOOTSTRAP_TOKEN": "operator-bootstrap-secret",
        }
    )
    client = app.test_client()

    assert bootstrap(client, token="wrong-secret").status_code == 403
    with sqlite3.connect(app.config["DATABASE"]) as db:
        assert db.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0

    created = bootstrap(client)
    assert created.status_code == 201
    assert created.get_json()["user"]["role"] == "admin"
    assert bootstrap(client, password="a-different-password").status_code == 409

    fresh_client = app.test_client()
    token = csrf(fresh_client)
    known_password = fresh_client.post(
        "/auth/login",
        data={"username": "admin", "password": "password", "csrf_token": token},
    )
    assert known_password.status_code == 401
    login = fresh_client.post(
        "/auth/login",
        data={"username": "admin", "password": "safe-password-123", "csrf_token": token},
    )
    assert login.status_code == 302


def test_existing_admin_is_not_overwritten_or_reassigned(tmp_path):
    data_dir = str(tmp_path / "data")
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": data_dir,
            "BOOTSTRAP_TOKEN": "operator-bootstrap-secret",
        }
    )
    client = app.test_client()
    assert bootstrap(client).status_code == 201
    with sqlite3.connect(app.config["DATABASE"]) as db:
        admin_id = db.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()[0]

    reopened = create_app(
        {
            "TESTING": True,
            "DATA_DIR": data_dir,
            "BOOTSTRAP_TOKEN": "another-secret",
        }
    )
    reopened_client = reopened.test_client()
    assert bootstrap(reopened_client, token="another-secret").status_code == 409
    token = csrf(reopened_client)
    login = reopened_client.post(
        "/auth/login",
        data={"username": "admin", "password": "safe-password-123", "csrf_token": token},
    )
    assert login.status_code == 302
    with sqlite3.connect(reopened.config["DATABASE"]) as db:
        row = db.execute(
            "SELECT id, role FROM users WHERE username = 'admin'"
        ).fetchone()
        assert row == (admin_id, "admin")
        assert db.execute(
            "SELECT COUNT(*) FROM user_groups WHERE user_id = ?", (admin_id,)
        ).fetchone()[0] == 1


def test_session_cookie_policy_expiration_and_logout(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "BOOTSTRAP_TOKEN": "operator-bootstrap-secret",
            "SESSION_COOKIE_SECURE": True,
            "SESSION_COOKIE_SAMESITE": "Strict",
            "PERMANENT_SESSION_LIFETIME": timedelta(seconds=1),
        }
    )
    client = app.test_client()
    assert bootstrap(client).status_code == 201
    set_cookie = client.get_cookie("session")
    assert set_cookie is not None
    assert set_cookie.secure is True
    assert set_cookie.http_only is True
    assert set_cookie.same_site == "Strict"
    assert set_cookie.expires is not None

    # Itsdangerous timestamps have one-second granularity; cross two full
    # seconds so this assertion is deterministic rather than boundary-sensitive.
    time.sleep(2.1)
    assert client.get("/auth/me").status_code == 302

    token = csrf(client)
    assert client.post("/auth/login", data={
        "username": "admin",
        "password": "safe-password-123",
        "csrf_token": token,
    }).status_code == 302
    assert client.post("/auth/logout").status_code == 403
    assert client.post("/auth/logout", data={"csrf_token": csrf(client)}).status_code == 302
    assert client.get("/auth/me").status_code == 302


def test_csrf_rejects_cookie_mutations_and_allows_valid_and_bearer_requests(tmp_path):
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "BOOTSTRAP_TOKEN": "operator-bootstrap-secret",
        }
    )
    client = app.test_client()
    assert bootstrap(client).status_code == 201

    missing = client.post("/api/scores", json={"game": "pong", "player": "Ada", "score": 1})
    assert missing.status_code == 403
    assert missing.get_json()["code"] == "csrf_failed"
    invalid = client.post(
        "/api/scores",
        json={"game": "pong", "player": "Ada", "score": 1},
        headers={"X-CSRFToken": "invalid"},
    )
    assert invalid.status_code == 403
    valid = client.post(
        "/api/scores",
        json={"game": "pong", "player": "Ada", "score": 1},
        headers={"X-CSRFToken": csrf(client)},
    )
    assert valid.status_code == 200

    token_response = client.post(
        "/auth/tokens",
        json={"label": "firmware"},
        headers={"X-CSRFToken": csrf(client)},
    )
    assert token_response.status_code == 200
    api_client = app.test_client()
    bearer = api_client.post(
        "/api/scores",
        json={"game": "pong", "player": "Firmware", "score": 2},
        headers={"Authorization": f"Bearer {token_response.get_json()['token']}"},
    )
    assert bearer.status_code == 200

    login_form = client.get("/auth/login")
    assert 'name="csrf_token"' in login_form.text
