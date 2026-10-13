import path from "node:path";

import { parseLegacyConfiguredUsers, type LegacyConfiguredUser } from "../auth/tokens.js";

export interface BackendConfig {
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly databasePath: string;
  readonly storeDataDirectory: string;
  readonly storePortOverride: string | undefined;
  readonly storeName: string;
  readonly storeVersion: string;
  readonly busyTimeoutMs: number;
  readonly multiplayerMaxPeers: number;
  readonly legacyConfiguredUsers: readonly LegacyConfiguredUser[];
  readonly authWriteEnabled: boolean;
  readonly authWriteMode: string | undefined;
  readonly authWriteDatabasePath: string | undefined;
  readonly authDisposableRoot: string | undefined;
  readonly authSessionSecret: string | undefined;
  readonly authCookieSecure: boolean;
  readonly authCookieSameSite: "lax" | "strict" | "none";
  readonly authSessionLifetimeSeconds: number;
  readonly authBootstrapToken: string | undefined;
  readonly federationLifecycleTestToken: string | undefined;
  readonly federationLifecycleTestEnabled: boolean;
  readonly authRecentReauthSeconds: number;
  readonly authRateLimitMax: number;
  readonly authRateLimitWindowSeconds: number;
  readonly oidcPublicOrigin: string | undefined;
  readonly federationPublicOrigin: string | undefined;
  readonly frontendPublicOrigin: string | undefined;
  readonly corsAllowedOrigins: readonly string[];
  readonly samlMaxPostBytes: number;
  readonly samlMaxResponseBytes: number;
  readonly samlMaxRelayStateBytes: number;
  readonly secretEncryptionEnabled: boolean;
  readonly secretKeyRegistryPath: string | undefined;
  readonly secretMaxRows: number;
  readonly submissionWriteEnabled: boolean;
  readonly submissionWriteMode: string | undefined;
  readonly submissionDisposableRoot: string | undefined;
  readonly submissionMaxArchiveBytes: number;
  readonly submissionMaxEntries: number;
  readonly submissionMaxEntryUncompressedBytes: number;
  readonly submissionMaxTotalUncompressedBytes: number;
  readonly submissionMaxCompressionRatio: number;
  readonly submissionMaxManifestBytes: number;
  readonly reviewMaxSubmissions: number;
  readonly metricsWriteEnabled: boolean;
  readonly metricsWriteMode: string | undefined;
  readonly metricsDisposableRoot: string | undefined;
  readonly metricsMaxContentBytes: number;
  readonly metricsMaxSamplesPerRequest: number;
  readonly metricsMaxDbWork: number;
  readonly metricsMaxExportSamples: number;
  readonly scoresWriteEnabled: boolean;
  readonly scoresWriteMode: string | undefined;
  readonly scoresDisposableRoot: string | undefined;
  readonly scoresMaxContentBytes: number;
  readonly scoresRateLimitMax: number;
  readonly scoresRateLimitWindowSeconds: number;
  readonly scoresRateLimitBurst: number;
  readonly scoresRateLimitMaxClients: number;
  readonly scoresMaxRows: number;
  readonly backupEnabled: boolean;
  readonly backupMode: string | undefined;
  readonly backupMaxArchiveBytes: number;
  readonly backupMaxExpandedBytes: number;
  readonly backupMaxEntryBytes: number;
  readonly backupMaxManifestBytes: number;
  readonly backupMaxEntries: number;
  readonly backupMaxPathBytes: number;
  readonly backupMaxPathDepth: number;
  readonly backupMaxCompressionRatio: number;
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  const candidate = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return candidate;
}

function nonEmpty(name: string, value: string | undefined, fallback: string): string {
  const candidate = (value ?? fallback).trim();
  if (!candidate) {
    throw new Error(`${name} must not be empty`);
  }
  return candidate;
}

