import type { z } from "zod";

import { ApiRequestError, requestJson, withCsrfToken } from "../client";
import {
  adminResponseSchema,
  csrfResponseSchema,
} from "../schemas";

/** Browser-visible prefix for the isolated Fastify administrative surface. */
export const ADMIN_PROXY_PREFIX = "/__admin-fastify";

/** Signals that the optional isolated administrative backend is unavailable. */
export class AdminIntegrationUnavailableError extends Error {
  constructor() {
    super("The isolated Fastify administrative integration is not enabled.");
    this.name = "AdminIntegrationUnavailableError";
  }
}
let csrfToken: string | null = null;

/** Builds a validated path below the administrative proxy. */
export function adminPath(path: string): string {
  if (!path.startsWith("/") || path.includes("//") || path.includes("..")) {
    throw new Error("Invalid administrative API path");
  }
  return `${ADMIN_PROXY_PREFIX}${path}`;
}

function unavailable(error: unknown): never {
  if (
    error instanceof ApiRequestError &&
    error.body === null &&
    [404, 502, 503].includes(error.status)
  ) {
    throw new AdminIntegrationUnavailableError();
  }
  throw error;
}

/** Executes a validated administrative JSON request. */
export async function adminRequest<T>(
  path: string,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  try {
    return await requestJson(
      adminPath(path),
      init,
      schema ?? (adminResponseSchema as z.ZodType<T>),
    );
  } catch (error) {
    return unavailable(error);
  }
}

/** Returns the query string for optional administrative filters. */
export function adminQuery(
  params: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

/** Adds the cached administrative CSRF token to a request. */
export async function mutationHeaders(headers?: HeadersInit): Promise<Headers> {
  if (!csrfToken) {
    const result = await adminRequest(
      "/auth/csrf",
      undefined,
      csrfResponseSchema,
    );
    csrfToken = result.csrf_token;
  }
  return withCsrfToken(csrfToken, headers);
}

/** Creates JSON mutation headers with the current administrative CSRF token. */
export function jsonMutation(headers?: HeadersInit): Promise<Headers> {
  const merged = new Headers(headers);
  merged.set("content-type", "application/json");
  return mutationHeaders(merged);
}

/** Clears in-memory administrative session state after logout or restore. */
export function clearAdminSessionState(): void {
  csrfToken = null;
}

/** Executes an administrative binary request without decoding its body. */
export async function backupRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  try {
    const response = await fetch(adminPath(path), {
      ...init,
      credentials: "same-origin",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = new ApiRequestError(
        "Administrative backup request failed",
        response.status,
        body?.ok === false ? body : null,
      );
      return unavailable(error);
    }
    return response;
  } catch (error) {
    return unavailable(error);
  }
}
