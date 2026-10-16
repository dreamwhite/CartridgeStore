import { describe, expect, it } from "vitest";

import { exploreRedirectPath } from "./catalog-compat";

describe("catalog route compatibility", () => {
  it("redirects legacy root catalog queries to Explore without renaming them", () => {
    expect(exploreRedirectPath({ q: "space opera", architecture: "qemu", sort: "updated", page: "2" })).toBe(
      "/explore?q=space+opera&architecture=qemu&sort=updated&page=2",
    );
  });

  it("leaves the landing route clean when no catalog query is present", () => {
    expect(exploreRedirectPath({})).toBeNull();
  });
});
