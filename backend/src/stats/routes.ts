import type { FastifyInstance, FastifyReply } from "fastify";

import { encodePythonJson } from "../compatibility/serialization.js";
import type { ReadonlyDatabaseManager } from "../db/readonly.js";
import type { ReadonlyCatalog } from "../catalog/catalog.js";
import { StatsService, type StatsQuery } from "./service.js";

interface GameStatsParams { readonly game_id: string }

interface StatsRouteOptions {
  readonly database: ReadonlyDatabaseManager;
  readonly catalog: ReadonlyCatalog;
  readonly nowSeconds?: () => number;
}

function sendJson(reply: FastifyReply, body: unknown): FastifyReply {
  return reply.header("content-type", "application/json").send(Buffer.from(`${encodePythonJson(body)}\n`, "utf8"));
}

export function registerStatsRoutes(app: FastifyInstance, options: StatsRouteOptions): void {
  const stats = new StatsService(options.database, options.catalog, options.nowSeconds);

  app.get<{ Querystring: StatsQuery }>("/api/stats/downloads", async (request, reply) =>
    sendJson(reply, stats.downloadSummary(request.query)));

  app.get<{ Params: GameStatsParams; Querystring: StatsQuery }>("/api/stats/downloads/:game_id", async (request, reply) =>
    sendJson(reply, stats.gameDownloadBreakdown(request.params.game_id, request.query)));

  app.get<{ Querystring: { readonly limit?: string } }>("/api/stats/scores", async (request, reply) =>
    sendJson(reply, stats.scoreStats(request.query.limit)));

  app.get("/api/stats/runs", async (_request, reply) => sendJson(reply, stats.runStats()));
}
