import { afterEach, describe, expect, it } from "vitest";

import { disposeDifferentialFixtures, runDifferentialGate } from "../src/storage-v2/differential/harness.js";

afterEach(() => disposeDifferentialFixtures());

describe("M5.2d storage-v2 differential compatibility gate", () => {
  it("compares populated Flask handlers with a real read-only canonical projection", () => {
    const report = runDifferentialGate();
    expect(report.abi).toBe("prg32-storage-api-differential-1.0");
    expect(report.sourceUnchanged).toBe(true);
    expect(report.targetReadOnly).toBe(true);
    expect(report.summary.cases).toBeGreaterThanOrEqual(20);
    expect(report.summary.parity).toBe(report.summary.cases);
    expect(report.summary.targetDefects).toBe(0);
    expect(report.summary.recoveryBoundaries).toBe(9);
    expect(report.summary.corruptObjectRefusal).toBe(1);
  }, 60_000);
});
