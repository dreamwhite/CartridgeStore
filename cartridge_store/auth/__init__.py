"""Database-backed authentication and authorization helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import functools
import hashlib
import hmac
import json
import os
import secrets
import smtplib
import sqlite3
from typing import Any, Callable, Iterable

from flask import (
    Flask,
    Response,
    current_app,
    flash,
    g,
    has_app_context,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import generate_password_hash

from ..database import get_db
from .contracts import ANONYMOUS, AUTH_SCHEMA, ROLE_LEVELS, Principal


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def normalize_role(role: str) -> str:
    normalized = str(role or "").strip().lower()
    if normalized not in ROLE_LEVELS:
        raise ValueError(f"unknown role: {role!r}")
    return normalized


def role_at_least(actual: str, required: str) -> bool:
    return ROLE_LEVELS[normalize_role(actual)] >= ROLE_LEVELS[normalize_role(required)]


def _user_from_dict(data: dict[str, Any], token_hint: str = "") -> Principal:
    token = str(data.get("token") or token_hint).strip()
    if not token:
        raise ValueError("user token is required")
    role = normalize_role(str(data.get("role", "reader")))
    name = str(data.get("name") or data.get("user") or role).strip() or role
    return Principal(name=name, role=role, token=token, authenticated=True)


def _users_from_json(value: Any) -> list[Principal]:
    if isinstance(value, list):
        return [_user_from_dict(item) for item in value if isinstance(item, dict)]
    if isinstance(value, dict):
        users: list[Principal] = []
        for token, item in value.items():
            if isinstance(item, dict):
                users.append(_user_from_dict(item, token_hint=str(token)))
            else:
                users.append(
                    Principal(
                        name=str(item).strip() or "user",
                        role=normalize_role(str(item)),
                        token=str(token),
                        authenticated=True,
                    )
                )
        return users
    raise ValueError("user configuration must be a JSON array or object")


def parse_user_config(raw: Any) -> list[Principal]:
    """Parse the legacy PRG32_USERS token configuration."""

    if raw in (None, "", []):
        return []
    if isinstance(raw, (list, dict)):
        return _users_from_json(raw)
    text = str(raw).strip()
    if not text:
        return []
    if text[0] in "[{":
        return _users_from_json(json.loads(text))

    users: list[Principal] = []
    for chunk in text.split(","):
        item = chunk.strip()
        if not item:
            continue
        parts = [part.strip() for part in item.split(":", 2)]
        if len(parts) != 3:
            raise ValueError("PRG32_USERS entries must be name:role:token")
        name, role, token = parts
        users.append(
            Principal(
                name=name or role,
                role=normalize_role(role),
                token=token,
                authenticated=True,
            )
        )
    return users


def users_from_environment() -> list[Principal]:
    return parse_user_config(os.environ.get("PRG32_USERS", ""))


def configured_users() -> list[Principal]:
    raw = current_app.config.get("USERS")
    if raw is None:
        raw = os.environ.get("PRG32_USERS", "")
    return parse_user_config(raw)


def auth_is_configured() -> bool:
    return True


def extract_token_from_headers(headers: Any, query_token: str = "") -> str:
    auth_header = str(headers.get("Authorization", "")).strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    explicit = str(headers.get("X-PRG32-Token", "")).strip()
    return explicit or query_token.strip()


def request_token() -> str:
    token = extract_token_from_headers(request.headers, request.args.get("token", ""))
    if token:
        return token
    return str(request.form.get("token", "")).strip()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def init_auth_db() -> None:
    db = get_db()
    db.executescript(AUTH_SCHEMA)
    db.execute("INSERT OR IGNORE INTO groups(name) VALUES ('editors')")
    db.commit()
    ensure_default_admin()


def ensure_default_admin() -> None:
    # Fresh installations must be bootstrapped explicitly. In particular,
    # never create an administrator with a documented or deterministic
    # password. Existing installations keep their account, role, and group
    # memberships intact; the one-time bootstrap assigns the editors group
    # only to the new administrator it creates.
    return


def csrf_token() -> str:
    """Return the request's session-bound CSRF token, creating it lazily."""

    token = session.get("_csrf_token")
    if not isinstance(token, str) or len(token) < 32:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def _csrf_request_token() -> str:
    return (
        request.headers.get("X-CSRFToken", "").strip()
        or request.headers.get("X-CSRF-Token", "").strip()
        or request.form.get("csrf_token", "").strip()
    )


