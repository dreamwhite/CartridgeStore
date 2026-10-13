import { ApiRequestError, requestApiJson, withCsrfToken } from "./client";
import { publicApiPath } from "./origin";
import type { AuthLogoutResponse, AuthProvider, AuthProvidersResponse, AuthUserResponse } from "./contracts";
import {
  authLogoutResponseSchema,
  authProvidersResponseSchema,
  authUserResponseSchema,
  csrfResponseSchema,
} from "./schemas";
import { safeReturnPath } from "../auth/return-path";

export const CURRENT_USER_QUERY_KEY = ["auth", "current-user"] as const;

function authPath(path: string): string {
  if (!path.startsWith("/") || path.includes("//") || path.includes("..")) {
    throw new Error("Invalid authentication API path");
  }
  return path;
}

export function getAuthProviders(): Promise<AuthProvidersResponse> {
  return requestApiJson(authPath("/api/auth/providers"), undefined, authProvidersResponseSchema);
}

export function getAuthCsrf(): Promise<{ ok: true; csrf_token: string }> {
  return requestApiJson(authPath("/auth/csrf"), undefined, csrfResponseSchema);
}

export function getCurrentUser(): Promise<AuthUserResponse> {
  return requestApiJson(authPath("/auth/me"), undefined, authUserResponseSchema);
}

export async function loginWithPassword(username: string, password: string): Promise<AuthUserResponse> {
  const csrf = await getAuthCsrf();
  return requestApiJson(
    authPath("/auth/login"),
    {
      method: "POST",
      headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }),
      body: JSON.stringify({ username, password }),
    },
    authUserResponseSchema,
  );
}

export async function logoutLocal(): Promise<AuthLogoutResponse> {
  const csrf = await getAuthCsrf();
  return requestApiJson(
    authPath("/auth/logout"),
    {
      method: "POST",
      headers: withCsrfToken(csrf.csrf_token),
    },
    authLogoutResponseSchema,
  );
}

export function federatedLoginUrl(provider: AuthProvider, returnTo: string | null | undefined): string {
  const safePath = safeReturnPath(returnTo);
  const protocolPath = provider.protocol === "oidc" ? "oidc" : "saml";
  return `${publicApiPath(authPath(`/api/auth/${protocolPath}/${encodeURIComponent(provider.provider_id)}/login`))}?return_to=${encodeURIComponent(safePath)}`;
}

export function authErrorMessage(error: unknown, operation: "login" | "logout" | "session" | "providers" = "session"): string {
  if (error instanceof ApiRequestError) {
    if (operation === "login" && error.status === 401) return "Username or password is incorrect.";
    if (error.status === 403 && error.body?.code === "auth_account_disabled") return "This account is disabled.";
    if (error.status === 403 && error.body?.code === "csrf_failed") return "Your session expired. Refresh and try again.";
    if (error.status === 401 && operation === "session") return "Your session has expired.";
    if (error.status === 503) return "The authentication service is temporarily unavailable.";
    if (operation === "providers") return "Federated login options are temporarily unavailable.";
    if (operation === "logout" && error.status === 401) return "Your session was already expired.";
  }
  if (error instanceof TypeError) return "The authentication service could not be reached.";
  if (operation === "providers") return "Federated login options are unavailable.";
  return operation === "login" ? "Sign-in could not be completed. Try again." : "Authentication could not be completed. Try again.";
}
