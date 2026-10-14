import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { READINESS_ABI, READINESS_GATES, ROUTE_INVENTORY } from "../src/readiness/inventory.js";
import { buildReadinessReport, stableReadinessJson } from "../src/readiness/report.js";

const repositoryRoot = path.resolve(process.cwd(), "..");

function sourceText(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

describe("M5.2f operational readiness inventory", () => {
  it("emits the versioned planning report with explicit no-go decisions", () => {
    const report = buildReadinessReport();
    expect(report.abi).toBe(READINESS_ABI);
    expect(report.planningDecision).toBe("GO");
    expect(report.operationalCutoverDecision).toBe("NO-GO");
    expect(report.flaskRetirementDecision).toBe("NO-GO");
    expect(report.versionTuple).toEqual({ schema: 2, storageLayout: 2, publicationJournal: 1, backupFormat: 3 });
    expect(stableReadinessJson()).not.toMatch(/(password_hash|encrypted_value|cookie_value|token_value)/iu);
  });

  it("covers every required contract family and keeps evidence source-backed", () => {
    const families = new Set(ROUTE_INVENTORY.map((entry) => entry.family));
    for (const required of ["catalog, versions, architectures and media", "publication and submission intake", "submission review and approval", "runs, samples, metrics exports", "score submission and leaderboard", "statistics", "multiplayer status, discovery and WebSocket relay", "generic OIDC/SAML provider login and callback", "administrative backup and restore"]) {
      expect(families.has(required)).toBe(true);
    }
    for (const entry of ROUTE_INVENTORY) {
      for (const relativePath of [entry.flaskSource, entry.fastifySource].filter((value): value is string => Boolean(value))) {
        for (const sourceFile of relativePath.split("; ").filter((value) => value.endsWith(".ts") || value.endsWith(".py"))) {
          expect(fs.existsSync(path.join(repositoryRoot, sourceFile))).toBe(true);
        }
      }
      for (const testFile of entry.tests) {
        expect(fs.existsSync(path.join(repositoryRoot, testFile))).toBe(true);
      }
    }
  });

  it("proves that no public storage-v2 route is registered", () => {
    const sourceFiles = fs.readdirSync(path.join(repositoryRoot, "backend/src"), { recursive: true })
      .filter((file): file is string => typeof file === "string" && file.endsWith(".ts"));
    const registrations = sourceFiles
      .filter((file) => !file.startsWith("storage-v2/"))
      .map((file) => sourceText(path.join("backend/src", file)))
      .flatMap((source) => [...source.matchAll(/(?:url|route|app\.(?:get|post|put|patch|delete))[^\n]*storage-v2/giu)].map((match) => match[0]));
    expect(registrations).toEqual([]);
  });

  it("keeps every operational gate evidence-driven", () => {
    expect(READINESS_GATES.length).toBeGreaterThanOrEqual(10);
    for (const gate of READINESS_GATES) {
      expect(gate.evidence.length).toBeGreaterThan(0);
      expect(gate.decision.length).toBeGreaterThan(10);
      expect(gate.blockers.length).toBeGreaterThan(0);
    }
  });
});
