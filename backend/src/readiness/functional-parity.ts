export const FUNCTIONAL_PARITY_ABI = "prg32-fastify-functional-parity-1.0" as const;

export type FunctionalDisposition =
  | "migrated_verified"
  | "migrated_not_fully_verified"
  | "partially_migrated"
  | "missing"
  | "intentionally_retired"
  | "legacy_only";

export interface FunctionalCapability {
  readonly id: string;
  readonly capability: string;
  readonly flaskSources: readonly string[];
  readonly fastifySources: readonly string[];
  readonly frontendSources: readonly string[];
  readonly disposition: FunctionalDisposition;
  readonly evidence: readonly string[];
  readonly blockers: readonly string[];
  readonly firmwareRelevant: boolean;
}

/**
 * Flask route paths normalized to the notation used by the Fastify inventory.
 * The list is deliberately source-backed by the audit test, which parses the
 * decorators in the Flask modules and fails if a new route is not classified.
 */
export const FLASK_ROUTE_PATHS = [
  "/",
  "/games/:game_id",
  "/publish",
  "/setup",
  "/setup/logo",
  "/setup/favicon",
  "/static/custom/:filename",
  "/admin/users",
  "/admin/users/:user_id",
  "/admin/users/:user_id/role",
  "/admin/users/:user_id/groups",
  "/admin/users/:user_id/delete",
  "/admin/groups",
  "/admin/groups/:group_id",
  "/admin/groups/:group_id/delete",
  "/admin/roles",
  "/admin/cartridges",
  "/admin/cartridges/:game_id/:version",
  "/admin/cartridges/:game_id/:version/delete",
  "/admin/backup",
  "/admin/backup/download",
  "/admin/backup/restore",
  "/manifest.webmanifest",
  "/.well-known/prg32-store.json",
  "/api",
  "/api/me",
  "/api/games",
  "/api/games/:game_id",
  "/api/games/:game_id/icon",
  "/api/games/:game_id/screenshot",
  "/api/games/:game_id/colophon",
  "/api/games/:game_id/download",
  "/api/publish",
  "/api/publish/bundle",
  "/auth/csrf",
  "/auth/bootstrap",
  "/auth/register",
  "/auth/register/complete",
  "/auth/login",
  "/auth/logout",
  "/auth/me",
  "/auth/tokens",
  "/auth/tokens/:token_id",
  "/auth/tokens/:token_id/update",
  "/auth/tokens/:token_id/revoke",
  "/auth/oidc/login",
  "/auth/oidc/callback",
  "/auth/saml/login",
  "/auth/saml/acs",
  "/auth/saml/metadata",
  "/api/scores",
  "/scores",
  "/editor/submissions",
  "/editor/submissions/:submission_id",
  "/editor/submissions/:submission_id/verify",
  "/editor/submissions/:submission_id/reject",
  "/api/submissions",
  "/api/submissions/:submission_id",
  "/api/submissions/:submission_id/verify",
  "/api/submissions/:submission_id/reject",
  "/api/metrics",
  "/api/runs",
  "/api/metrics/batch",
  "/api/runs/:run_id/finish",
  "/api/runs/:run_id",
  "/api/runs/:run_id/samples.csv",
  "/api/runs/:run_id/report.md",
  "/api/stats/downloads",
  "/api/stats/downloads/:game_id",
  "/api/stats/scores",
  "/api/stats/runs",
  "/stats",
  "/users/:username",
  "/users/:username/runs",
  "/users/:username/runs/:run_id",
  "/api/multiplayer/status",
  "/api/multiplayer"
] as const;

