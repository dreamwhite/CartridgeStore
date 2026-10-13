import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-dual-origin-"));
  roots.push(root);
  const databasePath = path.join(root, "store.sqlite");
  fs.closeSync(fs.openSync(databasePath, "a"));
  const app = buildApp({
    config: loadConfig({
      NODE_ENV: "test",
      PRG32_BACKEND_DB: databasePath,
      PRG32_BACKEND_STORE_DATA: root,
      PRG32_BACKEND_CORS_ORIGINS: "https://store.prg32.dream.test",
      PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN: "https://store.prg32.dream.test"
    }),
    logger: false
  });
  return app;
}

describe("dual-origin CORS boundary", () => {
  it("allows only the configured credentialed frontend origin", async () => {
    const app = fixture();
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/auth/csrf",
      headers: {
        origin: "https://store.prg32.dream.test",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-csrftoken"
      }
    });
    expect(allowed.statusCode).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://store.prg32.dream.test");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(allowed.headers["vary"]).toBe("Origin");

    const denied = await app.inject({
      method: "OPTIONS",
      url: "/auth/csrf",
      headers: { origin: "https://evil.example.test", "access-control-request-method": "GET" }
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ ok: false, error: "origin is not allowed", code: "cors_origin_denied" });

    const deniedRequest = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example.test" } });
    expect(deniedRequest.statusCode).toBe(403);
    expect(deniedRequest.json()).toEqual({ ok: false, error: "origin is not allowed", code: "cors_origin_denied" });
    await app.close();
  });

  it("adds CORS response headers to allowed non-preflight requests", async () => {
    const app = fixture();
    const response = await app.inject({ method: "GET", url: "/health", headers: { origin: "https://store.prg32.dream.test" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://store.prg32.dream.test");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });
});
