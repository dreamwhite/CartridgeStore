import type { ApiError } from "./contracts";
import { apiErrorSchema } from "./schemas";
import type { z } from "zod";
import { isDualOriginEnabled, resolvePublicApiUrl } from "./origin";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: ApiError | null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiResponseValidationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues: z.core.$ZodIssue[],
  ) {
    super(message);
    this.name = "ApiResponseValidationError";
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const response = await fetch(input, {
    ...init,
    credentials: init?.credentials ?? "same-origin",
    headers,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    const errorBody: ApiError | null = parsedError.success ? parsedError.data : null;
    throw new ApiRequestError(errorBody?.error ?? `Request failed with status ${response.status}`, response.status, errorBody);
  }
  if (!schema) {
    return body as T;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiResponseValidationError(
      `Invalid API response for ${typeof input === "string" ? input : input.toString()}`,
      response.status,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** Call the explicit browser-facing API origin when dual-origin mode is enabled. */
export function requestApiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  return requestJson(resolvePublicApiUrl(input), {
    ...init,
    credentials: init?.credentials ?? (isDualOriginEnabled() ? "include" : "same-origin"),
  }, schema);
}

/**
 * Use the existing Next.js compatibility rewrite for operational public APIs.
 *
 * Public catalog, score, metrics, and statistics routes remain Flask-owned
 * during migration. Keeping these requests same-origin avoids expanding the
 * browser CORS surface while preserving the original route and response.
 */
export function requestSameOriginJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  return requestJson(input, {
    ...init,
    credentials: init?.credentials ?? "same-origin",
  }, schema);
}

/** Add a domain-acquired CSRF token to a JSON/form mutation request. */
export function withCsrfToken(token: string, headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  result.set("X-CSRFToken", token);
  return result;
}
