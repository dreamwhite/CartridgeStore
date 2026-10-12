import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import multipart from "@fastify/multipart";

import type { BackendConfig } from "./config/env.js";
import { ReadonlyDatabaseManager } from "./db/readonly.js";
import { CatalogError, ReadonlyCatalog } from "./catalog/catalog.js";
import { registerCatalogRoutes } from "./catalog/routes.js";
import { encodePythonJson } from "./compatibility/serialization.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { AuthService } from "./auth/service.js";
import { publicSubmissionError, SubmissionError } from "./submission/errors.js";
import { registerSubmissionRoutes } from "./submission/routes.js";
import { SubmissionService } from "./submission/service.js";
import { registerReviewRoutes } from "./review/routes.js";
import { ReviewService } from "./review/service.js";
import { registerMetricsRoutes } from "./metrics/routes.js";
import { MetricsService } from "./metrics/service.js";
import { registerScoreRoutes, scoreRequestError } from "./scores/routes.js";
import { ScoresService } from "./scores/service.js";
import { registerStatsRoutes } from "./stats/routes.js";
import { BackupError } from "./backup/format.js";
import { registerBackupRoutes } from "./backup/routes.js";
import { BackupService } from "./backup/service.js";
import { AuthorizationService } from "./authorization/service.js";
import { registerSettingsRoutes } from "./settings/routes.js";
import { SettingsService } from "./settings/service.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { AdminIdentityService } from "./admin/service.js";
import { AdminTokenService } from "./admin/token-service.js";
import { CatalogAdminService } from "./admin/catalog-service.js";
import { PublicationConsistencyService } from "./consistency/publication.js";
import { SecretStore, SecretStorageError } from "./secrets/service.js";

export interface AppOptions {
  readonly config: BackendConfig;
  readonly logger?: FastifyServerOptions["logger"];
  readonly nowSeconds?: () => number;
}

