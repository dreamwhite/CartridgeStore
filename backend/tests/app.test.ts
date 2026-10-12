import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

describe("minimal backend runtime", () => {
  it("serves liveness without opening a database", async () => {
    const app = buildApp({
      config: loadConfig({ PRG32_BACKEND_DB: "/does/not/exist/store.sqlite" }),
      logger: false
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "prg32-cartridge-store-backend",
      status: "healthy"
    });
    await app.close();
  });

  it("reports readiness without exposing the configured database path", async () => {
    const app = buildApp({
      config: loadConfig({ PRG32_BACKEND_DB: "/does/not/exist/store.sqlite" }),
      logger: false
    });
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      ok: false,
      status: "not_ready",
      resources: { database: "unavailable" }
    });
    expect(response.body).not.toContain("/does/not/exist");
    await app.close();
  });

  it("returns a stable error envelope for unhandled route failures", async () => {
    const app = buildApp({
      config: loadConfig({ PRG32_BACKEND_DB: "/does/not/exist/store.sqlite" }),
      logger: false
    });
    app.get("/test-error", () => {
      throw new Error("private implementation detail");
    });
    const response = await app.inject({ method: "GET", url: "/test-error" });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      ok: false,
      error: "internal server error",
      code: "internal_error"
    });
    expect(response.body).not.toContain("private implementation detail");
    await app.close();
  });
});