export const FUNCTIONAL_CAPABILITIES: readonly FunctionalCapability[] = [
  {
    id: "catalog-read",
    capability: "Catalog listing, details, versions, architectures, media and binary downloads",
    flaskSources: ["cartridge_store/app.py"],
    fastifySources: [
      "backend/src/catalog/routes.ts",
      "backend/src/storage-v2/catalog.ts"
    ],
    frontendSources: ["frontend/src/app/page.tsx", "frontend/src/app/games/[gameId]/page.tsx"],
    disposition: "migrated_verified",
    evidence: ["M5.2d 22/22 differential catalog cases", "M5.2g.1 canonical HTTP read, media and binary tests", "source database and object files are not read by canonical catalog code"],
    blockers: ["public ownership and download-write reconciliation remain outside this milestone"],
    firmwareRelevant: true
  },
  {
    id: "discovery",
    capability: "Store discovery document and ABI-preserving service metadata",
    flaskSources: ["cartridge_store/app.py"],
    fastifySources: ["backend/src/catalog/routes.ts", "backend/src/discovery/service.ts"],
    frontendSources: [],
    disposition: "migrated_verified",
    evidence: ["M5.2g.1 discovery route tests", "M5.2g.4 isolated mDNS lifecycle tests", "M5.2g.6 canonical-settings regression test"],
    blockers: ["real LAN advertisement and public routing are intentionally unverified"],
    firmwareRelevant: true
  },
  {
    id: "legacy-html",
    capability: "Jinja/PWA pages, framework static assets, user pages and HTML admin/editor routes",
    flaskSources: ["cartridge_store/app.py", "cartridge_store/users.py", "cartridge_store/review.py", "templates/", "static/"],
    fastifySources: [],
    frontendSources: ["frontend/src/app/"],
    disposition: "legacy_only",
    evidence: ["Flask route decorator inventory", "Next.js pages cover the modern storefront/admin surface but not every legacy URL"],
    blockers: ["legacy URL and HTML/static parity is not complete", "Flask remains required until the Next.js replacement is accepted"],
    firmwareRelevant: false
  },
  {
    id: "local-auth",
    capability: "Local accounts, bootstrap, login, registration, sessions, CSRF and API tokens",
    flaskSources: ["cartridge_store/auth/__init__.py"],
    fastifySources: ["backend/src/auth/routes.ts", "backend/src/auth/service.ts", "backend/src/authorization/"],
    frontendSources: ["frontend/src/app/login/page.tsx", "frontend/src/app/account/page.tsx"],
    disposition: "migrated_not_fully_verified",
    evidence: ["backend auth/authorization regression suite", "M5.2g.5 canonical auth/session tests"],
    blockers: ["Flask and Fastify session cookies are intentionally incompatible", "controlled re-login and operational writer continuity are open"],
    firmwareRelevant: true
  },
  {
    id: "generic-federation",
    capability: "Generic OIDC/SAML provider login, callback, metadata and identity administration",
    flaskSources: ["cartridge_store/auth/oidc_adapter.py", "cartridge_store/auth/saml_adapter.py"],
    fastifySources: ["backend/src/oidc/", "backend/src/saml/", "backend/src/federation/"],
    frontendSources: ["frontend/src/app/admin/federation/", "frontend/src/app/login/page.tsx"],
    disposition: "migrated_not_fully_verified",
    evidence: ["M5.2g.5 synthetic OIDC/SAML protocol and identity tests", "generic provider model preserved; no Authentik-specific runtime assumption"],
    blockers: ["real external provider/browser acceptance is out of scope", "legacy default-provider routes differ from provider-id API routes"],
    firmwareRelevant: false
  },
  {
    id: "publishing-review",
    capability: "Bundle publishing intake, private staging, review, approval, rejection and publication",
    flaskSources: ["cartridge_store/app.py", "cartridge_store/review.py"],
    fastifySources: ["backend/src/submission/", "backend/src/review/", "backend/src/storage-v2/workflow.ts"],
    frontendSources: ["frontend/src/app/publish/page.tsx", "frontend/src/app/review/page.tsx", "frontend/src/app/workspace/page.tsx"],
    disposition: "partially_migrated",
    evidence: ["M5.2g.2 disposable submission/review/publication workflow", "publication journal and interruption recovery tests"],
    blockers: ["operational single-writer ownership is not enabled", "legacy publication and review history still require migration/cutover gates"],
    firmwareRelevant: false
  },
  {
    id: "metrics",
    capability: "Firmware run ingestion, samples, completion, detail and CSV/Markdown exports",
    flaskSources: ["cartridge_store/metrics.py"],
    fastifySources: ["backend/src/metrics/", "backend/src/storage-v2/workflow.ts"],
    frontendSources: ["frontend/src/lib/api/metrics.ts", "frontend/src/app/stats/page.tsx"],
    disposition: "partially_migrated",
    evidence: ["M5.2g.3 canonical telemetry tests", "Python compatibility and security/resource-limit tests"],
    blockers: ["operational firmware write ownership and reconciliation are not complete"],
    firmwareRelevant: true
  },
  {
    id: "scores",
    capability: "Score ingestion, anonymous/authenticated policy and leaderboard reads",
    flaskSources: ["cartridge_store/scores.py"],
    fastifySources: ["backend/src/scores/"],
    frontendSources: ["frontend/src/app/scores/page.tsx"],
    disposition: "partially_migrated",
    evidence: ["M5.2g.3 canonical score and leaderboard tests", "firmware compatibility tests"],
    blockers: ["operational write ownership, rate-limit continuity and reconciliation remain open"],
    firmwareRelevant: true
  },
  {
    id: "statistics",
    capability: "Aggregate download, score and run statistics plus user/run detail views",
    flaskSources: ["cartridge_store/stats.py", "cartridge_store/users.py"],
    fastifySources: ["backend/src/stats/"],
    frontendSources: ["frontend/src/app/stats/page.tsx"],
    disposition: "migrated_not_fully_verified",
    evidence: ["M5.2g.3 canonical statistics tests", "aggregate/public authorization regression tests"],
    blockers: ["public ownership depends on complete canonical telemetry write reconciliation", "legacy HTML user views remain Flask-owned"],
    firmwareRelevant: false
  },
  {
    id: "administration",
    capability: "Users, groups, roles, tokens, settings, site assets and catalog administration",
    flaskSources: ["cartridge_store/app.py", "cartridge_store/settings.py", "cartridge_store/auth/__init__.py"],
    fastifySources: ["backend/src/admin/", "backend/src/settings/", "backend/src/authorization/"],
    frontendSources: ["frontend/src/app/admin/", "frontend/src/app/account/"],
    disposition: "partially_migrated",
    evidence: ["Fastify admin/settings tests", "M5.2g.6 canonical catalog admin read with shadow DB unavailable"],
    blockers: ["all operational administrative writes are not transferred", "legacy HTML setup/admin parity remains open"],
    firmwareRelevant: false
  },
  {
    id: "backup-restore",
    capability: "Administrative backup, download and restore interfaces",
    flaskSources: ["cartridge_store/app.py"],
    fastifySources: ["backend/src/backup/", "backend/src/storage-v2/backup.ts"],
    frontendSources: ["frontend/src/app/admin/"],
    disposition: "partially_migrated",
    evidence: ["M5.2e v3 disposable writer, verifier, restore and fault-injection suite"],
    blockers: ["developer-only/disposable authorization", "operational encryption, authenticity, retention and restore runbook are open"],
    firmwareRelevant: false
  },
  {
    id: "multiplayer",
    capability: "Multiplayer status, WebSocket relay and process lifecycle",
    flaskSources: ["cartridge_store/multiplayer.py"],
    fastifySources: ["backend/src/multiplayer/", "backend/src/discovery/"],
    frontendSources: ["frontend/src/lib/api/"],
    disposition: "migrated_not_fully_verified",
    evidence: ["M5.2g.4 Fastify WebSocket/mDNS unit and differential tests"],
    blockers: ["external proxy/WebSocket acceptance and live ownership switch are not verified"],
    firmwareRelevant: true
  },
  {
    id: "optional-ldap",
    capability: "Optional LDAP/Active Directory adapter",
    flaskSources: ["cartridge_store/auth/ldap_adapter.py"],
    fastifySources: [],
    frontendSources: [],
    disposition: "legacy_only",
    evidence: ["Flask adapter only logs that interactive LDAP login is not enabled", "LDAP is not an active public contract in this build"],
    blockers: ["must be explicitly decided before Flask retirement if deployment enables the optional setting"],
    firmwareRelevant: false
  },
  {
    id: "error-and-security-boundaries",
    capability: "Stable API errors, upload/metrics limits, CSRF, authorization and secret-safe diagnostics",
    flaskSources: ["cartridge_store/app.py", "cartridge_store/auth/__init__.py", "cartridge_store/metrics.py"],
    fastifySources: ["backend/src/app.ts", "backend/src/submission/", "backend/src/metrics/", "backend/src/authorization/"],
    frontendSources: [],
    disposition: "migrated_verified",
    evidence: ["M1.2a containment tests", "Fastify adversarial and authorization tests", "Fastify error handler does not expose raw exception text"],
    blockers: ["operational deployment configuration still requires independent review"],
    firmwareRelevant: true
  }
] as const;

