import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";

import { buildSubmissionCartridge } from "../../submission/prg32.js";
import { COMPATIBLE_SCHEMA_SQL } from "../schema.js";
import { inventoryLegacySnapshot } from "../legacy/inventory.js";
import { verifyLegacyManifest } from "../legacy/manifest.js";
import type { LegacySnapshotConfig } from "../legacy/types.js";
import {
  DISPOSABLE_MIGRATION_AUTHORIZATION,
  migrateLegacySnapshot,
  type MigrationConfig
} from "../migration/index.js";
import { CanonicalReadProjection } from "./projection.js";
import { bodyEqual, headersEqual, jsonEqual, normalizeResponse } from "./normalize.js";
import type { DifferentialReport, DifferentialRequest, DifferentialResult, NormalizedResponse } from "./types.js";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const roots: string[] = [];

interface Fixture {
  readonly sourceRoot: string;
  readonly sourceConfig: LegacySnapshotConfig;
  readonly manifest: ReturnType<typeof inventoryLegacySnapshot>["manifest"];
  readonly requests: readonly DifferentialRequest[];
  readonly repositoryRoot: string;
}

interface FixtureVariant {
  readonly architecture: "esp32c6" | "qemu";
  readonly filename: string;
  readonly size: number;
  readonly sha256: string;
  readonly icon_mime: string;
  readonly screenshot_mime?: string;
  readonly has_screenshot: boolean;
  readonly has_signature: boolean;
  readonly updated_at: string;
}

interface FixtureVersion {
  readonly version: string;
  published_at: string;
  updated_at: string;
  readonly metadata: Record<string, unknown>;
  readonly colophon: Record<string, unknown>;
  readonly architectures: Record<string, FixtureVariant>;
}

interface FixtureGame {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly authors: readonly Record<string, string>[];
  readonly tags: readonly string[];
  latest_version: string;
  readonly versions: Record<string, FixtureVersion>;
  updated_at: string;
}

function payload(seed: number): Buffer {
  const output = Buffer.alloc(84);
  output.write("PRG2", 0, "ascii");
  output.writeUInt16LE(1, 4);
  output.writeUInt16LE(72, 8);
  output.writeUInt32LE(12, 16);
  Buffer.from(`${(0x13000000 + seed).toString(16).padStart(8, "0")}${"13000000"}${"13000000"}`, "hex").copy(output, 72);
  return output;
}

function metadata(id: string, title: string, version: string): Record<string, unknown> {
  return {
    abi: "prg32-metadata-1.0",
    id,
    title,
    version,
    summary: `${title} summary`,
    authors: [{ name: "Synthetic Author" }],
    tags: ["fixture", id.includes("alpha") ? "catalog" : "media"],
    runtime: { platform: "PRG32", architecture: "esp32c6", isa: "RV32I" },
    assets: { icon: { block: "ICON", mime: "image/png" } }
  };
}

function colophon(title: string, version: string): Record<string, unknown> {
  return {
    abi: "prg32-colophon-1.0",
    title,
    version,
    developer: { name: "Synthetic Author" },
    authors: [{ name: "Synthetic Author" }],
    controls: []
  };
}

function cartridge(id: string, title: string, version: string, architecture: "esp32c6" | "qemu", seed: number, screenshot: Buffer | null): Buffer {
  return Buffer.from(buildSubmissionCartridge(payload(seed), metadata(id, title, version), PNG, architecture, screenshot, colophon(title, version)));
}

function addVariant(
  games: Record<string, FixtureGame>,
  id: string,
  title: string,
  version: string,
  architecture: "esp32c6" | "qemu",
  bytes: Buffer,
  publishedAt: string,
  screenshot: boolean
): void {
  let game = games[id];
  if (!game) {
    game = {
    id,
    title,
    summary: `${title} summary`,
    authors: [{ name: "Synthetic Author" }],
    tags: ["fixture", id.includes("alpha") ? "catalog" : "media"],
    latest_version: version,
    versions: {},
    updated_at: publishedAt
    };
    games[id] = game;
  }
  game.latest_version = version > game.latest_version ? version : game.latest_version;
  game.updated_at = publishedAt > game.updated_at ? publishedAt : game.updated_at;
  let record = game.versions[version];
  if (!record) {
    record = {
    version,
    published_at: publishedAt,
    updated_at: publishedAt,
    metadata: metadata(id, title, version),
    colophon: colophon(title, version),
    architectures: {}
    };
    game.versions[version] = record;
  }
  record.published_at = publishedAt;
  record.updated_at = publishedAt;
  record.architectures[architecture] = {
    architecture,
    filename: `cartridges/${id}/${version}/${architecture}.prg32`,
    size: bytes.byteLength,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    icon_mime: "image/png",
    ...(screenshot ? { screenshot_mime: "image/png", has_screenshot: true } : { has_screenshot: false }),
    has_signature: false,
    updated_at: publishedAt
  };
}

