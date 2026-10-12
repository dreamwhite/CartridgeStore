from __future__ import annotations

import json
import threading

from simple_websocket import Client as WebSocketClient
from werkzeug.serving import make_server

from cartridge_store import create_app


def receive_json(client: WebSocketClient) -> dict:
    value = client.receive()
    assert value is not None
    return json.loads(value)


def test_multiplayer_protocol_over_real_websocket(tmp_path) -> None:
    app = create_app(
        {
            "TESTING": True,
            "DATA_DIR": str(tmp_path / "data"),
            "USERS": [{"name": "board", "role": "player", "token": "board-secret"}],
        }
    )
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"ws://127.0.0.1:{server.server_port}/api/multiplayer"
    anonymous = WebSocketClient.connect(url)
    first = WebSocketClient.connect(url)
    second = WebSocketClient.connect(url)
    try:
        anonymous.send(json.dumps({"type": "join", "signature": "synthetic-room"}))
        assert receive_json(anonymous)["error"] == "player role required"

        first.send(
            json.dumps(
                {
                    "type": "join",
                    "signature": "synthetic-room",
                    "token": "board-secret",
                    "player_id": 11,
                }
            )
        )
        assert receive_json(first) == {"type": "welcome", "player_id": 11}

        second.send(
            json.dumps(
                {
                    "type": "join",
                    "signature": "synthetic-room",
                    "token": "board-secret",
                    "player_id": 22,
                }
            )
        )
        assert receive_json(second) == {"type": "welcome", "player_id": 22}

        first.send(json.dumps({"type": "state", "x": 10, "y": 20, "frame": 7}))
        assert receive_json(second) == {
            "type": "peer",
            "player_id": 11,
            "x": 10,
            "y": 20,
            "sprite": 0,
            "flags": 0,
            "input": 0,
            "frame": 7,
        }

        second.send("not-json")
        assert receive_json(second) == {"type": "error", "error": "invalid json"}
        second.send(json.dumps({"type": "unknown"}))
        assert receive_json(second) == {"type": "error", "error": "unknown message type"}

        second.send(json.dumps({"type": "leave"}))
        assert receive_json(first) == {"type": "leave", "player_id": 22}
        second.close()
        status = app.test_client().get("/api/multiplayer/status")
        assert status.status_code == 200
        assert status.get_json()["multiplayer"]["rooms"] == {"synthetic-room": 1}
    finally:
        for client in (anonymous, first, second):
            try:
                client.close()
            except Exception:
                pass
        server.shutdown()
        thread.join(timeout=2)