export interface CanonicalRuntimeDependencyAudit {
  readonly canonicalCatalogReadsLegacyObjects: false;
  readonly canonicalDiscoveryReadsLegacyDatabase: false;
  readonly canonicalAdminReadsLegacyCatalog: false;
  readonly canonicalAssetsUseLegacyDirectory: false;
  readonly canonicalWorkflowRequiresLegacyWriter: false;
  readonly evidence: readonly string[];
}

export interface FunctionalParityAudit {
  readonly abi: typeof FUNCTIONAL_PARITY_ABI;
  readonly milestone: "M5.2g.6";
  readonly generatedAt: string;
  readonly flaskRouteCount: number;
  readonly flaskRoutePaths: readonly string[];
  readonly capabilities: readonly FunctionalCapability[];
  readonly canonicalRuntime: CanonicalRuntimeDependencyAudit;
  readonly operationalCutoverDecision: "NO-GO";
  readonly flaskRetirementDecision: "NO-GO";
  readonly nextMilestone: string;
}

export function buildFunctionalParityAudit(now = new Date().toISOString()): FunctionalParityAudit {
  return {
    abi: FUNCTIONAL_PARITY_ABI,
    milestone: "M5.2g.6",
    generatedAt: now,
    flaskRouteCount: FLASK_ROUTE_PATHS.length,
    flaskRoutePaths: FLASK_ROUTE_PATHS,
    capabilities: FUNCTIONAL_CAPABILITIES,
    canonicalRuntime: {
      canonicalCatalogReadsLegacyObjects: false,
      canonicalDiscoveryReadsLegacyDatabase: false,
      canonicalAdminReadsLegacyCatalog: false,
      canonicalAssetsUseLegacyDirectory: false,
      canonicalWorkflowRequiresLegacyWriter: false,
      evidence: [
        "backend/src/storage-v2/catalog.ts owns canonical catalog reads",
        "backend/src/catalog/routes.ts reads discovery settings from the canonical catalog source",
        "backend/src/app.ts injects CanonicalCatalog and canonical site-asset paths when a canonical root is configured",
        "backend/src/storage-v2/workflow.ts owns disposable publication/review writes"
      ]
    },
    operationalCutoverDecision: "NO-GO",
    flaskRetirementDecision: "NO-GO",
    nextMilestone: "M5.2g.7 — operational cutover preparation, separately authorized"
  };
}

export function stableFunctionalParityJson(now = new Date().toISOString()): string {
  return `${JSON.stringify(buildFunctionalParityAudit(now), null, 2)}\n`;
}