function booleanValue(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be a boolean`);
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate ? candidate : undefined;
}

function looksLikeSqliteUri(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("file:") || normalized.includes("?mode=") || normalized.includes("&mode=");
}

function requiredSecret(name: string, value: string | undefined): string {
  const candidate = optionalNonEmpty(value);
  if (!candidate) throw new Error(`${name} is required when auth writes are enabled`);
  if (candidate.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return candidate;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): BackendConfig {
  const configuredDatabase = nonEmpty(
    "PRG32_BACKEND_DB",
    environment.PRG32_BACKEND_DB,
    path.resolve(process.cwd(), "data", "cartridge_store.sqlite")
  );
  const configuredStoreData = nonEmpty(
    "PRG32_BACKEND_STORE_DATA",
    environment.PRG32_BACKEND_STORE_DATA ?? environment.PRG32_STORE_DATA,
    path.resolve(process.cwd(), "data")
  );
  const legacyConfiguredUsers = parseLegacyConfiguredUsers(environment.PRG32_USERS);

  const authWriteEnabled = booleanValue(
    "PRG32_BACKEND_AUTH_WRITE_ENABLED",
    environment.PRG32_BACKEND_AUTH_WRITE_ENABLED,
    false
  );
  const authWriteMode = optionalNonEmpty(environment.PRG32_BACKEND_AUTH_WRITE_MODE);
  const authWriteDatabasePath = optionalNonEmpty(environment.PRG32_BACKEND_AUTH_WRITE_DB);
  const authDisposableRoot = optionalNonEmpty(environment.PRG32_BACKEND_AUTH_DISPOSABLE_ROOT);
  const authSessionSecret = optionalNonEmpty(environment.PRG32_BACKEND_SESSION_SECRET);
  const authBootstrapToken = optionalNonEmpty(environment.PRG32_BACKEND_BOOTSTRAP_TOKEN);
  const federationLifecycleTestToken = optionalNonEmpty(environment.PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_TOKEN);
  const federationLifecycleTestEnabled = booleanValue(
    "PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_ENABLED",
    environment.PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_ENABLED,
    false
  );
  const oidcPublicOrigin = optionalNonEmpty(environment.PRG32_BACKEND_OIDC_PUBLIC_ORIGIN);
  const federationPublicOrigin = optionalNonEmpty(environment.PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN ?? oidcPublicOrigin);
  const frontendPublicOrigin = optionalNonEmpty(environment.PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN);
  const corsAllowedOrigins = (environment.PRG32_BACKEND_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const secretEncryptionEnabled = booleanValue(
    "PRG32_BACKEND_SECRET_ENCRYPTION_ENABLED",
    environment.PRG32_BACKEND_SECRET_ENCRYPTION_ENABLED,
    false
  );
  const secretKeyRegistryPath = optionalNonEmpty(environment.PRG32_BACKEND_SECRET_KEY_REGISTRY);
  const submissionWriteEnabled = booleanValue(
    "PRG32_BACKEND_SUBMISSION_WRITE_ENABLED",
    environment.PRG32_BACKEND_SUBMISSION_WRITE_ENABLED,
    false
  );
  const submissionWriteMode = optionalNonEmpty(environment.PRG32_BACKEND_SUBMISSION_WRITE_MODE);
  const submissionDisposableRoot = optionalNonEmpty(environment.PRG32_BACKEND_SUBMISSION_DISPOSABLE_ROOT);
  const metricsWriteEnabled = booleanValue(
    "PRG32_BACKEND_METRICS_WRITE_ENABLED",
    environment.PRG32_BACKEND_METRICS_WRITE_ENABLED,
    false
  );
  const metricsWriteMode = optionalNonEmpty(environment.PRG32_BACKEND_METRICS_WRITE_MODE);
  const metricsDisposableRoot = optionalNonEmpty(environment.PRG32_BACKEND_METRICS_DISPOSABLE_ROOT);
  const scoresWriteEnabled = booleanValue(
    "PRG32_BACKEND_SCORES_WRITE_ENABLED",
    environment.PRG32_BACKEND_SCORES_WRITE_ENABLED,
    false
  );
  const scoresWriteMode = optionalNonEmpty(environment.PRG32_BACKEND_SCORES_WRITE_MODE);
  const scoresDisposableRoot = optionalNonEmpty(environment.PRG32_BACKEND_SCORES_DISPOSABLE_ROOT);
  const backupEnabled = booleanValue(
    "PRG32_BACKEND_BACKUP_ENABLED",
    environment.PRG32_BACKEND_BACKUP_ENABLED,
    false
  );
  const backupMode = optionalNonEmpty(environment.PRG32_BACKEND_BACKUP_MODE);
  if (authWriteEnabled) {
    if (authWriteMode !== "test") {
      throw new Error("PRG32_BACKEND_AUTH_WRITE_MODE must be test when auth writes are enabled");
    }
    if (!authWriteDatabasePath) {
      throw new Error("PRG32_BACKEND_AUTH_WRITE_DB is required when auth writes are enabled");
    }
    if (!authDisposableRoot) {
      throw new Error("PRG32_BACKEND_AUTH_DISPOSABLE_ROOT is required when auth writes are enabled");
    }
    requiredSecret("PRG32_BACKEND_SESSION_SECRET", authSessionSecret);
    if (authBootstrapToken) requiredSecret("PRG32_BACKEND_BOOTSTRAP_TOKEN", authBootstrapToken);
    if (federationLifecycleTestToken && federationLifecycleTestToken.length < 32) throw new Error("PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_TOKEN must contain at least 32 characters");
    if (federationLifecycleTestEnabled && !federationLifecycleTestToken) throw new Error("PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_TOKEN is required when lifecycle test routes are enabled");
    if (looksLikeSqliteUri(authWriteDatabasePath)) {
      throw new Error("SQLite URI syntax is not allowed for the auth write database");
    }
    if (path.resolve(authWriteDatabasePath) === path.resolve(configuredDatabase)) {
      throw new Error("auth write database must be separate from the shadow database");
    }
  }
  if (federationLifecycleTestEnabled && (authWriteMode !== "test" || !authWriteEnabled || !authDisposableRoot || !authWriteDatabasePath)) {
    throw new Error("federation lifecycle test routes require the isolated auth writer configuration");
  }
  if ((environment.NODE_ENV ?? "").trim().toLowerCase() === "production" && federationLifecycleTestEnabled) {
    throw new Error("federation lifecycle test routes cannot be enabled in production");
  }
  if (secretEncryptionEnabled && !secretKeyRegistryPath) {
    throw new Error("PRG32_BACKEND_SECRET_KEY_REGISTRY is required when secret encryption is enabled");
  }
  if (submissionWriteEnabled) {
    if (submissionWriteMode !== "test") {
      throw new Error("PRG32_BACKEND_SUBMISSION_WRITE_MODE must be test when submission writes are enabled");
    }
    if (!authWriteEnabled) {
      throw new Error("submission writes require isolated authentication writes");
    }
    if (!submissionDisposableRoot) {
      throw new Error("PRG32_BACKEND_SUBMISSION_DISPOSABLE_ROOT is required when submission writes are enabled");
    }
    if (path.resolve(submissionDisposableRoot) === path.resolve(configuredDatabase)) {
      throw new Error("submission disposable root must be separate from the shadow database");
    }
  }
  if (metricsWriteEnabled) {
    if (metricsWriteMode !== "test") {
      throw new Error("PRG32_BACKEND_METRICS_WRITE_MODE must be test when metrics writes are enabled");
    }
    if (!authWriteEnabled || !authDisposableRoot || !authWriteDatabasePath) {
      throw new Error("metrics writes require isolated authentication writes");
    }
    if (!metricsDisposableRoot) {
      throw new Error("PRG32_BACKEND_METRICS_DISPOSABLE_ROOT is required when metrics writes are enabled");
    }
    if (path.resolve(metricsDisposableRoot) !== path.resolve(authDisposableRoot)) {
      throw new Error("metrics disposable root must reuse the authenticated disposable writer boundary");
    }
  }
  if (scoresWriteEnabled) {
    if (scoresWriteMode !== "test") {
      throw new Error("PRG32_BACKEND_SCORES_WRITE_MODE must be test when score writes are enabled");
    }
    if (!authWriteEnabled || !authDisposableRoot || !authWriteDatabasePath) {
      throw new Error("score writes require isolated authentication writes");
    }
    if (!scoresDisposableRoot) {
      throw new Error("PRG32_BACKEND_SCORES_DISPOSABLE_ROOT is required when score writes are enabled");
    }
    if (path.resolve(scoresDisposableRoot) !== path.resolve(authDisposableRoot)) {
      throw new Error("score disposable root must reuse the authenticated disposable writer boundary");
    }
  }
  if (backupEnabled) {
    if (backupMode !== "test") {
      throw new Error("PRG32_BACKEND_BACKUP_MODE must be test when backup is enabled");
    }
    if (!authWriteEnabled || authWriteMode !== "test") {
      throw new Error("backup requires the isolated authentication writer profile");
    }
  }
  const authCookieSameSite = (environment.PRG32_BACKEND_SESSION_SAMESITE ?? "lax").trim().toLowerCase();
  if (authCookieSameSite !== "lax" && authCookieSameSite !== "strict" && authCookieSameSite !== "none") {
    throw new Error("PRG32_BACKEND_SESSION_SAMESITE must be lax, strict, or none");
  }
  if (oidcPublicOrigin) {
    let parsed: URL;
    try { parsed = new URL(oidcPublicOrigin); } catch { throw new Error("PRG32_BACKEND_OIDC_PUBLIC_ORIGIN must be a valid origin"); }
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || (parsed.protocol !== "https:" && authWriteMode !== "test")) {
      throw new Error("PRG32_BACKEND_OIDC_PUBLIC_ORIGIN must be a trusted HTTPS origin");
    }
  }
  if (federationPublicOrigin) {
    let parsed: URL;
    try { parsed = new URL(federationPublicOrigin); } catch { throw new Error("PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN must be a valid origin"); }
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || (parsed.protocol !== "https:" && authWriteMode !== "test")) {
      throw new Error("PRG32_BACKEND_FEDERATION_PUBLIC_ORIGIN must be a trusted HTTPS origin");
    }
  }
  for (const origin of [frontendPublicOrigin, ...corsAllowedOrigins]) {
    if (!origin) continue;
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error("PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN and PRG32_BACKEND_CORS_ORIGINS must contain valid origins"); }
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || (parsed.protocol !== "https:" && authWriteMode !== "test")) {
      throw new Error("PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN and PRG32_BACKEND_CORS_ORIGINS must contain trusted HTTPS origins");
    }
  }
  if ((environment.NODE_ENV ?? "").trim().toLowerCase() === "production" && corsAllowedOrigins.length > 0) {
    throw new Error("PRG32_BACKEND_CORS_ORIGINS is disabled for production builds until a deployment-specific allowlist is reviewed");
  }

  return {
    host: nonEmpty("PRG32_BACKEND_HOST", environment.PRG32_BACKEND_HOST, "127.0.0.1"),
    port: positiveInteger("PRG32_BACKEND_PORT", environment.PRG32_BACKEND_PORT, 5090),
    logLevel: nonEmpty("PRG32_BACKEND_LOG_LEVEL", environment.PRG32_BACKEND_LOG_LEVEL, "info"),
    databasePath: path.resolve(configuredDatabase),
    storeDataDirectory: path.resolve(configuredStoreData),
    storePortOverride: environment.PRG32_STORE_PORT?.trim() || undefined,
    storeName: nonEmpty("PRG32_STORE_NAME", environment.PRG32_STORE_NAME, "PRG32 Cartridge Store"),
    storeVersion: nonEmpty("PRG32_STORE_VERSION", environment.PRG32_STORE_VERSION, "1.0.0"),
    multiplayerMaxPeers: positiveInteger(
      "PRG32_MP_MAX_PEERS",
      environment.PRG32_MP_MAX_PEERS,
      8
    ),
    legacyConfiguredUsers,
    busyTimeoutMs: positiveInteger(
      "PRG32_BACKEND_BUSY_TIMEOUT_MS",
      environment.PRG32_BACKEND_BUSY_TIMEOUT_MS,
      5000
    ),
    authWriteEnabled,
    authWriteMode,
    authWriteDatabasePath: authWriteEnabled ? path.resolve(authWriteDatabasePath as string) : undefined,
    authDisposableRoot: authWriteEnabled ? path.resolve(authDisposableRoot as string) : undefined,
    authSessionSecret: authWriteEnabled ? authSessionSecret : undefined,
    authCookieSecure: booleanValue(
      "PRG32_BACKEND_SESSION_SECURE",
      environment.PRG32_BACKEND_SESSION_SECURE,
      (environment.NODE_ENV ?? "").trim().toLowerCase() === "production"
    ),
    authCookieSameSite,
    authSessionLifetimeSeconds: positiveInteger(
      "PRG32_BACKEND_SESSION_LIFETIME_SECONDS",
      environment.PRG32_BACKEND_SESSION_LIFETIME_SECONDS,
      8 * 60 * 60
    ),
    authBootstrapToken,
    federationLifecycleTestToken: authWriteMode === "test" ? federationLifecycleTestToken : undefined,
    federationLifecycleTestEnabled,
    authRecentReauthSeconds: positiveInteger(
      "PRG32_BACKEND_AUTH_RECENT_REAUTH_SECONDS",
      environment.PRG32_BACKEND_AUTH_RECENT_REAUTH_SECONDS,
      5 * 60
    ),
    authRateLimitMax: positiveInteger(
      "PRG32_BACKEND_AUTH_RATE_LIMIT_MAX",
      environment.PRG32_BACKEND_AUTH_RATE_LIMIT_MAX,
      5
    ),
    authRateLimitWindowSeconds: positiveInteger(
      "PRG32_BACKEND_AUTH_RATE_LIMIT_WINDOW_SECONDS",
      environment.PRG32_BACKEND_AUTH_RATE_LIMIT_WINDOW_SECONDS,
      60
    ),
    oidcPublicOrigin,
    federationPublicOrigin,
    frontendPublicOrigin,
    corsAllowedOrigins,
    samlMaxPostBytes: positiveInteger(
      "PRG32_BACKEND_SAML_MAX_POST_BYTES",
      environment.PRG32_BACKEND_SAML_MAX_POST_BYTES,
      2 * 1024 * 1024
    ),
    samlMaxResponseBytes: positiveInteger(
      "PRG32_BACKEND_SAML_MAX_RESPONSE_BYTES",
      environment.PRG32_BACKEND_SAML_MAX_RESPONSE_BYTES,
      1024 * 1024
    ),
    samlMaxRelayStateBytes: positiveInteger(
      "PRG32_BACKEND_SAML_MAX_RELAY_STATE_BYTES",
      environment.PRG32_BACKEND_SAML_MAX_RELAY_STATE_BYTES,
      1024
    ),
    secretEncryptionEnabled,
    secretKeyRegistryPath: secretKeyRegistryPath ? path.resolve(secretKeyRegistryPath) : undefined,
    secretMaxRows: positiveInteger(
      "PRG32_BACKEND_SECRET_MAX_ROWS",
      environment.PRG32_BACKEND_SECRET_MAX_ROWS,
      16
    ),
    submissionWriteEnabled,
    submissionWriteMode,
    submissionDisposableRoot: submissionWriteEnabled ? path.resolve(submissionDisposableRoot as string) : undefined,
    submissionMaxArchiveBytes: positiveInteger(
      "PRG32_BACKEND_SUBMISSION_MAX_ARCHIVE_BYTES",
      environment.PRG32_BACKEND_SUBMISSION_MAX_ARCHIVE_BYTES,
      64 * 1024 * 1024
    ),
    submissionMaxEntries: positiveInteger(
      "PRG32_BACKEND_SUBMISSION_MAX_ENTRIES",
      environment.PRG32_BACKEND_SUBMISSION_MAX_ENTRIES,
      128
    ),
    submissionMaxEntryUncompressedBytes: positiveInteger(
      "PRG32_BACKEND_SUBMISSION_MAX_ENTRY_BYTES",
      environment.PRG32_BACKEND_SUBMISSION_MAX_ENTRY_BYTES,
      32 * 1024 * 1024
    ),
    submissionMaxTotalUncompressedBytes: positiveInteger(
      "PRG32_BACKEND_SUBMISSION_MAX_TOTAL_BYTES",
      environment.PRG32_BACKEND_SUBMISSION_MAX_TOTAL_BYTES,
      128 * 1024 * 1024
    ),
    submissionMaxCompressionRatio: (() => {
      const candidate = environment.PRG32_BACKEND_SUBMISSION_MAX_COMPRESSION_RATIO === undefined
        ? 100
        : Number(environment.PRG32_BACKEND_SUBMISSION_MAX_COMPRESSION_RATIO);
      if (!Number.isFinite(candidate) || candidate <= 0) {
        throw new Error("PRG32_BACKEND_SUBMISSION_MAX_COMPRESSION_RATIO must be positive");
      }
      return candidate;
    })(),
    submissionMaxManifestBytes: positiveInteger(
      "PRG32_BACKEND_SUBMISSION_MAX_MANIFEST_BYTES",
      environment.PRG32_BACKEND_SUBMISSION_MAX_MANIFEST_BYTES,
      256 * 1024
    ),
    reviewMaxSubmissions: positiveInteger(
      "PRG32_BACKEND_REVIEW_MAX_SUBMISSIONS",
      environment.PRG32_BACKEND_REVIEW_MAX_SUBMISSIONS,
      1000
    ),
    metricsWriteEnabled,
    metricsWriteMode,
    metricsDisposableRoot: metricsWriteEnabled ? path.resolve(metricsDisposableRoot as string) : undefined,
    metricsMaxContentBytes: positiveInteger(
      "PRG32_BACKEND_METRICS_MAX_CONTENT_BYTES",
      environment.PRG32_BACKEND_METRICS_MAX_CONTENT_BYTES,
      2 * 1024 * 1024
    ),
    metricsMaxSamplesPerRequest: positiveInteger(
      "PRG32_BACKEND_METRICS_MAX_SAMPLES",
      environment.PRG32_BACKEND_METRICS_MAX_SAMPLES,
      1024
    ),
    metricsMaxDbWork: positiveInteger(
      "PRG32_BACKEND_METRICS_MAX_DB_WORK",
      environment.PRG32_BACKEND_METRICS_MAX_DB_WORK,
      2048
    ),
    metricsMaxExportSamples: positiveInteger(
      "PRG32_BACKEND_METRICS_MAX_EXPORT_SAMPLES",
      environment.PRG32_BACKEND_METRICS_MAX_EXPORT_SAMPLES,
      100000
    ),
    scoresWriteEnabled,
    scoresWriteMode,
    scoresDisposableRoot: scoresWriteEnabled ? path.resolve(scoresDisposableRoot as string) : undefined,
    scoresMaxContentBytes: positiveInteger(
      "PRG32_BACKEND_SCORES_MAX_CONTENT_BYTES",
      environment.PRG32_BACKEND_SCORES_MAX_CONTENT_BYTES,
      1024
    ),
    scoresRateLimitMax: positiveInteger(
      "PRG32_BACKEND_SCORES_RATE_LIMIT_MAX",
      environment.PRG32_BACKEND_SCORES_RATE_LIMIT_MAX,
      120
    ),
    scoresRateLimitWindowSeconds: positiveInteger(
      "PRG32_BACKEND_SCORES_RATE_LIMIT_WINDOW_SECONDS",
      environment.PRG32_BACKEND_SCORES_RATE_LIMIT_WINDOW_SECONDS,
      60
    ),
    scoresRateLimitBurst: positiveInteger(
      "PRG32_BACKEND_SCORES_RATE_LIMIT_BURST",
      environment.PRG32_BACKEND_SCORES_RATE_LIMIT_BURST,
      16
    ),
    scoresRateLimitMaxClients: positiveInteger(
      "PRG32_BACKEND_SCORES_RATE_LIMIT_MAX_CLIENTS",
      environment.PRG32_BACKEND_SCORES_RATE_LIMIT_MAX_CLIENTS,
      4096
    ),
    scoresMaxRows: positiveInteger(
      "PRG32_BACKEND_SCORES_MAX_ROWS",
      environment.PRG32_BACKEND_SCORES_MAX_ROWS,
      100000
    ),
    backupEnabled,
    backupMode,
    backupMaxArchiveBytes: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_ARCHIVE_BYTES",
      environment.PRG32_BACKEND_BACKUP_MAX_ARCHIVE_BYTES,
      1024 * 1024 * 1024
    ),
    backupMaxExpandedBytes: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_EXPANDED_BYTES",
      environment.PRG32_BACKEND_BACKUP_MAX_EXPANDED_BYTES,
      4 * 1024 * 1024 * 1024
    ),
    backupMaxEntryBytes: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_ENTRY_BYTES",
      environment.PRG32_BACKEND_BACKUP_MAX_ENTRY_BYTES,
      2 * 1024 * 1024 * 1024
    ),
    backupMaxManifestBytes: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_MANIFEST_BYTES",
      environment.PRG32_BACKEND_BACKUP_MAX_MANIFEST_BYTES,
      256 * 1024
    ),
    backupMaxEntries: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_ENTRIES",
      environment.PRG32_BACKEND_BACKUP_MAX_ENTRIES,
      50000
    ),
    backupMaxPathBytes: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_PATH_BYTES",
      environment.PRG32_BACKEND_BACKUP_MAX_PATH_BYTES,
      1024
    ),
    backupMaxPathDepth: positiveInteger(
      "PRG32_BACKEND_BACKUP_MAX_PATH_DEPTH",
      environment.PRG32_BACKEND_BACKUP_MAX_PATH_DEPTH,
      32
    ),
    backupMaxCompressionRatio: (() => {
      const candidate = environment.PRG32_BACKEND_BACKUP_MAX_COMPRESSION_RATIO === undefined
        ? 200
        : Number(environment.PRG32_BACKEND_BACKUP_MAX_COMPRESSION_RATIO);
      if (!Number.isFinite(candidate) || candidate <= 0) {
        throw new Error("PRG32_BACKEND_BACKUP_MAX_COMPRESSION_RATIO must be positive");
      }
      return candidate;
    })()
  };
}