def _valid_csrf_token() -> bool:
    expected = session.get("_csrf_token")
    provided = _csrf_request_token()
    return (
        isinstance(expected, str)
        and bool(provided)
        and hmac.compare_digest(expected, provided)
    )


def _valid_bearer_only_request() -> bool:
    """Return true only for an authenticated token request without a session."""

    if session.get("user_id") is not None:
        return False
    raw_token = extract_token_from_headers(request.headers, request.args.get("token", ""))
    return bool(raw_token and authenticate_token(raw_token).authenticated)


def _csrf_failure() -> Response | tuple[Response, int]:
    message = "csrf token missing or invalid"
    if _wants_json():
        return jsonify({"ok": False, "error": message, "code": "csrf_failed"}), 403
    return render_template("error.html", error="CSRF validation failed."), 403


def principal_from_row(row: Any | None, *, token: str = "") -> Principal:
    if row is None:
        return ANONYMOUS
    return Principal(
        id=int(row["id"]),
        name=str(row["username"]),
        email=str(row["email"] or ""),
        role=normalize_role(str(row["role"] or "user")),
        token=token,
        authenticated=True,
        external_provider=row["external_provider"],
        groups=groups_for_user(int(row["id"])),
    )


def load_user(user_id: int) -> Principal:
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return principal_from_row(row)


def user_count() -> int:
    row = get_db().execute("SELECT COUNT(*) AS count FROM users").fetchone()
    return int(row["count"] if row else 0)


def group_id(name: str) -> int:
    normalized = str(name).strip().lower()
    if not normalized:
        raise ValueError("group name is required")
    db = get_db()
    db.execute("INSERT OR IGNORE INTO groups(name) VALUES (?)", (normalized,))
    row = db.execute("SELECT id FROM groups WHERE name = ?", (normalized,)).fetchone()
    db.commit()
    return int(row["id"])


def add_user_to_group(user_id: int, group: str) -> None:
    get_db().execute(
        "INSERT OR IGNORE INTO user_groups(user_id, group_id) VALUES (?, ?)",
        (user_id, group_id(group)),
    )
    get_db().commit()


def remove_user_from_group(user_id: int, group: str) -> None:
    get_db().execute(
        """
        DELETE FROM user_groups
        WHERE user_id = ? AND group_id = (SELECT id FROM groups WHERE name = ?)
        """,
        (user_id, group),
    )
    get_db().commit()


def set_user_group(user_id: int, group: str, enabled: bool) -> None:
    if enabled:
        add_user_to_group(user_id, group)
    else:
        remove_user_from_group(user_id, group)


def groups_for_user(user_id: int) -> tuple[str, ...]:
    rows = get_db().execute(
        """
        SELECT groups.name
        FROM user_groups
        JOIN groups ON groups.id = user_groups.group_id
        WHERE user_groups.user_id = ?
        ORDER BY groups.name
        """,
        (user_id,),
    ).fetchall()
    return tuple(str(row["name"]) for row in rows)


def set_user_groups(user_id: int, groups: Iterable[str]) -> None:
    normalized = sorted({str(group).strip().lower() for group in groups if str(group).strip()})
    db = get_db()
    db.execute("DELETE FROM user_groups WHERE user_id = ?", (user_id,))
    for group in normalized:
        db.execute(
            "INSERT OR IGNORE INTO user_groups(user_id, group_id) VALUES (?, ?)",
            (user_id, group_id(group)),
        )
    db.commit()


def principal_in_group(principal: Principal, group: str) -> bool:
    return str(group).strip().lower() in principal.groups


