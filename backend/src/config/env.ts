import path from "node:path";

import { parseLegacyConfiguredUsers } from "../auth/tokens.js";
import { CANDIDATE_RUNTIME_MODE } from "../runtime/candidate.js";
import { CANONICAL_DISPOSABLE_READ_MODE, CANONICAL_OPERATIONAL_READ_MODE, CANONICAL_OPERATIONAL_WORKFLOW_MODE, CANONICAL_WORKFLOW_MODE } from "../storage-v2/read-mode.js";
import {
  booleanValue,
  looksLikeSqliteUri,
  nonEmpty,
  optionalNonEmpty,
  positiveInteger,
  requiredSecret,
} from "./env-values.js";
import type { BackendConfig } from "./env-contracts.js";
import { resolveAuthLimitsConfig } from "./env-auth-limits.js";
import { resolveEmailConfig } from "./env-email.js";
import { resolveMultiplayerConfig } from "./env-multiplayer.js";
import {
  resolvePublicOriginConfig,
  validatePublicOriginConfig,
} from "./env-origins.js";
import { resolveRuntimeMode } from "./env-runtime-mode.js";
import { resolveNetworkConfig } from "./env-network.js";
import { resolveSessionCookieConfig } from "./env-session.js";
import { resolveWebAuthnConfig } from "./env-webauthn.js";