export function buildApp(options: AppOptions): FastifyInstance {
  const database = new ReadonlyDatabaseManager(options.config);
  const auth = new AuthService({ config: options.config, readonlyDatabase: database });
  const authorization = new AuthorizationService();
  const secrets = new SecretStore({
    ...(options.config.secretKeyRegistryPath ? { keyRegistryPath: options.config.secretKeyRegistryPath } : {}),
    applicationDataRoot: options.config.storeDataDirectory,
    maxRows: options.config.secretMaxRows
  });
  if (options.config.secretEncryptionEnabled || options.config.secretKeyRegistryPath) {
    const secretInventory = secrets.validateDatabase(auth.database());
    if (options.config.secretEncryptionEnabled && secretInventory.legacyPlaintext.length > 0) {
      throw new SecretStorageError("secret_plaintext_legacy", "secret settings require explicit migration before encryption is enabled");
    }
  }
  const identity = new AdminIdentityService({
    config: options.config,
    database: () => auth.database(),
    writableDatabase: options.config.authWriteEnabled ? auth.writableDatabase() : null
  });
  const adminTokens = new AdminTokenService({
    config: options.config,
    database: () => auth.database(),
    writableDatabase: options.config.authWriteEnabled ? auth.writableDatabase() : null
  });
  const settings = new SettingsService({
    config: options.config,
    database: () => auth.database(),
    writableDatabase: options.config.authWriteEnabled ? auth.writableDatabase() : null,
    secrets
  });
  const backup = options.config.backupEnabled
    ? new BackupService(options.config, auth.writableDatabase(), { secrets })
    : null;
  backup?.recoverIncomplete();
  const submission = options.config.submissionWriteEnabled
    ? new SubmissionService({ config: options.config, database: auth.writableDatabase() })
    : null;
  const publication = options.config.submissionWriteEnabled && options.config.submissionDisposableRoot
    ? new PublicationConsistencyService({ root: options.config.submissionDisposableRoot, database: auth.writableDatabase() })
    : null;
  const review = options.config.submissionWriteEnabled && options.config.submissionDisposableRoot
    ? new ReviewService({
      root: options.config.submissionDisposableRoot,
      database: auth.writableDatabase(),
      maxSubmissions: options.config.reviewMaxSubmissions,
      ...(publication === null ? {} : { publication })
    })
    : null;
  const catalogAdmin = new CatalogAdminService({ config: options.config, publication });
  const metrics = new MetricsService({
    config: options.config,
    authorization,
    writeEnabled: options.config.metricsWriteEnabled,
    database: options.config.metricsWriteEnabled
      ? auth.writableDatabase()
      : () => (auth.isWriteEnabled() ? auth.writableDatabase() : database.get().sqlite)
  });
  const scores = new ScoresService({
    config: options.config,
    writeEnabled: options.config.scoresWriteEnabled,
    database: options.config.scoresWriteEnabled
      ? auth.writableDatabase()
      : () => (auth.isWriteEnabled() ? auth.writableDatabase() : database.get().sqlite)
  });
  const app = Fastify({
    logger: options.logger ?? { level: options.config.logLevel }
  });

  registerCatalogRoutes(app, { config: options.config, database });
  registerAuthRoutes(app, { config: options.config, auth, authorization });
  app.register(multipart, {
    limits: {
      fileSize: Math.max(options.config.submissionMaxArchiveBytes, options.config.backupMaxArchiveBytes),
      files: 1,
      fields: 8,
      parts: 12
    }
  });
  registerSettingsRoutes(app, { config: options.config, auth, authorization, settings });
  registerAdminRoutes(app, { auth, authorization, identity, tokens: adminTokens, catalog: catalogAdmin });
  registerBackupRoutes(app, { config: options.config, auth, authorization, backup });
  registerSubmissionRoutes(app, { config: options.config, auth, authorization, submission });
  registerReviewRoutes(app, { config: options.config, auth, authorization, review });
  registerMetricsRoutes(app, { config: options.config, auth, metrics });
  registerScoreRoutes(app, { config: options.config, auth, scores });
  registerStatsRoutes(app, {
    database,
    catalog: new ReadonlyCatalog(options.config.storeDataDirectory),
    ...(options.nowSeconds === undefined ? {} : { nowSeconds: options.nowSeconds })
  });

  app.addHook("onRequest", async (request) => {
    // Registration links carry a one-time secret in the query string. Keep
    // request diagnostics useful without copying that secret into logs.
    request.log.info({ method: request.method, url: request.url.split("?", 1)[0] }, "request received");
    await Promise.resolve();
  });

  app.get("/health", () => ({
    ok: true,
    service: "prg32-cartridge-store-backend",
    status: "healthy"
  }));

  app.get("/ready", async (_request, reply) => {
    const databaseReady = database.check();
    const body = {
      ok: databaseReady,
      status: databaseReady ? "ready" : "not_ready",
      resources: { database: databaseReady ? "available" : "unavailable" }
    } as const;
    if (!databaseReady) {
      return reply.code(503).send(body);
    }
    return body;
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, "request failed");
    const metricsRequest = request.url.startsWith("/api/metrics/batch") || request.url.startsWith("/api/runs");
    const scoreRequest = request.url.split("?", 1)[0] === "/api/scores" && request.method === "POST";
    if (error instanceof Error && (error as Error & { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE" && metricsRequest) {
      return reply
        .code(413)
        .header("content-type", "application/json")
        .send(Buffer.from(`${encodePythonJson({ ok: false, error: "metrics payload is too large", code: "metrics_payload_too_large" })}\n`, "utf8"));
    }
    if (error instanceof Error && (error as Error & { code?: string }).code === "FST_ERR_CTP_INVALID_JSON_BODY" && metricsRequest) {
      return reply
        .code(400)
        .header("content-type", "application/json")
        .send(Buffer.from(`${encodePythonJson({ ok: false, error: "invalid metrics JSON", code: "invalid_metrics_json" })}\n`, "utf8"));
    }
    if (scoreRequest) {
      const scoreError = scoreRequestError(error);
      if (scoreError) {
        return reply
          .code(scoreError.statusCode)
          .header("content-type", "application/json")
          .send(Buffer.from(`${encodePythonJson(scoreError.body)}\n`, "utf8"));
      }
    }
    if (error instanceof CatalogError) {
      return reply
        .code(400)
        .header("content-type", "application/json")
        .send(Buffer.from(`${encodePythonJson({ ok: false, error: "invalid request", code: "invalid_request" })}\n`, "utf8"));
    }
    if (error instanceof SubmissionError) {
      const publicError = publicSubmissionError(error);
      return reply
        .code(publicError.statusCode)
        .header("content-type", "application/json")
        .send(Buffer.from(`${encodePythonJson(publicError.body)}\n`, "utf8"));
    }
    if (error instanceof BackupError && request.url.startsWith("/admin/backup")) {
      return reply
        .code(error.statusCode)
        .header("content-type", "application/json")
        .send(Buffer.from(`${encodePythonJson({ ok: false, error: error.message, code: error.code })}\n`, "utf8"));
    }
    return reply
      .code(500)
      .header("content-type", "application/json")
      .send(Buffer.from(`${encodePythonJson({
        ok: false,
        error: "internal server error",
        code: "internal_error"
      })}\n`, "utf8"));
  });

  app.addHook("onClose", () => {
    auth.close();
    database.close();
  });

  return app;
}
