import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { openTargetStorage } from "../database.js";
import { readStorageObjectRow } from "../objects.js";
import type Database from "better-sqlite3";
import type { NormalizedResponse } from "./types.js";
import { normalizeResponse } from "./normalize.js";

type Query = Record<string, string | undefined>;

function errorResponse(): NormalizedResponse {
  const body = Buffer.from(JSON.stringify({ ok: false, error: "invalid request", code: "invalid_request" }));
  return normalizeResponse(400, { "content-type": "application/json", "content-length": String(body.byteLength) }, body);
}

function parseQuery(pathValue: string): { pathname: string; query: Query } {
  const url = new URL(pathValue, "http://storage-v2.test");
  const query: Query = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  return { pathname: url.pathname, query };
}

function jsonParse(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function publicErrorOr<T>(callback: () => T): T | NormalizedResponse {
  try { return callback(); } catch { return errorResponse(); }
}

function latestRelease(sqlite: Database.Database, cartridgeId: string, version?: string): Record<string, unknown> | null {
  if (version !== undefined) {
    return (sqlite.prepare("SELECT * FROM releases WHERE cartridge_id = ? AND version = ? AND state = 'published' ORDER BY revision DESC LIMIT 1").get(cartridgeId, version) as Record<string, unknown> | undefined) ?? null;
  }
  return (sqlite.prepare("SELECT * FROM releases WHERE cartridge_id = ? AND state = 'published' ORDER BY published_order DESC, release_id DESC LIMIT 1").get(cartridgeId) as Record<string, unknown> | undefined) ?? null;
}

function variant(sqlite: Database.Database, releaseId: string, architecture: string): Record<string, unknown> | null {
  const row = sqlite.prepare(
    `SELECT a.architecture, a.compatibility_json, o.object_id, o.storage_key, o.sha256, o.size_bytes, o.media_type, o.state
       FROM artifacts a JOIN storage_objects o ON o.object_id = a.object_id
      WHERE a.release_id = ? AND a.architecture = ? AND a.state = 'published' AND o.state = 'available'`
  ).get(releaseId, architecture) as Record<string, unknown> | undefined;
  if (!row) return null;
  const compatibility = recordValue(jsonParse(row.compatibility_json, {}));
  const legacy = recordValue(compatibility?.legacyPublicVariant);
  if (legacy) return legacy;
  return {
    architecture,
    size: Number(row.size_bytes),
    sha256: String(row.sha256),
    has_screenshot: false,
    has_signature: false
  };
}

function publicGame(sqlite: Database.Database, cartridgeId: string, version?: string): Record<string, unknown> {
  const cartridge = sqlite.prepare("SELECT * FROM cartridges WHERE cartridge_id = ? AND state = 'active'").get(cartridgeId) as Record<string, unknown> | undefined;
  if (!cartridge) throw new Error("game not found");
  const release = latestRelease(sqlite, cartridgeId, version);
  if (!release) throw new Error("version not found");
  const current = latestRelease(sqlite, cartridgeId);
  if (!current) throw new Error("version not found");
  const releases = sqlite.prepare("SELECT version FROM releases WHERE cartridge_id = ? AND state = 'published'").all(cartridgeId) as Array<{ version: string }>;
  const artifacts = sqlite.prepare("SELECT architecture FROM artifacts WHERE release_id = ? AND state = 'published' ORDER BY architecture").all(release.release_id) as Array<{ architecture: string }>;
  const variants: Record<string, unknown> = {};
  for (const item of artifacts) {
    const value = variant(sqlite, String(release.release_id), item.architecture);
    if (!value) throw new Error("artifact is unavailable");
    variants[item.architecture] = value;
  }
  return {
    id: cartridgeId,
    title: String(current.title),
    summary: typeof current.summary === "string" ? current.summary : "",
    authors: jsonParse(current.authors_json, []),
    tags: jsonParse(current.tags_json, []),
    latest_version: String(current.version),
    selected_version: String(release.version),
    versions: releases.map((item) => item.version).sort(),
    architectures: Object.keys(variants).sort(),
    metadata: jsonParse(release.metadata_json, null),
    colophon: release.colophon_json ? jsonParse(release.colophon_json, null) : null,
    variants,
    publisher: "",
    updated_at: String(current.published_at ?? current.created_at)
  };
}

function pagination(items: readonly Record<string, unknown>[], query: Query): Record<string, unknown> {
  const paginated = ["page", "per_page", "limit"].some((key) => query[key] !== undefined);
  const pageValue = Number.parseInt(query.page ?? "1", 10);
  const requested = query.per_page ?? query.limit;
  const parsedRequested = requested === undefined ? undefined : Number.parseInt(requested, 10);
  const perPageValue = requested === undefined || !Number.isFinite(parsedRequested) ? (paginated ? 24 : Math.max(items.length, 1)) : parsedRequested;
  const page = Number.isFinite(pageValue) ? Math.max(pageValue || 1, 1) : 1;
  const perPage = Math.min(Math.max(perPageValue || 1, 1), paginated ? 100 : Number.MAX_SAFE_INTEGER);
  const total = items.length;
  const pages = Math.max(Math.ceil(total / perPage), 1);
  const boundedPage = Math.min(page, pages);
  const start = (boundedPage - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: boundedPage,
    per_page: perPage,
    total,
    pages,
    has_next: boundedPage < pages,
    has_prev: boundedPage > 1,
    next_page: boundedPage < pages ? boundedPage + 1 : null,
    prev_page: boundedPage > 1 ? boundedPage - 1 : null
  };
}

function readObject(root: string, sqlite: Database.Database, objectId: string, expectedKind: "artifact" | "media"): { bytes: Buffer; mediaType: string } {
  const row = readStorageObjectRow(sqlite, objectId);
  if (!row || row.objectKind !== expectedKind || row.state !== "available") throw new Error("storage object unavailable");
  const candidate = path.resolve(root, row.storageKey);
  const objectRoot = path.resolve(root, "storage/objects");
  const relative = path.relative(objectRoot, candidate);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("storage path is unsafe");
  let current = objectRoot;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("storage path is unsafe");
  }
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) throw new Error("storage object is missing");
  const bytes = fs.readFileSync(candidate);
  if (bytes.byteLength !== row.sizeBytes || crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new Error("storage object integrity failed");
  return { bytes, mediaType: row.mediaType };
}