def upsert_external_user(
    *,
    provider: str,
    external_id: str,
    email: str,
    username: str = "",
    role: str = "user",
) -> int:
    provider = str(provider).strip().lower()
    external_id = str(external_id).strip()
    email = _normalize_email(email)
    username = str(username or email or external_id).strip()
    if not provider or not external_id or not email:
        raise ValueError("provider, external_id, and email are required")
    role = normalize_role(role)
    db = get_db()
    row = db.execute(
        """
        SELECT id
        FROM users
        WHERE external_provider = ? AND external_id = ?
        """,
        (provider, external_id),
    ).fetchone()
    if row is None:
        row = db.execute(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            (email, username),
        ).fetchone()
    if row is None:
        cursor = db.execute(
            """
            INSERT INTO users(username, email, role, external_provider, external_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (username, email, role, provider, external_id),
        )
        db.commit()
        return int(cursor.lastrowid)
    db.execute(
        """
        UPDATE users
        SET email = ?, external_provider = ?, external_id = ?
        WHERE id = ?
        """,
        (email, provider, external_id, int(row["id"])),
    )
    db.commit()
    return int(row["id"])


def authenticate_token(token: str, users: Iterable[Principal] | None = None) -> Principal:
    if not token:
        return ANONYMOUS

    if has_app_context():
        row = get_db().execute(
            """
            SELECT users.*, api_tokens.id AS token_id
            FROM api_tokens
            JOIN users ON users.id = api_tokens.user_id
            WHERE api_tokens.token_hash = ?
            """,
            (token_hash(token),),
        ).fetchone()
        if row:
            get_db().execute(
                "UPDATE api_tokens SET last_used = ? WHERE id = ?",
                (utc_now(), row["token_id"]),
            )
            get_db().commit()
            return principal_from_row(row, token=token)

    for user in users if users is not None else configured_users():
        if hmac.compare_digest(token, user.token):
            return user
    return ANONYMOUS


def current_principal() -> Principal:
    principal = getattr(g, "prg32_principal", None)
    if principal is not None:
        return principal

    user_id = session.get("user_id")
    if user_id is not None:
        try:
            principal = load_user(int(user_id))
        except (TypeError, ValueError):
            principal = ANONYMOUS
        if principal.authenticated:
            g.prg32_principal = principal
            return principal

    principal = authenticate_token(request_token())
    g.prg32_principal = principal
    return principal


def _wants_json() -> bool:
    if request.path.startswith("/api/") or request.is_json:
        return True
    best = request.accept_mimetypes.best_match(["application/json", "text/html"])
    return best == "application/json" and request.accept_mimetypes[best] > 0


def _auth_failure(message: str, status: int) -> Response | tuple[Response, int]:
    if _wants_json():
        return jsonify({"ok": False, "error": message, "user": current_principal().as_dict()}), status
    if status == 401:
        return redirect(url_for("auth_login", next=request.full_path))
    return render_template("error.html", error=message), status


def login_required(func: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        if current_principal().authenticated:
            return func(*args, **kwargs)
        return _auth_failure("login required", 401)

    return wrapper


def admin_required(func: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        principal = current_principal()
        if not principal.authenticated:
            return _auth_failure("login required", 401)
        if not role_at_least(principal.role, "admin"):
            return _auth_failure("admin role required", 403)
        return func(*args, **kwargs)

    return wrapper


def group_required(group: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    required = str(group).strip().lower()

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any):
            principal = current_principal()
            if not principal.authenticated:
                return _auth_failure("login required", 401)
            if principal_in_group(principal, required):
                return func(*args, **kwargs)
            return _auth_failure(f"{required} group required", 403)

        return wrapper

    return decorator


editor_required = group_required("editors")


def require_role(role: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    required = normalize_role(role)

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any):
            principal = current_principal()
            if principal.authenticated and role_at_least(principal.role, required):
                return func(*args, **kwargs)
            status = 403 if principal.authenticated else 401
            return _auth_failure(f"{required} role required", status)

        return wrapper

    return decorator


def _next_url(default: str = "index") -> str:
    target = request.args.get("next") or request.form.get("next") or ""
    if target.startswith("/") and not target.startswith("//"):
        return target
    return url_for(default)


def _token_response(token_id: int, label: str, token: str) -> dict[str, Any]:
    return {"ok": True, "id": token_id, "label": label, "token": token}


def _token_record(row: Any) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "label": str(row["label"] or "API token"),
        "created_at": str(row["created_at"]),
        "last_used": str(row["last_used"] or ""),
    }


def _tokens_for_user(user_id: int) -> list[dict[str, Any]]:
    rows = get_db().execute(
        """
        SELECT id, label, created_at, last_used
        FROM api_tokens
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    return [_token_record(row) for row in rows]


def _normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def _registration_expires_at() -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")


def _create_registration_token(email: str) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        """
        UPDATE registration_tokens
        SET used_at = datetime('now')
        WHERE email = ? AND used_at IS NULL
        """,
        (email,),
    )
    db.execute(
        """
        INSERT INTO registration_tokens(email, token_hash, expires_at)
        VALUES (?, ?, ?)
        """,
        (email, token_hash(token), _registration_expires_at()),
    )
    db.commit()
    return token


