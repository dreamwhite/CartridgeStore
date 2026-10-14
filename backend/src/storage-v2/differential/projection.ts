import fs from "node:fs";

import type { NormalizedResponse } from "./types.js";
import { normalizeResponse } from "./normalize.js";
import { CanonicalCatalog } from "../catalog.js";

type Query = Record<string, string | undefined>;

function errorResponse(): NormalizedResponse {
  const body = Buffer.from(JSON.stringify({ ok: false, error: "invalid request", code: "invalid_request" }));
  return normalizeResponse(400, { "content-type": "application/json", "content-length": String(body.byteLength) }, body);
}

function publicErrorOr<T>(callback: () => T): T | NormalizedResponse {
  try { return callback(); } catch { return errorResponse(); }
}

function responseJson(status: number, value: unknown): NormalizedResponse {
  const bytes = Buffer.from(JSON.stringify(value));
  return normalizeResponse(status, { "content-type": "application/json", "content-length": String(bytes.byteLength) }, bytes);
}

export class CanonicalReadProjection {
  private readonly catalog: CanonicalCatalog;

  constructor(root: string) { this.catalog = new CanonicalCatalog(root); }

  close(): void { this.catalog.close(); }

  request(pathValue: string): NormalizedResponse {
    return publicErrorOr(() => {
      const url = new URL(pathValue, "http://storage-v2.test");
      const query: Query = Object.fromEntries(url.searchParams.entries());
      if (url.pathname === "/api/games") {
        const page = this.catalog.paginate(this.catalog.listGames(query.q ?? query.search), query);
        return responseJson(200, {
          ok: true,
          games: page.items,
          pagination: Object.fromEntries(["page", "per_page", "total", "pages", "has_next", "has_prev", "next_page", "prev_page"].map((key) => [key, page[key]]))
        });
      }
      const detail = url.pathname.match(/^\/api\/games\/([^/]+)(?:\/(icon|screenshot|colophon|download))?$/u);
      if (!detail) return errorResponse();
      const gameId = decodeURIComponent(detail[1] ?? "");
      const action = detail[2];
      const game = this.catalog.publicGame(gameId, query.version);
      if (!action) return responseJson(200, { ok: true, game });
      if (action === "colophon") return responseJson(200, { ok: true, colophon: this.catalog.colophon(gameId, query.version) });
      const variant = this.catalog.resolveVariant(gameId, query.version, query.architecture);
      if (action === "download") {
        const bytes = fs.readFileSync(variant.filePath);
        return normalizeResponse(200, { "content-type": "application/vnd.prg32.cartridge", "content-disposition": `attachment; filename=${gameId}-${variant.version}-${variant.architecture}.prg32`, "content-length": String(bytes.byteLength), "cache-control": "no-cache" }, bytes);
      }
      if (action !== "icon" && action !== "screenshot") return errorResponse();
      const media = this.catalog.resolveMedia(gameId, query.version, query.architecture, action);
      const bytes = fs.readFileSync(media.filePath);
      return normalizeResponse(200, { "content-type": media.mediaType, "content-length": String(bytes.byteLength) }, bytes);
    });
  }
}