function artifactRow(sqlite: Database.Database, releaseId: string, architecture?: string): Record<string, unknown> {
  const selected = architecture ?? "esp32c6";
  const row = sqlite.prepare("SELECT a.architecture, a.object_id FROM artifacts a WHERE a.release_id = ? AND a.architecture = ? AND a.state = 'published'").get(releaseId, selected) as Record<string, unknown> | undefined;
  if (!row) throw new Error("architecture not found");
  return row;
}

export class CanonicalReadProjection {
  private readonly resource;

  constructor(private readonly root: string) {
    this.resource = openTargetStorage(root, "read-only");
  }

  close(): void { this.resource.close(); }

  request(pathValue: string): NormalizedResponse {
    return publicErrorOr(() => {
      const { pathname, query } = parseQuery(pathValue);
      if (pathname === "/api/games") {
        const rows = this.resource.sqlite.prepare("SELECT cartridge_id FROM cartridges WHERE state = 'active' ORDER BY cartridge_id").all() as Array<{ cartridge_id: string }>;
        const needle = (query.q ?? query.search ?? "").trim().toLowerCase();
        const games = rows.map((row) => publicGame(this.resource.sqlite, row.cartridge_id)).filter((game) => {
          if (!needle) return true;
          const authors = Array.isArray(game.authors) ? game.authors.map((item) => {
            if (item !== null && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string") return (item as Record<string, unknown>).name as string;
            return typeof item === "string" ? item : "";
          }).join(" ") : "";
          const tags = Array.isArray(game.tags) ? game.tags.filter((item): item is string => typeof item === "string") : [];
          return [String(game.id), String(game.title), String(game.summary), ...tags, authors].join(" ").toLowerCase().includes(needle);
        }).sort((left, right) => String(left.title).toLowerCase().localeCompare(String(right.title).toLowerCase()));
        const page = pagination(games, query);
        const body = { ok: true, games: page.items, pagination: Object.fromEntries(["page", "per_page", "total", "pages", "has_next", "has_prev", "next_page", "prev_page"].map((key) => [key, page[key]])) };
        const bytes = Buffer.from(JSON.stringify(body));
        return normalizeResponse(200, { "content-type": "application/json", "content-length": String(bytes.byteLength) }, bytes);
      }
      const detail = pathname.match(/^\/api\/games\/([^/]+)(?:\/(icon|screenshot|colophon|download))?$/u);
      if (!detail) return errorResponse();
      const gameId = decodeURIComponent(detail[1] ?? "");
      const action = detail[2];
      const game = publicGame(this.resource.sqlite, gameId, query.version);
      if (!action) {
        const bytes = Buffer.from(JSON.stringify({ ok: true, game }));
        return normalizeResponse(200, { "content-type": "application/json", "content-length": String(bytes.byteLength) }, bytes);
      }
      const release = latestRelease(this.resource.sqlite, gameId, query.version);
      if (!release) throw new Error("version not found");
      if (action === "colophon") {
        if (!release.colophon_json) throw new Error("colophon not found");
        const bytes = Buffer.from(JSON.stringify({ ok: true, colophon: jsonParse(release.colophon_json, null) }));
        return normalizeResponse(200, { "content-type": "application/json", "content-length": String(bytes.byteLength) }, bytes);
      }
      const selectedArchitectures = Array.isArray(game.architectures) ? game.architectures.map(String) : [];
      const selected = query.architecture ?? (selectedArchitectures.includes("esp32c6") ? "esp32c6" : selectedArchitectures[0]);
      if (!selected) throw new Error("architecture not found");
      const artifact = artifactRow(this.resource.sqlite, String(release.release_id), selected);
      if (action === "download") {
        const object = readObject(this.root, this.resource.sqlite, String(artifact.object_id), "artifact");
        const name = `${gameId}-${String(game.selected_version)}-${selected}.prg32`;
        return normalizeResponse(200, { "content-type": "application/vnd.prg32.cartridge", "content-disposition": `attachment; filename=${name}`, "content-length": String(object.bytes.byteLength), "cache-control": "no-cache" }, object.bytes);
      }
      const media = this.resource.sqlite.prepare("SELECT m.object_id, o.media_type FROM media m JOIN storage_objects o ON o.object_id = m.object_id WHERE m.release_id = ? AND m.kind = ? AND (m.architecture = ? OR m.architecture = '') ORDER BY CASE WHEN m.architecture = ? THEN 0 ELSE 1 END LIMIT 1").get(release.release_id, action, selected, selected) as Record<string, unknown> | undefined;
      if (!media) throw new Error(`${action} not found`);
      const object = readObject(this.root, this.resource.sqlite, String(media.object_id), "media");
      return normalizeResponse(200, { "content-type": object.mediaType, "content-length": String(object.bytes.byteLength) }, object.bytes);
    });
  }
}