function createFixture(): Fixture {
  const repositoryRoot = fs.existsSync(path.join(process.cwd(), "backend")) ? process.cwd() : path.resolve(process.cwd(), "..");
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52d-source-"));
  roots.push(sourceRoot);
  const games: Record<string, FixtureGame> = {};
  const files: Array<{ relative: string; bytes: Buffer }> = [];
  const add = (id: string, title: string, version: string, architecture: "esp32c6" | "qemu", seed: number, publishedAt: string, screenshot: boolean) => {
    const bytes = cartridge(id, title, version, architecture, seed, screenshot ? Buffer.from("89504e470d0a1a0a5343524e", "hex") : null);
    const relative = `cartridges/${id}/${version}/${architecture}.prg32`;
    files.push({ relative, bytes });
    addVariant(games, id, title, version, architecture, bytes, publishedAt, screenshot);
  };
  add("org.example.alpha", "Alpha Cartridge", "1.0.0", "esp32c6", 1, "2026-01-01T00:00:00Z", false);
  add("org.example.alpha", "Alpha Cartridge", "1.5.0", "qemu", 2, "2026-01-02T00:00:00Z", false);
  add("org.example.alpha", "Alpha Cartridge", "2.0.0", "esp32c6", 3, "2026-01-03T00:00:00Z", false);
  add("org.example.alpha", "Alpha Cartridge", "2.0.0", "qemu", 4, "2026-01-03T00:00:01Z", true);
  add("org.example.beta", "Beta Media", "1.0.0", "qemu", 5, "2026-01-04T00:00:00Z", false);
  const pending = cartridge("org.example.beta", "Beta Media", "1.0.0", "qemu", 6, null);
  files.push({ relative: "pending/7/qemu.prg32", bytes: pending });
  for (const file of files) {
    const absolute = path.join(sourceRoot, file.relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, file.bytes);
  }
  fs.writeFileSync(path.join(sourceRoot, "index.json"), JSON.stringify({ abi: "prg32-cartridge-store-index-1.0", games }, null, 2));

  const databasePath = path.join(sourceRoot, "cartridge_store.sqlite");
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.exec(COMPATIBLE_SCHEMA_SQL);
  database.exec(`
    CREATE TABLE download_events (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, version TEXT NOT NULL, architecture TEXT NOT NULL, user_id INTEGER, ip_hash TEXT, user_agent TEXT, downloaded_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE cartridge_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_by_user_id INTEGER REFERENCES users(id), submitted_by TEXT NOT NULL DEFAULT '', reviewed_by_user_id INTEGER REFERENCES users(id), reviewed_by TEXT NOT NULL DEFAULT '', pending_dir TEXT NOT NULL DEFAULT '', metadata_json TEXT NOT NULL, architectures_json TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT);
  `);
  database.prepare("INSERT INTO users(id, username, email, role) VALUES (7, 'fixture-user', 'fixture@example.test', 'publisher')").run();
  database.prepare("INSERT INTO scores(game, player, score, created_at, submitted_by) VALUES (?, ?, ?, ?, ?)").run("org.example.alpha", "fixture", 9001, 1_704_067_200, "fixture");
  database.prepare("INSERT INTO runs(run_id, board_id, target, started_at) VALUES (?, ?, ?, ?)").run("run-m52d", "board-m52d", "qemu", 1_704_067_200);
  database.prepare("INSERT INTO samples(run_id, frame, timestamp_ms, update_us, draw_us, present_us, frame_us, heap_free, heap_min_free, input_mask, fps_x100, upload_queue_depth) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("run-m52d", 1, 1000, 10, 20, 30, 60, 100000, 90000, 0, 6000, 0);
  database.prepare("INSERT INTO cartridge_submissions(id, game_id, version, status, submitted_by_user_id, pending_dir, metadata_json, architectures_json, created_at) VALUES (7, 'org.example.beta', '1.0.0', 'pending', 7, 'pending/7', ?, ?, '2026-01-05T00:00:00Z')").run(JSON.stringify(metadata("org.example.beta", "Beta Media", "1.0.0")), JSON.stringify([{ architecture: "qemu", stored: "pending/7/qemu.prg32", file: "qemu.prg32" }]));
  const mappedEvents = [
    ["org.example.alpha", "1.0.0", "esp32c6", 7, "2026-01-06T00:00:00Z"],
    ["org.example.alpha", "2.0.0", "qemu", null, "2026-01-07T00:00:00Z"],
    ["org.example.beta", "1.0.0", "qemu", 7, "2026-01-08T00:00:00Z"]
  ];
  for (const [gameId, version, architecture, userId, downloadedAt] of mappedEvents) {
    database.prepare("INSERT INTO download_events(game_id, version, architecture, user_id, downloaded_at) VALUES (?, ?, ?, ?, ?)").run(gameId, version, architecture, userId, downloadedAt);
  }
  database.close();
  fs.writeFileSync(path.join(sourceRoot, ".snapshot.json"), JSON.stringify({ abi: "prg32-legacy-snapshot-1.0", state: "ready", database: "cartridge_store.sqlite", catalog: "index.json", dataRoot: ".", cartridgeRoot: "cartridges", submissionRoot: "pending" }));
  const sourceConfig: LegacySnapshotConfig = { root: sourceRoot, databasePath: "cartridge_store.sqlite", catalogPath: "index.json", dataRoot: ".", cartridgeRoot: "cartridges", preparedMarkerPath: ".snapshot.json", submissionRoot: "pending" };
  const manifest = inventoryLegacySnapshot(sourceConfig).manifest;
  return {
    sourceRoot,
    sourceConfig,
    manifest,
    repositoryRoot,
    requests: [
      { method: "GET", path: "/api/games" },
      { method: "GET", path: "/api/games?q=alpha" },
      { method: "GET", path: "/api/games?search=org.example.beta" },
      { method: "GET", path: "/api/games?q=does-not-exist" },
      { method: "GET", path: "/api/games?page=1&per_page=1" },
      { method: "GET", path: "/api/games?page=2&per_page=1" },
      { method: "GET", path: "/api/games?page=999&per_page=1" },
      { method: "GET", path: "/api/games?per_page=invalid" },
      { method: "GET", path: "/api/games/org.example.alpha" },
      { method: "GET", path: "/api/games/org.example.alpha?version=1.0.0" },
      { method: "GET", path: "/api/games/org.example.alpha?version=2.0.0&architecture=qemu" },
      { method: "GET", path: "/api/games/org.example.alpha/icon?version=2.0.0&architecture=qemu" },
      { method: "GET", path: "/api/games/org.example.alpha/screenshot?version=2.0.0&architecture=qemu" },
      { method: "GET", path: "/api/games/org.example.alpha/screenshot?version=2.0.0&architecture=esp32c6" },
      { method: "GET", path: "/api/games/org.example.alpha/colophon?version=2.0.0" },
      { method: "GET", path: "/api/games/org.example.alpha/download?version=1.0.0&architecture=esp32c6" },
      { method: "GET", path: "/api/games/org.example.alpha/download?version=2.0.0&architecture=qemu" },
      { method: "GET", path: "/api/games/org.example.beta/download" },
      { method: "GET", path: "/api/games/org.example.alpha/download?architecture=unsupported" },
      { method: "GET", path: "/api/games/unknown" },
      { method: "GET", path: "/api/games/org.example.alpha?version=9.9.9" },
      { method: "GET", path: "/api/games/org.example.alpha/download?architecture=qemu&version=9.9.9" }
    ].map((item, index) => ({ ...item, path: item.path, method: "GET", case: `case-${index + 1}` } as DifferentialRequest))
  };
}

function migrationConfig(fixture: Fixture, targetRoot: string, extra: Partial<MigrationConfig> = {}): MigrationConfig {
  return { snapshot: fixture.sourceConfig, targetRoot, authorization: DISPOSABLE_MIGRATION_AUTHORIZATION, manifest: fixture.manifest, ...extra };
}

function legacyResponses(fixture: Fixture): Map<string, NormalizedResponse> {
  const flaskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52d-flask-"));
  roots.push(flaskRoot);
  fs.cpSync(fixture.sourceRoot, flaskRoot, { recursive: true });
  const requestFile = path.join(flaskRoot, "requests.json");
  fs.writeFileSync(requestFile, JSON.stringify({ repositoryRoot: fixture.repositoryRoot, dataRoot: flaskRoot, databasePath: path.join(flaskRoot, "cartridge_store.sqlite"), requests: fixture.requests.map((request, index) => ({ case: `case-${index + 1}`, path: request.path })) }));
  const python = path.join(fixture.repositoryRoot, ".venv313/bin/python");
  const executable = fs.existsSync(python) ? python : "python3";
  const helper = path.join(fixture.repositoryRoot, "backend/tests/fixtures/flask-differential-helper.py");
  const output = execFileSync(executable, [helper, requestFile], { cwd: fixture.repositoryRoot, encoding: "utf8", env: { ...process.env, SECRET_KEY: "m52d-test-only-secret" } });
  const parsed = JSON.parse(output) as { requests: Array<{ case: string; response: Record<string, unknown> }> };
  return new Map(parsed.requests.map((item) => {
    const response = item.response;
    const headers = response.headers as Record<string, string>;
    const body = Buffer.from(String(response.bodyBase64), "base64");
    return [item.case, normalizeResponse(Number(response.status), headers, body)];
  }));
}

function resultFor(request: DifferentialRequest & { case: string }, legacy: NormalizedResponse, target: NormalizedResponse): DifferentialResult {
  const json = jsonEqual(legacy, target);
  const headers = headersEqual(legacy, target);
  const binary = bodyEqual(legacy, target);
  const isDownload = request.path.includes("/download");
  const isMedia = /\/(icon|screenshot)(?:\?|$)/u.test(request.path);
  const binaryComparison = isDownload || isMedia ? (legacy.status === 200 && target.status === 200 ? binary : true) : true;
  const equal = legacy.status === target.status && json && headers && binaryComparison;
  return {
    contractId: isDownload ? "catalog.binary-download" : isMedia ? "catalog.media" : request.path.includes("/colophon") ? "catalog.colophon" : request.path.includes("/api/games/") ? "catalog.detail" : "catalog.list",
    legacyEndpoint: request.path,
    targetProjection: "storage-v2.read-only-projection",
    fixtureCase: request.case,
    evidenceSource: "flask-test-client",
    expectedStatus: legacy.status,
    actualStatus: target.status,
    jsonEqual: json,
    headersEqual: headers,
    binaryEqual: binaryComparison,
    firmwareRelevant: isDownload || request.path === "/api/games" || request.path.includes("/colophon"),
    classification: equal ? "PARITY" : "TARGET_DEFECT",
    blocking: !equal,
    legacy,
    target
  };
}

function runRecoveryRegression(fixture: Fixture): number {
  const points: Array<NonNullable<MigrationConfig["faultAt"]>> = ["after-initialize", "after-compatible-table", "after-artifact", "after-media", "after-submission", "after-telemetry", "before-finalization", "after-finalization", "before-verification"];
  let passed = 0;
  for (const point of points) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), `prg32-m52d-recovery-${point}-`));
    roots.push(parent);
    const target = path.join(parent, "canonical");
    try { migrateLegacySnapshot(migrationConfig(fixture, target, { faultAt: point })); } catch { /* deterministic crash boundary */ }
    const resumed = migrateLegacySnapshot(migrationConfig(fixture, target));
    if (!resumed.ok || !resumed.verification?.ok) throw new Error(`recovery regression failed at ${point}`);
    passed += 1;
  }
  return passed;
}

