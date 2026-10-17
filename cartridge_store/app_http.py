"""HTTP request policy and catalog pagination helpers for the Flask app."""

from __future__ import annotations

import os
from typing import Any

from flask import (
    Request as FlaskRequest,
    current_app,
    request,
)


DEFAULT_MAX_UPLOAD = 8 * 1024 * 1024
DEFAULT_CATALOG_PER_PAGE = 24
MAX_CATALOG_PER_PAGE = 100


def env_bool(name: str, default: bool) -> bool:
    """Read a conventional boolean environment setting."""

    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


class CartridgeRequest(FlaskRequest):
    """Apply endpoint-specific request size limits to cartridge uploads."""

    @property
    def max_content_length(self) -> int | None:
        if self.path in {"/api/publish/bundle", "/api/publish", "/publish"}:
            return int(current_app.config["BUNDLE_MAX_ARCHIVE_BYTES"]) + int(
                current_app.config["BUNDLE_MULTIPART_OVERHEAD_BYTES"]
            )
        if self.path == "/api/metrics/batch" or (
            self.path.startswith("/api/runs")
            and self.method in {"POST", "PUT", "PATCH"}
        ):
            return int(current_app.config["METRICS_MAX_CONTENT_LENGTH"])
        return super().max_content_length


def catalog_pagination(
    items: list[dict[str, Any]],
    *,
    default_per_page: int | None = DEFAULT_CATALOG_PER_PAGE,
    max_per_page: int | None = MAX_CATALOG_PER_PAGE,
) -> dict[str, Any]:
    """Return the legacy catalog pagination response shape."""

    page = max(request.args.get("page", default=1, type=int) or 1, 1)
    per_page = request.args.get("per_page", type=int)
    if per_page is None:
        per_page = request.args.get("limit", default=default_per_page, type=int)
    if per_page is None:
        per_page = max(len(items), 1)
    per_page = max(per_page or 1, 1)
    if max_per_page is not None:
        per_page = min(per_page, max_per_page)
    total = len(items)
    pages = max((total + per_page - 1) // per_page, 1)
    page = min(page, pages)
    start = (page - 1) * per_page
    end = start + per_page
    return {
        "items": items[start:end],
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": pages,
        "has_next": page < pages,
        "has_prev": page > 1,
        "next_page": page + 1 if page < pages else None,
        "prev_page": page - 1 if page > 1 else None,
    }
