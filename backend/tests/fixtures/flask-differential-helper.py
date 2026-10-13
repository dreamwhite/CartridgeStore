#!/usr/bin/env python3
"""Run real Flask test-client requests for the disposable M5.2d gate."""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path


def response_record(response):
    body = response.get_data()
    content_type = response.headers.get("Content-Type", "")
    payload = None
    if "application/json" in content_type:
        try:
            payload = response.get_json(silent=True)
        except Exception:  # pragma: no cover - Flask owns JSON decoding here.
            payload = None
    headers = {
        key.lower(): response.headers[key]
        for key in ("Content-Type", "Content-Disposition", "Content-Length", "Cache-Control", "ETag")
        if key in response.headers
    }
    return {
        "status": response.status_code,
        "headers": headers,
        "json": payload,
        "bodyBase64": base64.b64encode(body).decode("ascii"),
    }


def main() -> int:
    request_file = Path(sys.argv[1])
    config = json.loads(request_file.read_text(encoding="utf-8"))
    root = Path(config["repositoryRoot"]).resolve()
    sys.path.insert(0, str(root))
    os.environ["SECRET_KEY"] = "m52d-test-only-secret"

    from cartridge_store import create_app

    app = create_app({
        "TESTING": True,
        "DATA_DIR": str(Path(config["dataRoot"]).resolve()),
        "DATABASE": str(Path(config["databasePath"]).resolve()),
        "SECRET_KEY": "m52d-test-only-secret",
    })
    records = []
    with app.test_client() as client:
        for item in config["requests"]:
            response = client.get(item["path"])
            records.append({"case": item["case"], "response": response_record(response)})
    print(json.dumps({"requests": records}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
