export const DEFAULT_API_UPSTREAM = "http://fastify:5090";

export type ApiUpstreamSource = "default-fastify" | "configured" | "legacy-flask";

export interface ApiUpstreamResolution {
  readonly target: string;
  readonly source: ApiUpstreamSource;
}

type ProxyEnvironment = Readonly<Record<string, string | undefined>>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function validateTarget(name: string, value: string, production: boolean, legacyFlask: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use http:// or https://.`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not contain credentials, query parameters, or fragments.`);
  }
  if (production && legacyFlask && LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error("FLASK_PROXY_TARGET cannot point to loopback in a production build; use the deployed Flask service hostname.");
  }

  return value.replace(/\/$/, "");
}

/**
 * Resolve the server-side Next.js rewrite target.
 *
 * PRG32_API_UPSTREAM is the backend-neutral contract. FLASK_PROXY_TARGET is
 * intentionally retained only as an explicit migration escape hatch so the
 * current Flask development/deployment path keeps working without becoming a
 * default or an implicit fallback.
 */
export function resolveApiUpstream(
  environment: ProxyEnvironment,
  options: { readonly production?: boolean } = {},
): ApiUpstreamResolution {
  const production = options.production ?? false;
  const configuredUpstream = optionalValue(environment.PRG32_API_UPSTREAM);
  const legacyFlaskTarget = optionalValue(environment.FLASK_PROXY_TARGET);

  if (configuredUpstream && legacyFlaskTarget) {
    throw new Error("Configure only one of PRG32_API_UPSTREAM or the legacy FLASK_PROXY_TARGET.");
  }
  if (configuredUpstream) {
    return {
      target: validateTarget("PRG32_API_UPSTREAM", configuredUpstream, production, false),
      source: "configured",
    };
  }
  if (legacyFlaskTarget) {
    return {
      target: validateTarget("FLASK_PROXY_TARGET", legacyFlaskTarget, production, true),
      source: "legacy-flask",
    };
  }

  return { target: DEFAULT_API_UPSTREAM, source: "default-fastify" };
}