export type { BackendConfig } from "./env-contracts.js";

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
  const {
    catalogReadMode: configuredCatalogReadMode,
    canonicalStorageRoot,
    canonicalReadAuthorization,
    canonicalWorkflowMode,
    canonicalWriteAuthorization,
    candidateRuntimeMode,
    candidateRuntimeAuthorization,
  } = resolveRuntimeMode(environment);
  const operationalMode = configuredCatalogReadMode === CANONICAL_OPERATIONAL_READ_MODE || canonicalWorkflowMode === CANONICAL_OPERATIONAL_WORKFLOW_MODE;
  if (operationalMode) {
    if (configuredCatalogReadMode !== CANONICAL_OPERATIONAL_READ_MODE || canonicalWorkflowMode !== CANONICAL_OPERATIONAL_WORKFLOW_MODE) throw new Error("canonical operational mode requires canonical-operational reads and workflow");
    if (!canonicalStorageRoot) throw new Error("PRG32_BACKEND_CANONICAL_STORAGE_ROOT is required in canonical-operational mode");
    if (!canonicalReadAuthorization || canonicalReadAuthorization.length < 32) throw new Error("PRG32_BACKEND_CANONICAL_READ_AUTHORIZATION must contain at least 32 characters in canonical-operational mode");
    if (!canonicalWriteAuthorization || canonicalWriteAuthorization.length < 32) throw new Error("PRG32_BACKEND_CANONICAL_WRITE_AUTHORIZATION must contain at least 32 characters in canonical-operational mode");
  }

  const authWriteEnabled = booleanValue(
    "PRG32_BACKEND_AUTH_WRITE_ENABLED",
    environment.PRG32_BACKEND_AUTH_WRITE_ENABLED,
    false
  );
  const authWriteMode = optionalNonEmpty(environment.PRG32_BACKEND_AUTH_WRITE_MODE);
  const authWriteDatabasePath = optionalNonEmpty(environment.PRG32_BACKEND_AUTH_WRITE_DB);
  const authDisposableRoot = optionalNonEmpty(environment.PRG32_BACKEND_AUTH_DISPOSABLE_ROOT);
  const authSessionSecret = optionalNonEmpty(environment.PRG32_BACKEND_SESSION_SECRET);
  const federationAutoProvision = booleanValue(
    "PRG32_BACKEND_FEDERATION_AUTO_PROVISION",
    environment.PRG32_BACKEND_FEDERATION_AUTO_PROVISION,
    false
  );
  if (federationAutoProvision && (!authWriteEnabled || authWriteMode !== "test" || (environment.NODE_ENV ?? "").trim().toLowerCase() === "production")) {
    throw new Error("federation auto-provisioning is restricted to the isolated non-production auth writer");
  }
  const authBootstrapToken = optionalNonEmpty(environment.PRG32_BACKEND_BOOTSTRAP_TOKEN);
  const federationLifecycleTestToken = optionalNonEmpty(environment.PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_TOKEN);
  const federationLifecycleTestEnabled = booleanValue(
    "PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_ENABLED",
    environment.PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_ENABLED,
    false
  );
  const {
    oidcPublicOrigin,
    federationPublicOrigin,
    frontendPublicOrigin,
    corsAllowedOrigins,
  } = resolvePublicOriginConfig(
    environment,
  );
  const {
    emailTransport,
    emailFrom,
    emailPublicOrigin,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpUser,
    emailSmtpPassword,
  } = resolveEmailConfig(
    environment,
    authWriteMode,
    frontendPublicOrigin,
  );
  const {
    webauthnEnabled,
    webauthnRpId,
    webauthnRpName,
    webauthnOrigins,
    setupNetworkTestAllowlist,
  } = resolveWebAuthnConfig(environment, authWriteEnabled);
  validatePublicOriginConfig(
    environment,
    {
      oidcPublicOrigin,
      federationPublicOrigin,
      frontendPublicOrigin,
      corsAllowedOrigins,
    },
    authWriteMode,
    operationalMode,
  );
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
    if (authWriteMode !== "test" && !(operationalMode && authWriteMode === "operational")) {
      throw new Error("PRG32_BACKEND_AUTH_WRITE_MODE must be test or operational when auth writes are enabled");
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
    if (path.resolve(authWriteDatabasePath) === path.resolve(configuredDatabase) && candidateRuntimeMode === undefined && !operationalMode) {
      throw new Error("auth write database must be separate from the shadow database");
    }
    if (canonicalWorkflowMode === CANONICAL_WORKFLOW_MODE || operationalMode) {
      const canonicalRoot = path.resolve(canonicalStorageRoot as string);
      if (path.resolve(authDisposableRoot) !== canonicalRoot || path.resolve(authWriteDatabasePath) !== path.join(canonicalRoot, "store.sqlite")) {
        throw new Error("canonical workflow authentication must use the canonical storage-v2 database");
      }
    }
  }
  if ((canonicalWorkflowMode === CANONICAL_WORKFLOW_MODE || operationalMode) && !authWriteEnabled) {
    throw new Error("canonical workflow requires the canonical authentication writer");
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
  const {
    authCookieSecure,
    authCookieSameSite,
    authCookieDomain,
  } = resolveSessionCookieConfig(environment);
  const {
    mdnsEnabled,
    trustProxy,
    trustProxyHops,
    trustedProxyCidrs,
    mdnsInterface,
  } = resolveNetworkConfig(environment);
  if (candidateRuntimeMode !== undefined) {
    const candidateRoot = path.resolve(canonicalStorageRoot ?? "");
    const canonicalDatabase = path.join(candidateRoot, "store.sqlite");
    if ((environment.NODE_ENV ?? "").trim().toLowerCase() === "production") {
      throw new Error("the two-service disposable candidate is disabled in production");
    }
    if (configuredCatalogReadMode !== CANONICAL_DISPOSABLE_READ_MODE || canonicalWorkflowMode !== CANONICAL_WORKFLOW_MODE) {
      throw new Error("the two-service candidate requires canonical disposable workflow mode");
    }
    if (path.resolve(configuredDatabase) !== canonicalDatabase || path.resolve(configuredStoreData) !== candidateRoot) {
      throw new Error("the two-service candidate requires one canonical root and store.sqlite database");
    }
    if (!authWriteEnabled || path.resolve(authDisposableRoot ?? "") !== candidateRoot || path.resolve(authWriteDatabasePath ?? "") !== canonicalDatabase) {
      throw new Error("the two-service candidate requires the canonical SQLite writer boundary");
    }
    if (legacyConfiguredUsers.length > 0 || environment.PRG32_USERS !== undefined || environment.PRG32_SCORE_DB !== undefined || environment.PRG32_METRICS_DB !== undefined || environment.PRG32_STORE_DATA !== undefined || environment.PRG32_STORE_DB !== undefined) {
      throw new Error("legacy database and configured-user fallbacks are disabled in the two-service candidate");
    }
    if (mdnsEnabled) throw new Error("mDNS must remain disabled in the two-service candidate");
    if (backupEnabled) throw new Error("public backup support is disabled in the two-service candidate");
  }
  if (operationalMode) {
    if (candidateRuntimeMode !== undefined) throw new Error("candidate runtime mode cannot be combined with canonical-operational mode");
    if (legacyConfiguredUsers.length > 0 || environment.PRG32_USERS !== undefined || environment.PRG32_SCORE_DB !== undefined || environment.PRG32_METRICS_DB !== undefined || environment.PRG32_STORE_DATA !== undefined || environment.PRG32_STORE_DB !== undefined) {
      throw new Error("legacy database and configured-user fallbacks are disabled in canonical-operational mode");
    }
    if (path.resolve(configuredDatabase) !== path.join(path.resolve(canonicalStorageRoot as string), "store.sqlite") || path.resolve(configuredStoreData) !== path.resolve(canonicalStorageRoot as string)) {
      throw new Error("canonical-operational mode requires one canonical root and store.sqlite database");
    }
    if (authWriteMode !== "operational" || !authWriteEnabled) throw new Error("canonical-operational mode requires the operational canonical auth writer");
    if (!trustProxy) throw new Error("PRG32_BACKEND_TRUST_PROXY must be enabled in canonical-operational mode");
    if (corsAllowedOrigins.some((origin) => origin === "*" || origin !== frontendPublicOrigin)) {
      throw new Error("canonical-operational mode requires an exact CORS allowlist matching PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN");
    }
    if (mdnsEnabled) throw new Error("mDNS must remain disabled in canonical-operational mode");
    if (federationLifecycleTestEnabled || federationAutoProvision) throw new Error("test federation lifecycle and auto-provisioning are disabled in canonical-operational mode");
    requiredSecret("PRG32_BACKEND_SESSION_SECRET", authSessionSecret);
    if (!authBootstrapToken) throw new Error("PRG32_BACKEND_BOOTSTRAP_TOKEN is required in canonical-operational mode");
    requiredSecret("PRG32_BACKEND_BOOTSTRAP_TOKEN", authBootstrapToken);
    if (!secretEncryptionEnabled || !secretKeyRegistryPath) throw new Error("canonical-operational mode requires external secret encryption key configuration");
  }
  const mdnsHost = optionalNonEmpty(environment.PRG32_BACKEND_MDNS_HOST);
  const mdnsPort = positiveInteger(
    "PRG32_BACKEND_MDNS_PORT",
    environment.PRG32_BACKEND_MDNS_PORT ?? environment.PRG32_STORE_PORT ?? environment.PRG32_BACKEND_PORT,
    5090
  );

  return {
    host: nonEmpty("PRG32_BACKEND_HOST", environment.PRG32_BACKEND_HOST, "127.0.0.1"),
    port: positiveInteger("PRG32_BACKEND_PORT", environment.PRG32_BACKEND_PORT, 5090),
    logLevel: nonEmpty("PRG32_BACKEND_LOG_LEVEL", environment.PRG32_BACKEND_LOG_LEVEL, "info"),
    trustProxy,
    trustProxyHops,
    trustedProxyCidrs,
    databasePath: path.resolve(configuredDatabase),
    storeDataDirectory: path.resolve(configuredStoreData),
    storePortOverride: environment.PRG32_STORE_PORT?.trim() || undefined,
    storeName: nonEmpty("PRG32_STORE_NAME", environment.PRG32_STORE_NAME, "PRG32 Cartridge Store"),
    storeVersion: nonEmpty("PRG32_STORE_VERSION", environment.PRG32_STORE_VERSION, "1.0.0"),
    mdnsEnabled,
    mdnsName: nonEmpty("PRG32_BACKEND_MDNS_NAME", environment.PRG32_BACKEND_MDNS_NAME, environment.PRG32_STORE_NAME ?? "PRG32 Cartridge Store"),
    mdnsHost,
    mdnsPort,
    mdnsInterface: mdnsInterface ?? "",
    ...resolveMultiplayerConfig(environment),
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
    authCookieSecure,
    authCookieSameSite,
    authCookieDomain,
    ...resolveAuthLimitsConfig(environment),
    federationAutoProvision,
    authBootstrapToken,
    federationLifecycleTestToken: authWriteMode === "test" ? federationLifecycleTestToken : undefined,
    federationLifecycleTestEnabled,
    webauthnEnabled,
    webauthnRpId,
    webauthnRpName,
    webauthnOrigins,
    setupNetworkTestAllowlist,
    httpRequestTimeoutMs: positiveInteger(
      "PRG32_BACKEND_HTTP_REQUEST_TIMEOUT_MS",
      environment.PRG32_BACKEND_HTTP_REQUEST_TIMEOUT_MS,
      120_000
    ),
    httpKeepAliveTimeoutMs: positiveInteger(
      "PRG32_BACKEND_HTTP_KEEPALIVE_TIMEOUT_MS",
      environment.PRG32_BACKEND_HTTP_KEEPALIVE_TIMEOUT_MS,
      5_000
    ),
    httpCatalogRateLimitMax: positiveInteger(
      "PRG32_BACKEND_HTTP_CATALOG_RATE_LIMIT_MAX",
      environment.PRG32_BACKEND_HTTP_CATALOG_RATE_LIMIT_MAX,
      120
    ),
    httpDownloadRateLimitMax: positiveInteger(
      "PRG32_BACKEND_HTTP_DOWNLOAD_RATE_LIMIT_MAX",
      environment.PRG32_BACKEND_HTTP_DOWNLOAD_RATE_LIMIT_MAX,
      60
    ),
    httpRateLimitWindowSeconds: positiveInteger(
      "PRG32_BACKEND_HTTP_RATE_LIMIT_WINDOW_SECONDS",
      environment.PRG32_BACKEND_HTTP_RATE_LIMIT_WINDOW_SECONDS,
      60
    ),
    httpRateLimitMaxClients: positiveInteger(
      "PRG32_BACKEND_HTTP_RATE_LIMIT_MAX_CLIENTS",
      environment.PRG32_BACKEND_HTTP_RATE_LIMIT_MAX_CLIENTS,
      4096
    ),
    emailTransport,
    emailFrom,
    emailPublicOrigin,
    emailSmtpHost,
    emailSmtpPort,
    emailSmtpUser,
    emailSmtpPassword,
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
    })(),
    catalogReadMode: configuredCatalogReadMode,
    canonicalStorageRoot: configuredCatalogReadMode === CANONICAL_DISPOSABLE_READ_MODE || configuredCatalogReadMode === CANONICAL_OPERATIONAL_READ_MODE ? path.resolve(canonicalStorageRoot as string) : undefined,
    canonicalReadAuthorization: configuredCatalogReadMode === CANONICAL_DISPOSABLE_READ_MODE || configuredCatalogReadMode === CANONICAL_OPERATIONAL_READ_MODE ? canonicalReadAuthorization : undefined,
    canonicalWorkflowMode,
    canonicalWriteAuthorization: canonicalWorkflowMode === CANONICAL_WORKFLOW_MODE || canonicalWorkflowMode === CANONICAL_OPERATIONAL_WORKFLOW_MODE ? canonicalWriteAuthorization : undefined,
    candidateRuntimeMode,
    candidateRuntimeAuthorization: candidateRuntimeMode === CANDIDATE_RUNTIME_MODE ? candidateRuntimeAuthorization : undefined
  };
}
