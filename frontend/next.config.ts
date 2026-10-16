import type { NextConfig } from "next";
import { resolveApiUpstream } from "./src/lib/next-proxy";

const configuredAdminFastifyTarget = process.env.PRG32_ADMIN_FASTIFY_TARGET?.trim();
const configuredWorkflowFastifyTarget = process.env.PRG32_WORKFLOW_FASTIFY_TARGET?.trim();
const configuredFederationAdminFastifyTarget = process.env.PRG32_FEDERATION_ADMIN_FASTIFY_TARGET?.trim();
const configuredFederationAdminIntegration = process.env.PRG32_FEDERATION_ADMIN_INTEGRATION_ENABLED?.trim().toLowerCase() === "true";
const configuredAuthFastifyTarget = process.env.PRG32_AUTH_FASTIFY_TARGET?.trim();
const configuredAuthIntegration = process.env.PRG32_AUTH_INTEGRATION_ENABLED?.trim().toLowerCase() === "true";
const configuredOperationalMode = process.env.PRG32_NEXT_RUNTIME_MODE?.trim().toLowerCase() === "operational";
const configuredDualOriginIntegration = process.env.PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED?.trim().toLowerCase() === "true";
const configuredPublicApiOrigin = process.env.NEXT_PUBLIC_PRG32_API_ORIGIN?.trim();
const configuredDistDir = process.env.PRG32_NEXT_DIST_DIR?.trim();
const isProductionBuild = process.env.NODE_ENV === "production";
const configuredAuthUi = configuredAuthIntegration || configuredDualOriginIntegration;

if (isProductionBuild && configuredAdminFastifyTarget && !configuredOperationalMode) {
  throw new Error(
    "PRG32_ADMIN_FASTIFY_TARGET is development/test-only and must not be configured for production builds.",
  );
}

if (isProductionBuild && configuredWorkflowFastifyTarget && !configuredOperationalMode) {
  throw new Error(
    "PRG32_WORKFLOW_FASTIFY_TARGET is development/test-only and must not be configured for production builds.",
  );
}

if (isProductionBuild && (configuredFederationAdminIntegration || configuredFederationAdminFastifyTarget) && !configuredOperationalMode) {
  throw new Error(
    "PRG32_FEDERATION_ADMIN_INTEGRATION_ENABLED and PRG32_FEDERATION_ADMIN_FASTIFY_TARGET are development/test-only and must not be configured for production builds.",
  );
}

if (configuredFederationAdminIntegration && !configuredFederationAdminFastifyTarget) {
  throw new Error("PRG32_FEDERATION_ADMIN_FASTIFY_TARGET is required when PRG32_FEDERATION_ADMIN_INTEGRATION_ENABLED=true.");
}

if (!configuredFederationAdminIntegration && configuredFederationAdminFastifyTarget) {
  throw new Error("PRG32_FEDERATION_ADMIN_INTEGRATION_ENABLED=true is required when PRG32_FEDERATION_ADMIN_FASTIFY_TARGET is configured.");
}

if (configuredFederationAdminIntegration && !configuredAuthIntegration) {
  throw new Error("PRG32_AUTH_INTEGRATION_ENABLED=true is required when federation administration integration is enabled.");
}

if (isProductionBuild && (configuredAuthIntegration || configuredAuthFastifyTarget) && !configuredOperationalMode) {
  throw new Error(
    "PRG32_AUTH_INTEGRATION_ENABLED and PRG32_AUTH_FASTIFY_TARGET are development/test-only and must not be configured for production builds.",
  );
}

if (isProductionBuild && (configuredDualOriginIntegration || configuredPublicApiOrigin)) {
  throw new Error(
    "PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED and NEXT_PUBLIC_PRG32_API_ORIGIN are development/test-only and must not be configured for production builds.",
  );
}

if (configuredDualOriginIntegration && !configuredPublicApiOrigin) {
  throw new Error("NEXT_PUBLIC_PRG32_API_ORIGIN is required when PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED=true.");
}

if (!configuredDualOriginIntegration && configuredPublicApiOrigin) {
  throw new Error("PRG32_DUAL_ORIGIN_INTEGRATION_ENABLED=true is required when NEXT_PUBLIC_PRG32_API_ORIGIN is configured.");
}

if (configuredDualOriginIntegration && (configuredAuthIntegration || configuredAuthFastifyTarget || configuredFederationAdminIntegration || configuredFederationAdminFastifyTarget)) {
  throw new Error("Dual-origin mode owns browser auth and federation requests directly; Next.js auth/federation proxy integration must be disabled.");
}

