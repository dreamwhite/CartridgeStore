import type { NextConfig } from "next";

const configuredFlaskTarget = process.env.FLASK_PROXY_TARGET?.trim();
const configuredAdminFastifyTarget = process.env.PRG32_ADMIN_FASTIFY_TARGET?.trim();
const isProductionBuild = process.env.NODE_ENV === "production";

if (isProductionBuild && !configuredFlaskTarget) {
  throw new Error(
    "FLASK_PROXY_TARGET is required for production builds; set it to the reachable Flask service URL.",
  );
}

if (isProductionBuild && configuredAdminFastifyTarget) {
  throw new Error(
    "PRG32_ADMIN_FASTIFY_TARGET is development/test-only and must not be configured for production builds.",
  );
}

const flaskTarget = configuredFlaskTarget || "http://127.0.0.1:5080";
const parsedFlaskTarget = new URL(flaskTarget);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

if (parsedFlaskTarget.protocol !== "http:" && parsedFlaskTarget.protocol !== "https:") {
  throw new Error("FLASK_PROXY_TARGET must use http:// or https://.");
}

if (isProductionBuild && loopbackHosts.has(parsedFlaskTarget.hostname)) {
  throw new Error(
    "FLASK_PROXY_TARGET cannot point to loopback in a production build; use the deployed Flask service hostname.",
  );
}

const normalizedFlaskTarget = flaskTarget.replace(/\/$/, "");

if (configuredAdminFastifyTarget) {
  const parsedAdminTarget = new URL(configuredAdminFastifyTarget);
  if (parsedAdminTarget.protocol !== "http:" && parsedAdminTarget.protocol !== "https:") {
    throw new Error("PRG32_ADMIN_FASTIFY_TARGET must use http:// or https://.");
  }
  if (parsedAdminTarget.username || parsedAdminTarget.password) {
    throw new Error("PRG32_ADMIN_FASTIFY_TARGET must not contain credentials.");
  }
}

const normalizedAdminFastifyTarget = configuredAdminFastifyTarget?.replace(/\/$/, "");

const proxyPaths = [
  "/api/:path*",
  "/auth/:path*",
  "/admin/:path*",
  "/editor/:path*",
  "/users/:path*",
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
  output: "standalone",
  async rewrites() {
    const flaskRewrites = proxyPaths.map((source) => ({
      source,
      destination: `${normalizedFlaskTarget}${source}`,
    }));
    const adminRewrites = normalizedAdminFastifyTarget
      ? [{
          source: "/__admin-fastify/:path*",
          destination: `${normalizedAdminFastifyTarget}/:path*`,
        }]
      : [];
    return [...adminRewrites, ...flaskRewrites];
  },
};

export default nextConfig;
