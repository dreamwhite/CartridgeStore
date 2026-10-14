import { ApiRequestError, requestApiJson, withCsrfToken } from "./client";
import { publicApiPath } from "./origin";
import type { AuthLogoutResponse, AuthOperationResponse, AuthProvider, AuthProvidersResponse, AuthUserResponse } from "./contracts";
import {
  authTokenCreatedResponseSchema,
  authTokenUpdatedResponseSchema,
  authTokensResponseSchema,
  authLogoutResponseSchema,
  authOperationResponseSchema,
  authProvidersResponseSchema,
  authUserResponseSchema,
  csrfResponseSchema,
  registrationRequestedResponseSchema,
  passkeyOptionsResponseSchema,
  passkeyMutationResponseSchema,
  passkeysResponseSchema,
} from "./schemas";
import { safeReturnPath } from "../auth/return-path";

export const CURRENT_USER_QUERY_KEY = ["auth", "current-user"] as const;

function authPath(path: string): string {
  if (!path.startsWith("/") || path.includes("//") || path.includes("..")) {
    throw new Error("Invalid authentication API path");
  }
  // The isolated runtime has Next.js compatibility pages at /auth/login and
  // /auth/register. Route browser API calls through the unambiguous
  // /api/auth namespace whenever the Fastify auth integration is enabled.
  if ((process.env.NEXT_PUBLIC_PRG32_CANDIDATE_AUTH_PROXY === "true" || process.env.NEXT_PUBLIC_AUTH_INTEGRATION_ENABLED === "true") && path.startsWith("/auth/")) {
    return `/api/auth${path.slice("/auth".length)}`;
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

export function getAuthTokens() {
  return requestApiJson(authPath("/auth/tokens"), undefined, authTokensResponseSchema);
}

export async function createAuthToken(label: string) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/tokens"), {
    method: "POST",
    headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }),
    body: JSON.stringify({ label }),
  }, authTokenCreatedResponseSchema);
}

export async function updateAuthToken(id: number, label: string) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath(`/auth/tokens/${encodeURIComponent(String(id))}`), {
    method: "PATCH",
    headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }),
    body: JSON.stringify({ label }),
  }, authTokenUpdatedResponseSchema);
}

export async function revokeAuthToken(id: number) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath(`/auth/tokens/${encodeURIComponent(String(id))}`), {
    method: "DELETE",
    headers: withCsrfToken(csrf.csrf_token),
  }, authLogoutResponseSchema);
}

export async function requestRegistration(username: string, email: string, password: string, passwordConfirm: string) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/register"), {
    method: "POST",
    headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }),
    body: JSON.stringify({ username, email, password, password_confirm: passwordConfirm }),
  }, registrationRequestedResponseSchema);
}

export async function completeRegistration(token: string, password = "", passwordConfirm = "") {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/register/complete"), {
    method: "POST",
    headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }),
    body: JSON.stringify({ token, ...(password ? { password, password_confirm: passwordConfirm } : {}) }),
  }, authUserResponseSchema);
}

export async function changePassword(currentPassword: string, password: string, passwordConfirm: string): Promise<AuthOperationResponse> {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/password/change"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ current_password: currentPassword, password, password_confirm: passwordConfirm }) }, authOperationResponseSchema);
}

export async function reauthenticate(password: string): Promise<AuthOperationResponse> {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/reauthenticate"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ password }) }, authOperationResponseSchema);
}

export function getPasskeys() {
  return requestApiJson(authPath("/auth/passkeys"), undefined, passkeysResponseSchema);
}

export async function beginPasskeyRegistration() {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/passkeys/register/options"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: "{}" }, passkeyOptionsResponseSchema);
}

export async function finishPasskeyRegistration(response: unknown, displayName: string) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/passkeys/register"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ response, display_name: displayName }) }, passkeyMutationResponseSchema);
}

export async function beginPasskeyLogin(username = "") {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/passkeys/login/options"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify(username.trim() ? { username: username.trim() } : {}) }, passkeyOptionsResponseSchema);
}

export async function finishPasskeyLogin(response: unknown) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/passkeys/login"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ response }) }, authUserResponseSchema);
}

export async function renamePasskey(id: string, displayName: string) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath(`/auth/passkeys/${encodeURIComponent(id)}`), { method: "PATCH", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ display_name: displayName }) }, passkeyMutationResponseSchema);
}

export async function revokePasskey(id: string) {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath(`/auth/passkeys/${encodeURIComponent(id)}`), { method: "DELETE", headers: withCsrfToken(csrf.csrf_token) }, passkeyMutationResponseSchema);
}

export async function requestPasswordReset(identifier: string): Promise<AuthOperationResponse> {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/password/reset/request"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ identifier }) }, authOperationResponseSchema);
}

export async function completePasswordReset(token: string, password: string, passwordConfirm: string): Promise<AuthOperationResponse> {
  const csrf = await getAuthCsrf();
  return requestApiJson(authPath("/auth/password/reset/complete"), { method: "POST", headers: withCsrfToken(csrf.csrf_token, { "content-type": "application/json" }), body: JSON.stringify({ token, password, password_confirm: passwordConfirm }) }, authOperationResponseSchema);
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