if (configuredPublicApiOrigin) {
  let parsedApiOrigin: URL;
  try { parsedApiOrigin = new URL(configuredPublicApiOrigin); } catch { throw new Error("NEXT_PUBLIC_PRG32_API_ORIGIN must be a valid origin"); }
  if (parsedApiOrigin.username || parsedApiOrigin.password || parsedApiOrigin.pathname !== "/" || parsedApiOrigin.search || parsedApiOrigin.hash || parsedApiOrigin.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_PRG32_API_ORIGIN must be an HTTPS origin without credentials or a path.");
  }
}

if (configuredDistDir && (!/^\.next-[A-Za-z0-9._-]+$/u.test(configuredDistDir) || configuredDistDir.includes(".."))) {
  throw new Error("PRG32_NEXT_DIST_DIR must be an isolated .next-* directory name.");
}

if (configuredAuthIntegration && !configuredAuthFastifyTarget) {
  throw new Error("PRG32_AUTH_FASTIFY_TARGET is required when PRG32_AUTH_INTEGRATION_ENABLED=true.");
}

if (!configuredAuthIntegration && configuredAuthFastifyTarget) {
  throw new Error("PRG32_AUTH_INTEGRATION_ENABLED=true is required when PRG32_AUTH_FASTIFY_TARGET is configured.");
}

const apiUpstream = resolveApiUpstream(process.env, { production: isProductionBuild });
const normalizedApiUpstream = apiUpstream.target;

if (configuredAdminFastifyTarget) {
  const parsedAdminTarget = new URL(configuredAdminFastifyTarget);
  if (parsedAdminTarget.protocol !== "http:" && parsedAdminTarget.protocol !== "https:") {
    throw new Error("PRG32_ADMIN_FASTIFY_TARGET must use http:// or https://.");
  }
  if (parsedAdminTarget.username || parsedAdminTarget.password) {
    throw new Error("PRG32_ADMIN_FASTIFY_TARGET must not contain credentials.");
  }
}

if (configuredWorkflowFastifyTarget) {
  const parsedWorkflowTarget = new URL(configuredWorkflowFastifyTarget);
  if (parsedWorkflowTarget.protocol !== "http:" && parsedWorkflowTarget.protocol !== "https:") {
    throw new Error("PRG32_WORKFLOW_FASTIFY_TARGET must use http:// or https://.");
  }
  if (parsedWorkflowTarget.username || parsedWorkflowTarget.password) {
    throw new Error("PRG32_WORKFLOW_FASTIFY_TARGET must not contain credentials.");
  }
}

if (configuredFederationAdminFastifyTarget) {
  const parsedFederationTarget = new URL(configuredFederationAdminFastifyTarget);
  if (parsedFederationTarget.protocol !== "http:" && parsedFederationTarget.protocol !== "https:") {
    throw new Error("PRG32_FEDERATION_ADMIN_FASTIFY_TARGET must use http:// or https://.");
  }
  if (parsedFederationTarget.username || parsedFederationTarget.password || parsedFederationTarget.search || parsedFederationTarget.hash || parsedFederationTarget.pathname !== "/") {
    throw new Error("PRG32_FEDERATION_ADMIN_FASTIFY_TARGET must be an origin without credentials or a path.");
  }
}

if (configuredAuthFastifyTarget) {
  const parsedAuthTarget = new URL(configuredAuthFastifyTarget);
  if (parsedAuthTarget.protocol !== "http:" && parsedAuthTarget.protocol !== "https:") {
    throw new Error("PRG32_AUTH_FASTIFY_TARGET must use http:// or https://.");
  }
  if (parsedAuthTarget.username || parsedAuthTarget.password || parsedAuthTarget.search || parsedAuthTarget.hash || parsedAuthTarget.pathname !== "/") {
    throw new Error("PRG32_AUTH_FASTIFY_TARGET must be an origin without credentials or a path.");
  }
}

const normalizedAdminFastifyTarget = configuredAdminFastifyTarget?.replace(/\/$/, "");
const normalizedWorkflowFastifyTarget = configuredWorkflowFastifyTarget?.replace(/\/$/, "");
const normalizedFederationAdminFastifyTarget = configuredFederationAdminFastifyTarget?.replace(/\/$/, "");
const normalizedAuthFastifyTarget = configuredAuthFastifyTarget?.replace(/\/$/, "");

