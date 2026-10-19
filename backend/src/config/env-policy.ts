import path from "node:path";

import {
  CANONICAL_DISPOSABLE_READ_MODE,
  CANONICAL_WORKFLOW_MODE,
} from "../storage-v2/read-mode.js";
import type { BackendConfig } from "./env-contracts.js";
import {
  looksLikeSqliteUri,
  requiredSecret,
} from "./env-values.js";

/**
 * Values required to validate cross-domain configuration policy.
 *
 * Value parsing and domain-specific defaults remain in `env.ts` and the
 * focused resolver modules. This input contains only the resolved values
 * needed by the writer and runtime-mode invariants.
 */
export interface ConfigurationPolicyInput {
  readonly environment: NodeJS.ProcessEnv;
  readonly configuredDatabase: string;
  readonly configuredStoreData: string;
  readonly legacyConfiguredUserCount: number;
  readonly configuredCatalogReadMode: BackendConfig["catalogReadMode"];
  readonly canonicalStorageRoot: string | undefined;
  readonly canonicalWorkflowMode: BackendConfig["canonicalWorkflowMode"];
  readonly candidateRuntimeMode: BackendConfig["candidateRuntimeMode"];
  readonly operationalMode: boolean;
  readonly authWriteEnabled: boolean;
  readonly authWriteMode: string | undefined;
  readonly authWriteDatabasePath: string | undefined;
  readonly authDisposableRoot: string | undefined;
  readonly authSessionSecret: string | undefined;
  readonly authBootstrapToken: string | undefined;
  readonly federationLifecycleTestToken: string | undefined;
  readonly federationLifecycleTestEnabled: boolean;
  readonly secretEncryptionEnabled: boolean;
  readonly secretKeyRegistryPath: string | undefined;
  readonly submissionWriteEnabled: boolean;
  readonly submissionWriteMode: string | undefined;
  readonly submissionDisposableRoot: string | undefined;
  readonly metricsWriteEnabled: boolean;
  readonly metricsWriteMode: string | undefined;
  readonly metricsDisposableRoot: string | undefined;
  readonly scoresWriteEnabled: boolean;
  readonly scoresWriteMode: string | undefined;
  readonly scoresDisposableRoot: string | undefined;
  readonly backupEnabled: boolean;
  readonly backupMode: string | undefined;
  readonly mdnsEnabled: boolean;
  readonly trustProxy: boolean;
  readonly corsAllowedOrigins: readonly string[];
  readonly frontendPublicOrigin: string | undefined;
  readonly federationAutoProvision: boolean;
}

type WriterConfigurationInput = Pick<
  ConfigurationPolicyInput,
  | "environment"
  | "configuredDatabase"
  | "canonicalStorageRoot"
  | "canonicalWorkflowMode"
  | "candidateRuntimeMode"
  | "operationalMode"
  | "authWriteEnabled"
  | "authWriteMode"
  | "authWriteDatabasePath"
  | "authDisposableRoot"
  | "authSessionSecret"
  | "authBootstrapToken"
  | "federationLifecycleTestToken"
  | "federationLifecycleTestEnabled"
  | "secretEncryptionEnabled"
  | "secretKeyRegistryPath"
  | "submissionWriteEnabled"
  | "submissionWriteMode"
  | "submissionDisposableRoot"
  | "metricsWriteEnabled"
  | "metricsWriteMode"
  | "metricsDisposableRoot"
  | "scoresWriteEnabled"
  | "scoresWriteMode"
  | "scoresDisposableRoot"
  | "backupEnabled"
  | "backupMode"
>;

type RuntimeConfigurationInput = Pick<
  ConfigurationPolicyInput,
  | "environment"
  | "configuredDatabase"
  | "configuredStoreData"
  | "legacyConfiguredUserCount"
  | "configuredCatalogReadMode"
  | "canonicalStorageRoot"
  | "canonicalWorkflowMode"
  | "candidateRuntimeMode"
  | "operationalMode"
  | "authWriteEnabled"
  | "authWriteMode"
  | "authWriteDatabasePath"
  | "authDisposableRoot"
  | "authSessionSecret"
  | "authBootstrapToken"
  | "federationLifecycleTestEnabled"
  | "secretEncryptionEnabled"
  | "secretKeyRegistryPath"
  | "backupEnabled"
  | "mdnsEnabled"
  | "trustProxy"
  | "corsAllowedOrigins"
  | "frontendPublicOrigin"
  | "federationAutoProvision"
