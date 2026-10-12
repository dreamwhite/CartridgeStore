import fs from "node:fs";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { BackendConfig } from "../config/env.js";
import { encodePythonJson } from "../compatibility/serialization.js";
import type { ReadonlyDatabaseManager } from "../db/readonly.js";
import {
  CARTRIDGE_MIME,
  CatalogError,
  DISCOVERY_ABI,
  ReadonlyCatalog,
  ROLE_LEVELS,
  fileEtag,
  parseCartridgeMedia,
  paginateCatalog
} from "./catalog.js";

interface CatalogQuery {
  readonly q?: string;
  readonly search?: string;
  readonly page?: string;
  readonly per_page?: string;
  readonly limit?: string;
  readonly version?: string;
  readonly architecture?: string;
}

interface GameParams {
  readonly game_id: string;
}

interface CatalogRouteOptions {
  readonly config: BackendConfig;
  readonly database: ReadonlyDatabaseManager;
}

function sendJson(reply: FastifyReply, body: unknown): FastifyReply {
  return reply.header("content-type", "application/json").send(Buffer.from(`${encodePythonJson(body)}\n`, "utf8"));
}

function storeName(options: CatalogRouteOptions): string {
  try {
    const row = options.database.get().sqlite
      .prepare("SELECT value FROM store_settings WHERE key = 'store_name'")
      .get() as { value?: unknown } | undefined;
    return typeof row?.value === "string" ? row.value : options.config.storeName;
  } catch {
    return options.config.storeName;
  }
}

function requestHost(request: FastifyRequest, config: BackendConfig): string {
  const configuredHost = typeof request.headers.host === "string"
    ? request.headers.host
    : `${request.hostname}:${config.port}`;
  if (!config.storePortOverride) return configuredHost;
  return `${configuredHost.split(":", 1)[0]}:${config.storePortOverride}`;
}

function queryObject(query: CatalogQuery): Record<string, unknown> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined));
}

function setFileHeaders(reply: FastifyReply, filePath: string, stat: fs.Stats): string {
  const etag = fileEtag(filePath, stat);
  reply
    .header("content-length", stat.size)
    .header("cache-control", "no-cache")
    .header("last-modified", new Date(stat.mtimeMs).toUTCString())
    .header("etag", etag)
    .header("accept-ranges", "bytes");
  return etag;
}

function conditionalNotModified(request: FastifyRequest, etag: string, stat: fs.Stats): boolean {
  const ifNoneMatch = request.headers["if-none-match"];
  if (typeof ifNoneMatch === "string" && ifNoneMatch.split(",").map((value) => value.trim()).includes(etag)) {
    return true;
  }
  const ifModifiedSince = request.headers["if-modified-since"];
  if (typeof ifModifiedSince === "string") {
    const timestamp = Date.parse(ifModifiedSince);
    if (Number.isFinite(timestamp) && Math.floor(stat.mtimeMs / 1000) * 1000 <= timestamp) return true;
  }
  return false;
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (match[1] === "" && match[2] === "")) throw new CatalogError("invalid range");
  const startText = match[1];
  const endText = match[2];
  let start: number;
  let end: number;
  if (startText === "") {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new CatalogError("invalid range");
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === "" ? size - 1 : Number(endText);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
      throw new CatalogError("invalid range");
    }
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

function sendDownload(
  request: FastifyRequest<{ Querystring: CatalogQuery }>,
  reply: FastifyReply,
  filePath: string,
  gameId: string,
  version: string,
  architecture: string
): FastifyReply {
  const stat = fs.statSync(filePath);
  const etag = setFileHeaders(reply, filePath, stat);
  reply
    .header("content-type", CARTRIDGE_MIME)
    .header("content-disposition", `attachment; filename=${gameId}-${version}-${architecture}.prg32`);
  if (conditionalNotModified(request, etag, stat)) return reply.code(304).send();

  const range = parseRange(request.headers.range, stat.size);
  if (!range) return reply.send(fs.createReadStream(filePath));
  const length = range.end - range.start + 1;
  reply
    .code(206)
    .header("content-length", length)
    .header("content-range", `bytes ${range.start}-${range.end}/${stat.size}`);
  return reply.send(fs.createReadStream(filePath, { start: range.start, end: range.end }));
}