def _load_registration_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT *
        FROM registration_tokens
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at > datetime('now')
        """,
        (token_hash(token),),
    ).fetchone()
    return dict(row) if row else None


def _mark_registration_token_used(token_id: int) -> None:
    get_db().execute(
        "UPDATE registration_tokens SET used_at = datetime('now') WHERE id = ?",
        (token_id,),
    )
    get_db().commit()


def _send_registration_email(email: str, link: str) -> None:
    if current_app.config.get("TESTING"):
        current_app.extensions["prg32_last_registration"] = {
            "email": email,
            "link": link,
            "token": link.rsplit("token=", 1)[-1],
        }
        return
    try:
        from ..settings import get_setting

        host = os.environ.get("PRG32_SMTP_HOST", get_setting("smtp_host", "")).strip()
        port = int(os.environ.get("PRG32_SMTP_PORT", get_setting("smtp_port", "587")))
        sender = os.environ.get("PRG32_SMTP_FROM", get_setting("smtp_from", "noreply@localhost"))
        username = os.environ.get("PRG32_SMTP_USER", get_setting("smtp_user", ""))
        password = os.environ.get("PRG32_SMTP_PASSWORD", get_setting("smtp_password", ""))
        tls_default = get_setting("smtp_tls", "true")
    except Exception:
        host = os.environ.get("PRG32_SMTP_HOST", "").strip()
        port = int(os.environ.get("PRG32_SMTP_PORT", "587"))
        sender = os.environ.get("PRG32_SMTP_FROM", "noreply@localhost")
        username = os.environ.get("PRG32_SMTP_USER", "")
        password = os.environ.get("PRG32_SMTP_PASSWORD", "")
        tls_default = "true"
    if not host:
        current_app.logger.warning("Registration link for %s: %s", email, link)
        return
    use_tls = os.environ.get("PRG32_SMTP_TLS", tls_default).lower() not in {"0", "false", "no"}

    message = EmailMessage()
    message["From"] = sender
    message["To"] = email
    message["Subject"] = "Complete your PRG32 Cartridge Store registration"
    message.set_content(
        "Open this link to finish your PRG32 Cartridge Store registration:\n\n"
        f"{link}\n\n"
        "The link expires in 24 hours.\n"
    )
    with smtplib.SMTP(host, port, timeout=10) as smtp:
        if use_tls:
            smtp.starttls()
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


def register_auth_routes(app: Flask) -> None:
    from .local import (
        authenticate_local_user,
        create_local_user,
        validate_email_registration,
        validate_registration_password,
    )
    from .ldap_adapter import register_adapter as register_ldap_adapter
    from .oidc_adapter import register_adapter as register_oidc_adapter
    from .saml_adapter import register_adapter as register_saml_adapter

    @app.before_request
    def before_auth_request() -> None:
        init_auth_db()

    @app.before_request
    def enforce_csrf() -> Response | tuple[Response, int] | None:
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return None
        # Firmware and command-line clients authenticate with a bearer/API
        # token. They do not have a browser session and must remain compatible
        # with the existing API contracts.
        if _valid_bearer_only_request():
            return None
        # The bootstrap secret is the explicit one-time authenticator for a
        # fresh install; it is not a browser-session mutation.
        if request.endpoint == "auth_bootstrap":
            return None
        # Login and registration are anonymous browser forms, so protect them
        # even before a user session exists. Protected application routes are
        # checked only when a valid cookie session is present; unauthenticated
        # requests then retain their existing 401/redirect behavior.
        anonymous_auth_mutations = {
            "auth_login",
            "auth_register",
            "auth_register_complete",
        }
        if request.endpoint in anonymous_auth_mutations:
            return None if _valid_csrf_token() else _csrf_failure()
        if session.get("user_id") is None or not current_principal().authenticated:
            return None
        return None if _valid_csrf_token() else _csrf_failure()

    @app.context_processor
    def inject_current_user() -> dict[str, Any]:
        return {"current_user": current_principal(), "csrf_token": csrf_token}

    @app.get("/auth/csrf")
    def auth_csrf():
        response = jsonify({"ok": True, "csrf_token": csrf_token()})
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.post("/auth/bootstrap")
    def auth_bootstrap():
        configured = str(current_app.config.get("BOOTSTRAP_TOKEN", ""))
        provided = request.headers.get("X-PRG32-Bootstrap-Token", "").strip()
        if not configured:
            return jsonify({"ok": False, "error": "bootstrap unavailable"}), 404
        if not provided or not hmac.compare_digest(configured, provided):
            return jsonify({"ok": False, "error": "invalid bootstrap token"}), 403

        db = get_db()
        payload = request.get_json(silent=True) if request.is_json else request.form
        payload = payload or {}
        username = str(payload.get("username", "")).strip()
        email = _normalize_email(str(payload.get("email", "")))
        password = str(payload.get("password", ""))
        password_confirm = str(payload.get("password_confirm", password))
        errors: list[str] = []
        if not username or len(username) > 80:
            errors.append("username is required and must be at most 80 characters")
        if not email or "@" not in email:
            errors.append("email must be valid")
        if len(password) < 10:
            errors.append("password must be at least 10 characters")
        if password != password_confirm:
            errors.append("password confirmation does not match")
        if errors:
            return jsonify({"ok": False, "error": "; ".join(errors)}), 400

        try:
            # Serialize the check and insert so two first-run requests cannot
            # both create administrator accounts with the same setup secret.
            db.execute("BEGIN IMMEDIATE")
            existing_admin = db.execute(
                "SELECT id FROM users WHERE role = 'admin' OR username = 'admin' LIMIT 1"
            ).fetchone()
            completed = db.execute(
                "SELECT value FROM store_settings WHERE key = 'auth_bootstrap_completed'"
            ).fetchone()
            if existing_admin is not None or (completed and completed["value"] == "true"):
                db.rollback()
                return jsonify({"ok": False, "error": "bootstrap already completed"}), 409

            cursor = db.execute(
                """
                INSERT INTO users(username, email, password_hash, role)
                VALUES (?, ?, ?, 'admin')
                """,
                (username, email, generate_password_hash(password)),
            )
            db.execute("INSERT OR IGNORE INTO groups(name) VALUES ('editors')")
            group = db.execute("SELECT id FROM groups WHERE name = 'editors'").fetchone()
            db.execute(
                "INSERT OR IGNORE INTO user_groups(user_id, group_id) VALUES (?, ?)",
                (int(cursor.lastrowid), int(group["id"])),
            )
            db.execute(
                """
                INSERT INTO store_settings(key, value)
                VALUES ('auth_bootstrap_completed', 'true')
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """
            )
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify({"ok": False, "error": "username or email already exists"}), 409

        user_id = int(cursor.lastrowid)
        session.clear()
        session.permanent = True
        session["user_id"] = user_id
        session["role"] = "admin"
        return jsonify({"ok": True, "user": load_user(user_id).as_dict()}), 201

    @app.get("/auth/register")
    def auth_register_form():
        return render_template("auth_register.html")

    @app.post("/auth/register")
    def auth_register():
        form = request.get_json(silent=True) if request.is_json else request.form
        form = form or {}
        errors = validate_email_registration(form)
        allow_registration = True
        email = _normalize_email(form.get("email", ""))
        try:
            from ..settings import get_setting

            allow_registration = get_setting("auth_allow_registration", "true") == "true"
            domain = get_setting("auth_require_email_domain", "")
        except Exception:
            domain = ""

        if not allow_registration:
            errors.append("registration is closed")
        if domain:
            if not email.endswith("@" + domain.lower().lstrip("@")):
                errors.append(f"email must belong to {domain}")
        if errors:
            if _wants_json():
                return jsonify({"ok": False, "error": "; ".join(errors)}), 400
            return render_template("auth_register.html", errors=errors), 400

        existing = get_db().execute(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            (email, email),
        ).fetchone()
        if existing is None:
            token = _create_registration_token(email)
            link = url_for("auth_register_complete_form", token=token, _external=True)
            _send_registration_email(email, link)
        if _wants_json():
            return jsonify({"ok": True, "email": email, "message": "registration email sent"})
        return render_template("auth_register_sent.html", email=email)

    @app.get("/auth/register/complete")
    def auth_register_complete_form():
        token = request.args.get("token", "")
        record = _load_registration_token(token)
        if record is None:
            return render_template("error.html", error="Registration link is invalid or expired."), 400
        return render_template("auth_register_complete.html", email=record["email"], token=token)

    @app.post("/auth/register/complete")
    def auth_register_complete():
        form = request.get_json(silent=True) if request.is_json else request.form
        form = form or {}
        token = str(form.get("token", ""))
        record = _load_registration_token(token)
        if record is None:
            if _wants_json():
                return jsonify({"ok": False, "error": "registration link is invalid or expired"}), 400
            return render_template("error.html", error="Registration link is invalid or expired."), 400

        errors = validate_registration_password(form)
        if errors:
            if _wants_json():
                return jsonify({"ok": False, "error": "; ".join(errors)}), 400
            return render_template(
                "auth_register_complete.html",
                email=record["email"],
                token=token,
                errors=errors,
            ), 400

        email = _normalize_email(record["email"])
        existing = get_db().execute(
            "SELECT id FROM users WHERE email = ? OR username = ?",
            (email, email),
        ).fetchone()
        if existing is not None:
            _mark_registration_token_used(int(record["id"]))
            if _wants_json():
                return jsonify({"ok": False, "error": "account already exists"}), 400
            return render_template("error.html", error="Account already exists."), 400

        try:
            from ..settings import get_setting

            role = get_setting("auth_default_role", "user")
        except Exception:
            role = "user"
        if role not in ("user", "admin"):
            role = "user"
        user_id = create_local_user(
            email,
            email,
            str(form["password"]),
            role=role,
        )
        if role == "admin":
            add_user_to_group(user_id, "editors")
        _mark_registration_token_used(int(record["id"]))
        session.clear()
        session.permanent = True
        session["user_id"] = user_id
        session["role"] = role
        if _wants_json():
            return jsonify({"ok": True, "user": load_user(user_id).as_dict()})
        flash("Account created.")
        return redirect(_next_url())

    @app.get("/auth/login")
    def auth_login_form():
        return render_template("auth_login.html", next=request.args.get("next", ""))

    @app.post("/auth/login")
    def auth_login():
        form = request.get_json(silent=True) if request.is_json else request.form
        form = form or {}
        username = str(form.get("username", ""))
        password = str(form.get("password", ""))
        principal = authenticate_local_user(username, password)
        if not principal.authenticated:
            if _wants_json():
                return jsonify({"ok": False, "error": "invalid username or password"}), 401
            return render_template("auth_login.html", error="Invalid username or password."), 401
        get_db().execute(
            "UPDATE users SET last_login = ? WHERE id = ?",
            (utc_now(), principal.id),
        )
        get_db().commit()
        session.clear()
        session.permanent = True
        session["user_id"] = principal.id
        session["role"] = principal.role
        if _wants_json():
            return jsonify({"ok": True, "user": principal.as_dict()})
        return redirect(_next_url())

    @app.post("/auth/logout")
    @login_required
    def auth_logout():
        session.clear()
        if _wants_json():
            return jsonify({"ok": True})
        return redirect(url_for("index"))

    @app.get("/auth/me")
    @login_required
    def auth_me():
        return jsonify({"ok": True, "user": current_principal().as_dict()})

    @app.get("/auth/tokens")
    @login_required
    def auth_tokens():
        tokens = _tokens_for_user(int(current_principal().id))
        if _wants_json():
            return jsonify({"ok": True, "tokens": tokens})
        return render_template("auth_tokens.html", tokens=tokens)

    @app.post("/auth/tokens")
    @login_required
    def auth_create_token():
        principal = current_principal()
        label = request.form.get("label", "")
        if request.is_json:
            data = request.get_json(silent=True) or {}
            label = data.get("label", label)
        label = str(label or "API token").strip()[:80]
        token = "prg32_" + secrets.token_urlsafe(32)
        cursor = get_db().execute(
            "INSERT INTO api_tokens(user_id, token_hash, label) VALUES (?, ?, ?)",
            (principal.id, token_hash(token), label),
        )
        get_db().commit()
        response = _token_response(int(cursor.lastrowid), label, token)
        if request.is_json or _wants_json():
            return jsonify(response)
        return render_template(
            "auth_tokens.html",
            tokens=_tokens_for_user(int(principal.id)),
            created_token=token,
        )

    @app.patch("/auth/tokens/<int:token_id>")
    @login_required
    def auth_update_token(token_id: int):
        data = request.get_json(silent=True) or {}
        label = str(data.get("label") or "").strip()[:80]
        if not label:
            return jsonify({"ok": False, "error": "label is required"}), 400
        cursor = get_db().execute(
            "UPDATE api_tokens SET label = ? WHERE id = ? AND user_id = ?",
            (label, token_id, current_principal().id),
        )
        get_db().commit()
        if cursor.rowcount == 0:
            return jsonify({"ok": False, "error": "token not found"}), 404
        return jsonify({"ok": True, "id": token_id, "label": label})

    @app.post("/auth/tokens/<int:token_id>/update")
    @login_required
    def auth_update_token_form(token_id: int):
        label = request.form.get("label", "").strip()[:80]
        if not label:
            flash("Token label is required.")
        else:
            cursor = get_db().execute(
                "UPDATE api_tokens SET label = ? WHERE id = ? AND user_id = ?",
                (label, token_id, current_principal().id),
            )
            get_db().commit()
            flash("Token updated." if cursor.rowcount else "Token not found.")
        return redirect(url_for("auth_tokens"))

    @app.delete("/auth/tokens/<int:token_id>")
    @login_required
    def auth_delete_token(token_id: int):
        cursor = get_db().execute(
            "DELETE FROM api_tokens WHERE id = ? AND user_id = ?",
            (token_id, current_principal().id),
        )
        get_db().commit()
        return jsonify({"ok": cursor.rowcount > 0})

    @app.post("/auth/tokens/<int:token_id>/revoke")
    @login_required
    def auth_delete_token_form(token_id: int):
        cursor = get_db().execute(
            "DELETE FROM api_tokens WHERE id = ? AND user_id = ?",
            (token_id, current_principal().id),
        )
        get_db().commit()
        flash("Token revoked." if cursor.rowcount else "Token not found.")
        return redirect(url_for("auth_tokens"))

    register_ldap_adapter(app)
    register_saml_adapter(app)
    register_oidc_adapter(app)