const proxyPaths = [
  // In isolated mode the canonical auth namespaces are excluded from the
  // Flask catch-alls at pattern level. This keeps the boundary correct even
  // if rewrite ordering changes in a future Next.js release.
  ...(configuredAuthIntegration
    ? [
        "/api/:path((?!auth(?:/|$)|admin/federation(?:/|$)).*)",
        "/auth/:path((?!auth(?:/|$)).*)",
      ]
    : ["/api/:path*", "/auth/:path*"]),
  "/admin/:path*",
  "/editor/:path*",
  "/publish/:path*",
  "/setup/:path*",
  "/scores/:path*",
  "/stats/:path*",
  "/static/:path*",
  "/manifest.webmanifest",
  "/.well-known/:path*",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev browser reaches Next through the shared Dream Traefik HTTPS
  // origin. Allow that exact host for HMR/dev resources.
  allowedDevOrigins: [process.env.PRG32_STORE_DOMAIN?.trim() || "store.prg32.dream.test"],
  env: {
    // Dual-origin mode keeps the Next proxy disabled, but the browser UI must
    // still expose the login/provider controls and call the API origin.
    NEXT_PUBLIC_AUTH_INTEGRATION_ENABLED: configuredAuthUi ? "true" : "false",
    NEXT_PUBLIC_PRG32_UI93_AUTHENTICATED: process.env.PRG32_UI93_AUTHENTICATED === "1" ? "true" : "false",
    NEXT_PUBLIC_PRG32_DUAL_ORIGIN_ENABLED: configuredDualOriginIntegration ? "true" : "false",
    ...(configuredPublicApiOrigin ? { NEXT_PUBLIC_PRG32_API_ORIGIN: configuredPublicApiOrigin } : {}),
  },
  output: "standalone",
  ...(configuredDistDir ? { distDir: configuredDistDir } : {}),
  async rewrites() {
    const apiRewrites = configuredAuthIntegration
      ? [
          {
            source: "/api/:path((?!auth(?:/|$)|admin/federation(?:/|$)).*)",
            destination: `${normalizedApiUpstream}/api/:path*`,
          },
          {
            source: "/auth/:path((?!auth(?:/|$)).*)",
            destination: `${normalizedApiUpstream}/auth/:path*`,
          },
          ...proxyPaths.filter((source) => !source.startsWith("/api/") && !source.startsWith("/auth/")).map((source) => ({
            source,
            destination: `${normalizedApiUpstream}${source}`,
          })),
        ]
      : proxyPaths.map((source) => ({
          source,
          destination: `${normalizedApiUpstream}${source}`,
        }));
    const adminRewrites = normalizedAdminFastifyTarget
      ? [{
          source: "/__admin-fastify/:path*",
          destination: `${normalizedAdminFastifyTarget}/:path*`,
        }]
      : [];
    const workflowRewrites = normalizedWorkflowFastifyTarget
      ? [{
          source: "/__workflow-fastify/:path*",
          destination: `${normalizedWorkflowFastifyTarget}/:path*`,
        }]
      : [];
    const federationAdminRewrites = normalizedFederationAdminFastifyTarget
      ? [{
          source: "/api/admin/federation/:path*",
          destination: `${normalizedFederationAdminFastifyTarget}/api/admin/federation/:path*`,
        }]
      : [];
    const authRewrites = normalizedAuthFastifyTarget
      ? [
          // Local session routes keep their established /auth/* backend
          // contract. Provider discovery and OIDC/SAML callbacks use the
          // public /api/auth/* namespace. The frontend client intentionally
          // uses the latter namespace in isolated mode, so split the rewrite
          // boundary explicitly instead of forwarding a non-existent
          // Fastify /api/auth/login route.
          {
            source: "/api/auth/:path((?!providers(?:/|$)|oidc(?:/|$)|saml(?:/|$)).*)",
            destination: `${normalizedAuthFastifyTarget}/auth/:path*`,
          },
          {
            source: "/auth/:path*",
            destination: `${normalizedAuthFastifyTarget}/auth/:path*`,
          },
          {
            source: "/api/auth/:path*",
            destination: `${normalizedAuthFastifyTarget}/api/auth/:path*`,
          },
        ]
      : [];
    return [...adminRewrites, ...workflowRewrites, ...federationAdminRewrites, ...authRewrites, ...apiRewrites];
  },
};

export default nextConfig;