export function registerCatalogRoutes(app: FastifyInstance, options: CatalogRouteOptions): void {
  const catalog = new ReadonlyCatalog(options.config.storeDataDirectory);

  app.get("/.well-known/prg32-store.json", async (request, reply) => {
    const host = requestHost(request, options.config);
    const scheme = request.protocol;
    const base = `${scheme}://${host}`;
    const websocket = scheme === "https" ? "wss" : "ws";
    return sendJson(reply, {
      abi: DISCOVERY_ABI,
      name: storeName(options),
      api: `${base}/api`,
      web: `${base}/`,
      version: options.config.storeVersion,
      auth_enabled: true,
      roles: [...ROLE_LEVELS],
      services: {
        cartridges: `${base}/api/games`,
        bundle_publish: `${base}/api/publish/bundle`,
        submissions: `${base}/api/submissions`,
        scores: `${base}/api/scores`,
        metrics: `${base}/api/runs`,
        multiplayer: `${websocket}://${host}/api/multiplayer`,
        multiplayer_status: `${base}/api/multiplayer/status`
      }
    });
  });

  app.get<{ Querystring: CatalogQuery }>("/api/games", async (request, reply) => {
    const query = request.query;
    const games = catalog.listGames(query.q || query.search);
    const pagination = paginateCatalog(games, queryObject(query));
    const { items, ...paginationFields } = pagination;
    return sendJson(reply, { ok: true, games: items, pagination: paginationFields });
  });

  app.get<{ Params: GameParams; Querystring: CatalogQuery }>("/api/games/:game_id", async (request, reply) => {
    return sendJson(reply, { ok: true, game: catalog.publicGame(request.params.game_id, request.query.version) });
  });

  app.get<{ Params: GameParams; Querystring: CatalogQuery }>("/api/games/:game_id/icon", async (request, reply) => {
    const resolved = catalog.resolveVariant(request.params.game_id, request.query.version, request.query.architecture);
    const media = parseCartridgeMedia(fs.readFileSync(resolved.filePath));
    if (!media.icon) throw new CatalogError("icon not found");
    return reply.header("content-type", stringHeader(resolved.variant.icon_mime, media.iconMime ?? "image/png"))
      .header("content-length", media.icon.length)
      .send(media.icon);
  });

  app.get<{ Params: GameParams; Querystring: CatalogQuery }>("/api/games/:game_id/screenshot", async (request, reply) => {
    const resolved = catalog.resolveVariant(request.params.game_id, request.query.version, request.query.architecture);
    const media = parseCartridgeMedia(fs.readFileSync(resolved.filePath));
    if (!media.screenshot) throw new CatalogError("screenshot not found");
    return reply.header("content-type", stringHeader(resolved.variant.screenshot_mime, media.screenshotMime ?? "image/png"))
      .header("content-length", media.screenshot.length)
      .send(media.screenshot);
  });

  app.get<{ Params: GameParams; Querystring: CatalogQuery }>("/api/games/:game_id/colophon", async (request, reply) => {
    const resolved = catalog.resolveVariant(request.params.game_id, request.query.version, request.query.architecture);
    const media = parseCartridgeMedia(fs.readFileSync(resolved.filePath));
    if (!media.colophon) throw new CatalogError("colophon not found");
    return sendJson(reply, { ok: true, colophon: media.colophon });
  });

  app.get<{ Params: GameParams; Querystring: CatalogQuery }>("/api/games/:game_id/download", async (request, reply) => {
    const resolved = catalog.resolveVariant(request.params.game_id, request.query.version, request.query.architecture);
    return sendDownload(request, reply, resolved.filePath, stringHeader(resolved.publicGame.id, request.params.game_id), resolved.version, resolved.architecture);
  });
}

function stringHeader(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}
