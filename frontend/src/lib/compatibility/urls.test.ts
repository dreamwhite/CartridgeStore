import { describe, expect, it } from "vitest";

import { compatibilityReturnPath, resolveCompatibilityRoute } from "./urls";

describe("legacy browser URL compatibility", () => {
  it("keeps catalog query parameters on a Next route", () => {
    expect(resolveCompatibilityRoute("/games/demo?version=1.2")).toMatchObject({ target: "/games/demo?version=1.2", disposition: "next" });
  });

  it("maps legacy authentication and settings URLs without changing API paths", () => {
    expect(resolveCompatibilityRoute("/auth/login?return_to=%2Fstats")).toMatchObject({ target: "/login?return_to=%2Fstats", disposition: "redirect" });
    expect(resolveCompatibilityRoute("/setup?tab=auth")).toMatchObject({ target: "/admin?tab=auth", disposition: "redirect" });
    expect(resolveCompatibilityRoute("/api/games").disposition).toBe("legacy");
  });

  it("maps profile pages to the canonical owner/admin contract", () => {
    expect(resolveCompatibilityRoute("/users/alice/runs").disposition).toBe("next");
  });

  it("rejects open redirects and preserves safe local paths", () => {
    expect(compatibilityReturnPath("/workspace?tab=mine")).toBe("/workspace?tab=mine");
    expect(compatibilityReturnPath("//evil.example/login")).toBe("/");
    expect(compatibilityReturnPath("https://evil.example/login")).toBe("/");
    expect(compatibilityReturnPath("/%2f%2fevil.example")).toBe("/");
  });
});
