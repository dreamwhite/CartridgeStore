const target = process.env.PRG32_API_UPSTREAM?.trim();

if (!target) {
  throw new Error("PRG32_API_UPSTREAM is required for the candidate Next.js runtime");
}

const parsedTarget = new URL(target);
if (!["http:", "https:"].includes(parsedTarget.protocol) || parsedTarget.username || parsedTarget.password || parsedTarget.search || parsedTarget.hash) {
  throw new Error("PRG32_API_UPSTREAM must be an HTTP(S) URL without credentials or query parameters");
}

const normalizedTarget = target.replace(/\/$/, "");

/** Candidate-only Next.js configuration. The operational next.config.ts is unchanged. */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_PRG32_CANDIDATE_AUTH_PROXY: "true",
  },
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      { source: "/api/auth/:path((?!providers(?:/|$)|oidc(?:/|$)|saml(?:/|$)).*)", destination: `${normalizedTarget}/auth/:path*` },
      { source: "/api/:path*", destination: `${normalizedTarget}/api/:path*` },
      { source: "/__workflow-fastify/:path*", destination: `${normalizedTarget}/:path*` },
      { source: "/auth/:path*", destination: `${normalizedTarget}/auth/:path*` },
      { source: "/ready", destination: `${normalizedTarget}/ready` },
      { source: "/.well-known/:path*", destination: `${normalizedTarget}/.well-known/:path*` },
    ];
  },
};

export default nextConfig;