export function runDifferentialGate(): DifferentialReport {
  const fixture = createFixture();
  const inventory = inventoryLegacySnapshot(fixture.sourceConfig);
  if (!inventory.manifest.readiness.migrationReady || !verifyLegacyManifest(fixture.sourceConfig, fixture.manifest).ok) throw new Error("M5.2d synthetic source verification failed");
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-m52d-target-"));
  roots.push(parent);
  const targetRoot = path.join(parent, "canonical");
  const migrated = migrateLegacySnapshot(migrationConfig(fixture, targetRoot));
  if (!migrated.ok || !migrated.verification?.ok) throw new Error("M5.2c migration prerequisite failed");
  const legacy = legacyResponses(fixture);
  const projection = new CanonicalReadProjection(targetRoot);
  const results: DifferentialResult[] = [];
  for (const [index, request] of fixture.requests.entries()) {
    const typed = { ...request, case: `case-${index + 1}` };
    const old = legacy.get(typed.case);
    if (!old) throw new Error(`missing Flask response for ${typed.case}`);
    results.push(resultFor(typed, old, projection.request(request.path)));
  }
  projection.close();
  const targetResource = new Database(path.join(targetRoot, "store.sqlite"), { readonly: true });
  const objectRow = targetResource.prepare("SELECT o.storage_key, r.cartridge_id, r.version, a.architecture FROM storage_objects o JOIN artifacts a ON a.object_id = o.object_id JOIN releases r ON r.release_id = a.release_id WHERE o.object_kind = 'artifact' ORDER BY o.object_id LIMIT 1").get() as { storage_key: string; cartridge_id: string; version: string; architecture: string };
  targetResource.close();
  const corruptedPath = path.join(targetRoot, objectRow.storage_key);
  const originalBytes = fs.readFileSync(corruptedPath);
  fs.writeFileSync(corruptedPath, Buffer.concat([originalBytes, Buffer.from("corrupt")]))
  const corruptedProjection = new CanonicalReadProjection(targetRoot);
  const corruptRefusal = corruptedProjection.request(`/api/games/${objectRow.cartridge_id}/download?version=${objectRow.version}&architecture=${objectRow.architecture}`).status === 400;
  corruptedProjection.close();
  fs.writeFileSync(corruptedPath, originalBytes);
  if (!corruptRefusal) throw new Error("corrupt canonical object was not refused");
  const recoveryCount = runRecoveryRegression(fixture);
  const sourceAfter = inventoryLegacySnapshot(fixture.sourceConfig).manifest.source;
  const sourceUnchanged = sourceAfter.databaseFingerprint === fixture.manifest.source.databaseFingerprint && sourceAfter.storageInventoryFingerprint === fixture.manifest.source.storageInventoryFingerprint;
  const summary: Record<string, number> = { cases: results.length, parity: results.filter((item) => item.classification === "PARITY").length, targetDefects: results.filter((item) => item.classification === "TARGET_DEFECT").length, recoveryBoundaries: recoveryCount, corruptObjectRefusal: 1, historicalTelemetry: migrated.verification?.exceptionCount === 0 ? 3 : 0, operationalTelemetryParity: 0 };
  const report: DifferentialReport = { abi: "prg32-storage-api-differential-1.0", generatedAt: new Date().toISOString(), results, summary, sourceUnchanged, targetReadOnly: true };
  if (!sourceUnchanged) throw new Error("legacy source snapshot changed during differential verification");
  if (results.some((item) => item.blocking)) {
    const details = results.filter((item) => item.blocking).map((item) => `${item.fixtureCase}[${item.expectedStatus}/${item.actualStatus},json=${item.jsonEqual},headers=${item.headersEqual},bytes=${item.binaryEqual}]`).join(", ");
    const sample = results.find((item) => item.blocking);
    const sampleDiff = sample ? ` sample=${JSON.stringify({ case: sample.fixtureCase, legacy: sample.legacy.json, target: sample.target.json, legacyHeaders: sample.legacy.headers, targetHeaders: sample.target.headers }).slice(0, 4_000)}` : "";
    const headerSample = results.find((item) => item.blocking && !item.headersEqual);
    const headerDiff = headerSample && headerSample !== sample ? ` headerSample=${JSON.stringify({ case: headerSample.fixtureCase, legacy: headerSample.legacy.headers, target: headerSample.target.headers }).slice(0, 1_000)}` : "";
    throw new Error(`M5.2d differential parity failed: ${details}${sampleDiff}${headerDiff}`);
  }
  return report;
}

export function disposeDifferentialFixtures(): void {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
}
