import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { buildSubmissionCartridge } from "../src/submission/prg32.js";
import { COMPATIBLE_SCHEMA_SQL } from "../src/storage-v2/schema.js";
import { inventoryLegacySnapshot } from "../src/storage-v2/legacy/inventory.js";
import type { LegacySnapshotConfig } from "../src/storage-v2/legacy/types.js";
import {
  DISPOSABLE_MIGRATION_AUTHORIZATION,
  migrateLegacySnapshot,
  verifyMigration,
  type MigrationConfig
} from "../src/storage-v2/migration/index.js";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const roots: string[] = [];

function payload(): Buffer {
  const output = Buffer.alloc(84);
  output.write("PRG2", 0, "ascii");
  output.writeUInt16LE(1, 4);
  output.writeUInt16LE(72, 8);
  output.writeUInt32LE(12, 16);
  Buffer.from("130000001300000013000000", "hex").copy(output, 72);
  return output;
}

function createSnapshot(): { root: string; config: LegacySnapshotConfig } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52c-source-"));
  roots.push(root);
  const cartridge = Buffer.from(buildSubmissionCartridge(payload(), {
    abi: "prg32-metadata-1.0",
    id: "org.example.m52c",
    title: "M5.2c Fixture",
    version: "1.0.0",
    authors: [{ name: "Fixture" }],
    tags: ["fixture"],
    runtime: { architecture: "qemu" },
    assets: { icon: "embedded" }
  }, PNG, "qemu", PNG, {
    abi: "prg32-colophon-1.0",
    title: "M5.2c Fixture",
    version: "1.0.0",
    developer: { name: "Fixture" },
    authors: [{ name: "Fixture" }],
    controls: []
  }));
  fs.mkdirSync(path.join(root, "cartridges/org.example.m52c/1.0.0"), { recursive: true });
  fs.mkdirSync(path.join(root, "pending/4"), { recursive: true });
  fs.writeFileSync(path.join(root, "cartridges/org.example.m52c/1.0.0/qemu.prg32"), cartridge);
  fs.writeFileSync(path.join(root, "pending/4/qemu.prg32"), cartridge);
  const sha256 = crypto.createHash("sha256").update(cartridge).digest("hex");
  fs.writeFileSync(path.join(root, "index.json"), JSON.stringify({
    abi: "prg32-cartridge-store-index-1.0",
    games: {
      "org.example.m52c": {
        id: "org.example.m52c",
        title: "M5.2c Fixture",
        summary: "Migration fixture",
        authors: [{ name: "Fixture" }],
        tags: ["fixture"],
        latest_version: "1.0.0",
        versions: {
          "1.0.0": {
            version: "1.0.0",
            architectures: { qemu: { architecture: "qemu", filename: "cartridges/org.example.m52c/1.0.0/qemu.prg32", size: cartridge.length, sha256, has_screenshot: true } }
          }
        }
      }
    }
  }, null, 2));
  const database = new Database(path.join(root, "cartridge_store.sqlite"));
  database.pragma("foreign_keys = ON");
  database.exec(COMPATIBLE_SCHEMA_SQL);
  database.exec(`
    CREATE TABLE download_events (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, version TEXT NOT NULL, architecture TEXT NOT NULL, user_id INTEGER, ip_hash TEXT, user_agent TEXT, downloaded_at TEXT NOT NULL);
    CREATE TABLE cartridge_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_by_user_id INTEGER REFERENCES users(id), submitted_by TEXT NOT NULL DEFAULT '', reviewed_by_user_id INTEGER REFERENCES users(id), reviewed_by TEXT NOT NULL DEFAULT '', pending_dir TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL, architectures_json TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT);
  `);
  database.prepare("INSERT INTO users(id, username, email, password_hash, role) VALUES (4, 'm52c-user', 'm52c@example.test', 'hash-only-in-db', 'publisher')").run();
  database.prepare("INSERT INTO cartridge_submissions(id, game_id, version, status, submitted_by_user_id, pending_dir, metadata_json, architectures_json, created_at) VALUES (4, 'org.example.m52c', '1.0.0', 'pending', 4, 'pending/4', ?, ?, '2026-01-01T00:00:00Z')").run(
    JSON.stringify({ abi: "prg32-metadata-1.0", id: "org.example.m52c", version: "1.0.0" }),
    JSON.stringify([{ architecture: "qemu", stored: "pending/4/qemu.prg32", file: "qemu.prg32" }])
  );
  database.prepare("INSERT INTO download_events(game_id, version, architecture, user_id, ip_hash, user_agent, downloaded_at) VALUES ('org.example.m52c', '1.0.0', 'qemu', 4, 'sensitive-hash', 'sensitive-agent', '2026-01-02T00:00:00Z')").run();
  database.close();
  fs.writeFileSync(path.join(root, ".snapshot.json"), JSON.stringify({ abi: "prg32-legacy-snapshot-1.0", state: "ready", database: "cartridge_store.sqlite", catalog: "index.json", dataRoot: ".", cartridgeRoot: "cartridges" }));
  return {
    root,
    config: { root, databasePath: "cartridge_store.sqlite", catalogPath: "index.json", dataRoot: ".", cartridgeRoot: "cartridges", preparedMarkerPath: ".snapshot.json", submissionRoot: "pending" }
  };
}