>;

function isProduction(environment: NodeJS.ProcessEnv): boolean {
  return (environment.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

function hasLegacyConfiguration(
  input: Pick<
    ConfigurationPolicyInput,
    "environment" | "legacyConfiguredUserCount"
  >,
): boolean {
  const { environment } = input;
  return input.legacyConfiguredUserCount > 0 ||
    environment.PRG32_USERS !== undefined ||
    environment.PRG32_SCORE_DB !== undefined ||
    environment.PRG32_METRICS_DB !== undefined ||
    environment.PRG32_STORE_DATA !== undefined ||
    environment.PRG32_STORE_DB !== undefined;
}

/** Validates isolated writer settings before the network config is resolved. */
export function validateWriterConfiguration(
  input: WriterConfigurationInput,
): void {
  const {
    authBootstrapToken,
    authDisposableRoot,
    authSessionSecret,
    authWriteDatabasePath,
    authWriteEnabled,
    authWriteMode,
    backupEnabled,
    backupMode,
    canonicalStorageRoot,
    canonicalWorkflowMode,
    configuredDatabase,
    environment,
    federationLifecycleTestEnabled,
    federationLifecycleTestToken,
    metricsDisposableRoot,
    metricsWriteEnabled,
    metricsWriteMode,
    operationalMode,
    scoresDisposableRoot,
    scoresWriteEnabled,
    scoresWriteMode,
    secretEncryptionEnabled,
    secretKeyRegistryPath,
    submissionDisposableRoot,
    submissionWriteEnabled,
    submissionWriteMode,
  } = input;

  if (authWriteEnabled) {
    if (
      authWriteMode !== "test" &&
      !(operationalMode && authWriteMode === "operational")
    ) {
      throw new Error(
        "PRG32_BACKEND_AUTH_WRITE_MODE must be test or operational " +
          "when auth writes are enabled",
      );
    }
    if (!authWriteDatabasePath) {
      throw new Error(
        "PRG32_BACKEND_AUTH_WRITE_DB is required when auth writes are enabled",
      );
    }
    if (!authDisposableRoot) {
      throw new Error(
        "PRG32_BACKEND_AUTH_DISPOSABLE_ROOT is required when auth writes are enabled",
      );
    }
    requiredSecret("PRG32_BACKEND_SESSION_SECRET", authSessionSecret);
    if (authBootstrapToken) {
      requiredSecret("PRG32_BACKEND_BOOTSTRAP_TOKEN", authBootstrapToken);
    }
    if (federationLifecycleTestToken && federationLifecycleTestToken.length < 32) {
      throw new Error(
        "PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_TOKEN must contain at least 32 characters",
      );
    }
    if (federationLifecycleTestEnabled && !federationLifecycleTestToken) {
      throw new Error(
        "PRG32_BACKEND_FEDERATION_LIFECYCLE_TEST_TOKEN is required when lifecycle test routes are enabled",
      );
    }
    if (looksLikeSqliteUri(authWriteDatabasePath)) {
      throw new Error(
        "SQLite URI syntax is not allowed for the auth write database",
      );
    }
    if (
      path.resolve(authWriteDatabasePath) === path.resolve(configuredDatabase) &&
      input.candidateRuntimeMode === undefined &&
      !operationalMode
    ) {
      throw new Error(
        "auth write database must be separate from the shadow database",
      );
    }
    if (canonicalWorkflowMode === CANONICAL_WORKFLOW_MODE || operationalMode) {
      const canonicalRoot = path.resolve(canonicalStorageRoot as string);
      if (
        path.resolve(authDisposableRoot) !== canonicalRoot ||
        path.resolve(authWriteDatabasePath) !==
          path.join(canonicalRoot, "store.sqlite")
      ) {
        throw new Error(
          "canonical workflow authentication must use the canonical storage-v2 database",
        );
      }
    }
  }
  if (
    (canonicalWorkflowMode === CANONICAL_WORKFLOW_MODE || operationalMode) &&
    !authWriteEnabled
  ) {
    throw new Error(
      "canonical workflow requires the canonical authentication writer",
    );
  }
  if (
    federationLifecycleTestEnabled &&
    (authWriteMode !== "test" ||
      !authWriteEnabled ||
      !authDisposableRoot ||
      !authWriteDatabasePath)
  ) {
    throw new Error(
      "federation lifecycle test routes require the isolated auth writer configuration",
    );
  }
  if (isProduction(environment) && federationLifecycleTestEnabled) {
    throw new Error(
      "federation lifecycle test routes cannot be enabled in production",
    );
  }
  if (secretEncryptionEnabled && !secretKeyRegistryPath) {
    throw new Error(
      "PRG32_BACKEND_SECRET_KEY_REGISTRY is required when secret encryption is enabled",
    );
  }
  if (submissionWriteEnabled) {
    if (submissionWriteMode !== "test") {
      throw new Error(
        "PRG32_BACKEND_SUBMISSION_WRITE_MODE must be test when submission writes are enabled",
      );
    }
    if (!authWriteEnabled) {
      throw new Error("submission writes require isolated authentication writes");
    }
    if (!submissionDisposableRoot) {
      throw new Error(
        "PRG32_BACKEND_SUBMISSION_DISPOSABLE_ROOT is required when submission writes are enabled",
      );
    }
    if (path.resolve(submissionDisposableRoot) === path.resolve(configuredDatabase)) {
      throw new Error(
        "submission disposable root must be separate from the shadow database",
      );
    }
  }
  if (metricsWriteEnabled) {
    if (metricsWriteMode !== "test") {
      throw new Error(
        "PRG32_BACKEND_METRICS_WRITE_MODE must be test when metrics writes are enabled",
      );
    }
    if (!authWriteEnabled || !authDisposableRoot || !authWriteDatabasePath) {
      throw new Error("metrics writes require isolated authentication writes");
    }
    if (!metricsDisposableRoot) {
      throw new Error(
        "PRG32_BACKEND_METRICS_DISPOSABLE_ROOT is required when metrics writes are enabled",
      );
    }
    if (path.resolve(metricsDisposableRoot) !== path.resolve(authDisposableRoot)) {
      throw new Error(
        "metrics disposable root must reuse the authenticated disposable writer boundary",
      );
    }
  }
  if (scoresWriteEnabled) {
    if (scoresWriteMode !== "test") {
      throw new Error(
        "PRG32_BACKEND_SCORES_WRITE_MODE must be test when score writes are enabled",
      );
    }
    if (!authWriteEnabled || !authDisposableRoot || !authWriteDatabasePath) {
      throw new Error("score writes require isolated authentication writes");
    }
    if (!scoresDisposableRoot) {
      throw new Error(
        "PRG32_BACKEND_SCORES_DISPOSABLE_ROOT is required when score writes are enabled",
      );
    }
    if (path.resolve(scoresDisposableRoot) !== path.resolve(authDisposableRoot)) {
      throw new Error(
        "score disposable root must reuse the authenticated disposable writer boundary",
      );
    }
  }
  if (backupEnabled) {
    if (backupMode !== "test") {
      throw new Error(
        "PRG32_BACKEND_BACKUP_MODE must be test when backup is enabled",
      );
    }
    if (!authWriteEnabled || authWriteMode !== "test") {
      throw new Error(
        "backup requires the isolated authentication writer profile",
      );
    }
  }
}

/** Validates the candidate and operational runtime ownership boundaries. */
export function validateRuntimeConfiguration(
  input: RuntimeConfigurationInput,
): void {
  const {
    authBootstrapToken,
    authWriteEnabled,
    authWriteMode,
    canonicalStorageRoot,
    canonicalWorkflowMode,
    configuredCatalogReadMode,
    configuredDatabase,
    configuredStoreData,
    corsAllowedOrigins,
    environment,
    federationAutoProvision,
    federationLifecycleTestEnabled,
    frontendPublicOrigin,
    mdnsEnabled,
    operationalMode,
    secretEncryptionEnabled,
    secretKeyRegistryPath,
    trustProxy,
  } = input;

  if (input.candidateRuntimeMode !== undefined) {
    const candidateRoot = path.resolve(canonicalStorageRoot ?? "");
    const canonicalDatabase = path.join(candidateRoot, "store.sqlite");
    if (isProduction(environment)) {
      throw new Error(
        "the two-service disposable candidate is disabled in production",
      );
    }
    if (
      configuredCatalogReadMode !== CANONICAL_DISPOSABLE_READ_MODE ||
      canonicalWorkflowMode !== CANONICAL_WORKFLOW_MODE
    ) {
      throw new Error(
        "the two-service candidate requires canonical disposable workflow mode",
      );
    }
    if (
      path.resolve(configuredDatabase) !== canonicalDatabase ||
      path.resolve(configuredStoreData) !== candidateRoot
    ) {
      throw new Error(
        "the two-service candidate requires one canonical root and store.sqlite database",
      );
    }
    if (
      !authWriteEnabled ||
      path.resolve(input.authDisposableRoot ?? "") !== candidateRoot ||
      path.resolve(input.authWriteDatabasePath ?? "") !== canonicalDatabase
    ) {
      throw new Error(
        "the two-service candidate requires the canonical SQLite writer boundary",
      );
    }
    if (hasLegacyConfiguration(input)) {
      throw new Error(
        "legacy database and configured-user fallbacks are disabled in the two-service candidate",
      );
    }
    if (mdnsEnabled) {
      throw new Error("mDNS must remain disabled in the two-service candidate");
    }
    if (input.backupEnabled) {
      throw new Error("public backup support is disabled in the two-service candidate");
    }
  }
  if (operationalMode) {
    if (input.candidateRuntimeMode !== undefined) {
      throw new Error(
        "candidate runtime mode cannot be combined with canonical-operational mode",
      );
    }
    if (hasLegacyConfiguration(input)) {
      throw new Error(
        "legacy database and configured-user fallbacks are disabled in canonical-operational mode",
      );
    }
    const canonicalRoot = path.resolve(canonicalStorageRoot as string);
    if (
      path.resolve(configuredDatabase) !== path.join(canonicalRoot, "store.sqlite") ||
      path.resolve(configuredStoreData) !== canonicalRoot
    ) {
      throw new Error(
        "canonical-operational mode requires one canonical root and store.sqlite database",
      );
    }
    if (authWriteMode !== "operational" || !authWriteEnabled) {
      throw new Error(
        "canonical-operational mode requires the operational canonical auth writer",
      );
    }
    if (!trustProxy) {
      throw new Error(
        "canonical-operational mode requires PRG32_BACKEND_TRUST_PROXY to be enabled",
      );
    }
    if (
      corsAllowedOrigins.some(
        (origin) => origin === "*" || origin !== frontendPublicOrigin,
      )
    ) {
      throw new Error(
        "canonical-operational mode requires an exact CORS allowlist matching PRG32_BACKEND_FRONTEND_PUBLIC_ORIGIN",
      );
    }
    if (mdnsEnabled) {
      throw new Error("mDNS must remain disabled in canonical-operational mode");
    }
    if (federationLifecycleTestEnabled || federationAutoProvision) {
      throw new Error(
        "test federation lifecycle and auto-provisioning are disabled in canonical-operational mode",
      );
    }
    requiredSecret("PRG32_BACKEND_SESSION_SECRET", input.authSessionSecret);
    if (!authBootstrapToken) {
      throw new Error(
        "PRG32_BACKEND_BOOTSTRAP_TOKEN is required in canonical-operational mode",
      );
    }
    requiredSecret("PRG32_BACKEND_BOOTSTRAP_TOKEN", authBootstrapToken);
    if (!secretEncryptionEnabled || !secretKeyRegistryPath) {
      throw new Error(
        "canonical-operational mode requires external secret encryption key configuration",
      );
    }
  }
}
