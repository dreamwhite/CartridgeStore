import { requestApiJson } from "../client";
import { csrfResponseSchema } from "../schemas";

/** Builds a validated path for the authentication API. */
export function authPath(path: string): string {
  if (!path.startsWith("/") || path.includes("//") || path.includes("..")) {
    throw new Error("Invalid authentication API path");
  }

  // The isolated runtime has Next.js compatibility pages at /auth/login and
  // /auth/register. Route browser API calls through the unambiguous
  // /api/auth namespace whenever the Fastify auth integration is enabled.
  if (
    (process.env.NEXT_PUBLIC_PRG32_CANDIDATE_AUTH_PROXY === "true" ||
      process.env.NEXT_PUBLIC_AUTH_INTEGRATION_ENABLED === "true") &&
    path.startsWith("/auth/")
  ) {
    return `/api/auth${path.slice("/auth".length)}`;
  }

  return path;
}

/** Reads the CSRF token required by authentication mutations. */
export function getAuthCsrf(): Promise<{
  ok: true;
  csrf_token: string;
}> {
  return requestApiJson(
    authPath("/auth/csrf"),
    undefined,
    csrfResponseSchema,
  );
}