function migrationConfig(source: ReturnType<typeof createSnapshot>, targetRoot: string, extra: Partial<MigrationConfig> = {}): MigrationConfig {
  return { snapshot: source.config, targetRoot, authorization: DISPOSABLE_MIGRATION_AUTHORIZATION, ...extra };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("M5.2c disposable legacy-to-canonical migration", () => {
  it("migrates a verified snapshot, preserves compatible data, and is idempotent", () => {
    const source = createSnapshot();
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52c-target-parent-"));
    roots.push(target);
    const manifest = inventoryLegacySnapshot(source.config).manifest;
    const result = migrateLegacySnapshot(migrationConfig(source, path.join(target, "canonical"), { manifest }));
    expect(result.ok).toBe(true);
    expect(result.verification).toMatchObject({ ok: true, targetAuditOk: true, differentialOk: true, exceptionCount: 0 });
    const sqlite = new Database(path.join(target, "canonical/store.sqlite"), { readonly: true });
    expect(sqlite.prepare("SELECT cartridge_id FROM cartridges").pluck().all()).toEqual(["org.example.m52c"]);
    expect(sqlite.prepare("SELECT state FROM releases").pluck().all()).toEqual(["published"]);
    expect(sqlite.prepare("SELECT status FROM submissions").pluck().all()).toEqual(["pending_review"]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM storage_objects WHERE object_kind = 'media'").get()).toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT password_hash FROM users WHERE id = 4").get()).toEqual({ password_hash: "hash-only-in-db" });
    sqlite.close();
    const rerun = migrateLegacySnapshot(migrationConfig(source, path.join(target, "canonical"), { manifest }));
    expect(rerun).toMatchObject({ ok: true, alreadyCompleted: true });
    const verified = verifyMigration(migrationConfig(source, path.join(target, "canonical"), { manifest }));
    expect(verified.verification).toMatchObject({ ok: true, differentialOk: true });
    const cliTarget = path.join(target, "cli-canonical");
    const configPath = path.join(target, "migration-config.json");
    const resultPath = path.join(target, "migration-result.json");
    fs.writeFileSync(configPath, JSON.stringify(migrationConfig(source, cliTarget, { manifest })));
    const cli = path.resolve("node_modules/.bin/tsx");
    execFileSync(cli, ["src/storage-v2/migration/cli.ts", "migrate", "--config", configPath, "--output", resultPath], { cwd: path.resolve("."), encoding: "utf8" });
    expect(JSON.parse(fs.readFileSync(resultPath, "utf8"))).toMatchObject({ ok: true, verification: { ok: true } });
  });

  it("records a durable checkpoint and resumes after deterministic interruption", () => {
    const source = createSnapshot();
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52c-resume-parent-"));
    roots.push(target);
    const manifest = inventoryLegacySnapshot(source.config).manifest;
    const root = path.join(target, "canonical");
    expect(() => migrateLegacySnapshot(migrationConfig(source, root, { manifest, faultAt: "after-artifact" }))).toThrow("fault injected");
    const journalPath = path.join(root, "journal/migrations", `migration_${manifest.manifestSha256.slice(0, 32)}.json`);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { recoveryState: string; completedArtifacts: string[] };
    expect(journal.recoveryState).toBe("resume_available");
    expect(journal.completedArtifacts).toHaveLength(1);
    const resumed = migrateLegacySnapshot(migrationConfig(source, root, { manifest }));
    expect(resumed.ok).toBe(true);
    expect(resumed.verification?.ok).toBe(true);
    const cli = path.resolve("node_modules/.bin/tsx");
    const status = execFileSync(cli, ["src/storage-v2/migration/cli.ts", "status", "--target", root, "--migration", resumed.migrationId], { cwd: path.resolve("."), encoding: "utf8" });
    expect(JSON.parse(status)).toMatchObject({ found: true, journal: { completionState: "completed" } });
  });

  it("retains an unmappable historical download as an explicit exception", () => {
    const source = createSnapshot();
    const database = new Database(path.join(source.root, "cartridge_store.sqlite"));
    database.prepare("INSERT INTO download_events(game_id, version, architecture, user_id, downloaded_at) VALUES ('legacy-only', '0.0.1', 'qemu', NULL, '2025-12-01T00:00:00Z')").run();
    database.close();
    const targetParent = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52c-exception-parent-"));
    roots.push(targetParent);
    const manifest = inventoryLegacySnapshot(source.config).manifest;
    expect(manifest.readiness.migrationReady).toBe(true);
    const result = migrateLegacySnapshot(migrationConfig(source, path.join(targetParent, "canonical"), { manifest }));
    expect(result.verification).toMatchObject({ ok: true, exceptionCount: 1 });
    const sqlite = new Database(path.join(targetParent, "canonical/store.sqlite"), { readonly: true });
    expect(sqlite.prepare("SELECT entity_kind, reason_code, payload_json FROM migration_exceptions").get()).toMatchObject({ entity_kind: "download_event", reason_code: "download_unmapped" });
    expect(sqlite.prepare("SELECT payload_json FROM migration_exceptions").pluck().get()).not.toContain("sensitive");
    sqlite.close();
  });

  it("fails before target initialization for missing authorization or changed source", () => {
    const source = createSnapshot();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52c-gate-parent-"));
    roots.push(parent);
    const target = path.join(parent, "canonical");
    const manifest = inventoryLegacySnapshot(source.config).manifest;
    expect(() => migrateLegacySnapshot({ ...migrationConfig(source, target, { manifest }), authorization: "wrong" })).toThrow("authorization");
    expect(fs.existsSync(target)).toBe(false);
    fs.appendFileSync(path.join(source.root, "cartridges/org.example.m52c/1.0.0/qemu.prg32"), "changed");
    expect(() => migrateLegacySnapshot(migrationConfig(source, target, { manifest }))).toThrow("verification");
    expect(fs.existsSync(target)).toBe(false);
  });
});
