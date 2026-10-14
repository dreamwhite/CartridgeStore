import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLASK_ROUTE_PATHS,
  FUNCTIONAL_CAPABILITIES,
  FUNCTIONAL_PARITY_ABI,
  buildFunctionalParityAudit,
  stableFunctionalParityJson
} from "../src/readiness/functional-parity.js";

const repositoryRoot = path.resolve(process.cwd(), "..");

function sourceText(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function normalizeFlaskPath(value: string): string {
  return value.replace(/<[^:>]+:([^>]+)>/gu, ":$1").replace(/<([^>]+)>/gu, ":$1");
}

function flaskDecoratorPaths(): string[] {
  const files = [
    "cartridge_store/app.py",
    "cartridge_store/auth/__init__.py",
    "cartridge_store/auth/oidc_adapter.py",
    "cartridge_store/auth/saml_adapter.py",
    "cartridge_store/metrics.py",
    "cartridge_store/multiplayer.py",
    "cartridge_store/review.py",
    "cartridge_store/scores.py",
    "cartridge_store/stats.py",
    "cartridge_store/users.py"
  ];
  const paths = new Set<string>();
  for (const file of files) {
    const text = sourceText(file);
    for (const match of text.matchAll(/@(?:app|sock)\.(?:get|post|put|patch|delete|route)\("([^"]+)"/gu)) {
      paths.add(normalizeFlaskPath(match[1]));
    }
  }
  return [...paths].sort();
}

describe("M5.2g.6 full functional parity audit", () => {
  it("accounts for every explicitly registered Flask route", () => {
    expect(flaskDecoratorPaths()).toEqual([...FLASK_ROUTE_PATHS].sort());
  });

  it("keeps every capability claim source-backed", () => {
    for (const capability of FUNCTIONAL_CAPABILITIES) {
      expect(capability.evidence.length).toBeGreaterThan(0);
      expect(capability.blockers.length).toBeGreaterThan(0);
      for (const relativePath of [...capability.flaskSources, ...capability.fastifySources, ...capability.frontendSources]) {
        expect(fs.existsSync(path.join(repositoryRoot, relativePath)), relativePath).toBe(true);
      }
    }
  });

  it("records canonical runtime independence and explicit no-go decisions", () => {
    const report = buildFunctionalParityAudit("2026-10-14T00:00:00.000Z");
    expect(report.abi).toBe(FUNCTIONAL_PARITY_ABI);
    expect(report.flaskRouteCount).toBe(FLASK_ROUTE_PATHS.length);
    expect(report.canonicalRuntime.canonicalCatalogReadsLegacyObjects).toBe(false);
    expect(report.canonicalRuntime.canonicalDiscoveryReadsLegacyDatabase).toBe(false);
    expect(report.canonicalRuntime.canonicalAdminReadsLegacyCatalog).toBe(false);
    expect(report.operationalCutoverDecision).toBe("NO-GO");
    expect(report.flaskRetirementDecision).toBe("NO-GO");
    expect(stableFunctionalParityJson("2026-10-14T00:00:00.000Z")).not.toMatch(/(password_hash|encrypted_value|cookie_value|token_value)/iu);
  });
});
