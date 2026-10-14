import { describe, expect, it } from "vitest";

import { DEFAULT_API_UPSTREAM, resolveApiUpstream } from "./next-proxy";

describe("Next.js API upstream resolution", () => {
  it("uses the backend-neutral Fastify default when no target is supplied", () => {
    expect(resolveApiUpstream({}, { production: true })).toEqual({
      target: DEFAULT_API_UPSTREAM,
      source: "default-fastify",
    });
  });

  it("uses PRG32_API_UPSTREAM for the standard Fastify build", () => {
    expect(resolveApiUpstream({ PRG32_API_UPSTREAM: "http://backend:5090/" }, { production: true })).toEqual({
      target: "http://backend:5090",
      source: "configured",
    });
  });

  it("keeps Flask available only through an explicit legacy target", () => {
    expect(resolveApiUpstream({ FLASK_PROXY_TARGET: "https://flask.internal:5080/" }, { production: true })).toEqual({
      target: "https://flask.internal:5080",
      source: "legacy-flask",
    });
  });

  it("rejects ambiguous standard and legacy configuration", () => {
    expect(() => resolveApiUpstream({ PRG32_API_UPSTREAM: "http://fastify:5090", FLASK_PROXY_TARGET: "http://flask:5080" })).toThrow(
      "Configure only one of PRG32_API_UPSTREAM or the legacy FLASK_PROXY_TARGET",
    );
  });

  it("rejects unsafe upstream URLs", () => {
    expect(() => resolveApiUpstream({ PRG32_API_UPSTREAM: "http://user:password@fastify:5090" })).toThrow(
      "must not contain credentials",
    );
    expect(() => resolveApiUpstream({ PRG32_API_UPSTREAM: "file:///tmp/fastify" })).toThrow(
      "must use http:// or https://",
    );
  });

  it("does not allow a loopback Flask target in a production build", () => {
    expect(() => resolveApiUpstream({ FLASK_PROXY_TARGET: "http://127.0.0.1:5080" }, { production: true })).toThrow(
      "cannot point to loopback",
    );
  });
});
