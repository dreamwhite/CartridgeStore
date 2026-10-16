import { z } from "zod";

import { ApiRequestError, requestApiJson, withCsrfToken } from "./client";

const providerIdSchema = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/);
const nullableString = z.string().nullable();

export const federationCertificateSchema = z.object({
  fingerprint: z.string(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
}).passthrough();

export const federationProviderSchema = z.object({
  provider_id: providerIdSchema,
  protocol: z.enum(["oidc", "saml"]),
  display_name: z.string(),
  issuer: z.string(),
  enabled: z.boolean(),
  generation: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  client_id: nullableString,
  discovery_issuer: nullableString,
  redirect_uri: nullableString,
  scopes: z.array(z.string()),
  idp_entity_id: nullableString,
  sp_entity_id: nullableString,
  acs_url: nullableString,
  saml_entry_point: nullableString,
  saml_name_id_format: nullableString,
  saml_want_assertions_signed: z.boolean(),
  saml_want_authn_response_signed: z.boolean(),
  saml_sign_authn_requests: z.boolean(),
  saml_accepted_clock_skew_ms: z.number().int().nonnegative(),
  client_auth_method: z.enum(["client_secret_basic", "client_secret_post", "none"]),
  client_secret_configured: z.boolean(),
  configuration_complete: z.boolean(),
  pending_transactions: z.number().int().nonnegative(),
  certificates: z.array(federationCertificateSchema),
  trusted_certificate_count: z.number().int().nonnegative(),
  trusted_certificate_capacity: z.number().int().positive(),
}).passthrough();

export const federationProvidersResponseSchema = z.object({ ok: z.literal(true), providers: z.array(federationProviderSchema) }).passthrough();
export const federationProviderResponseSchema = z.object({ ok: z.literal(true), provider: federationProviderSchema }).passthrough();
export const federationReauthResponseSchema = z.object({ ok: z.literal(true), expires_in_seconds: z.number().int().positive() }).passthrough();
export const federationSafeStatusSchema = z.object({
  providerId: providerIdSchema,
  protocol: z.enum(["oidc", "saml"]),
  displayName: z.string(),
  enabled: z.boolean(),
  generation: z.number().int(),
  pendingTransactions: z.number().int().nonnegative(),
  samlCertificateFingerprints: z.array(z.string()),
  updatedAt: z.string(),
}).passthrough();
export const federationSafeStatusResponseSchema = z.object({ ok: z.literal(true), provider: federationSafeStatusSchema }).passthrough();
export const federationRevokeResponseSchema = z.object({ ok: z.literal(true), revoked: z.number().int().nonnegative(), status: federationSafeStatusSchema.optional() }).passthrough();

export const federationIdentitySchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  protocol: z.enum(["oidc", "saml"]),
  providerId: providerIdSchema,
  issuer: z.string(),
  subject: z.string(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  unlinkedAt: z.string().nullable(),
}).passthrough();
export const federationIdentitiesResponseSchema = z.object({ ok: z.literal(true), identities: z.array(federationIdentitySchema) }).passthrough();
export const federationIdentityResponseSchema = z.object({ ok: z.literal(true), identity: z.unknown() }).passthrough();

export type FederationProvider = z.infer<typeof federationProviderSchema>;
export type FederationIdentity = z.infer<typeof federationIdentitySchema>;
export type FederationProtocol = FederationProvider["protocol"];
export type FederationProviderInput = {
  provider_id: string;
  protocol: FederationProtocol;
  display_name: string;
  issuer: string;
  client_id?: string;
  client_auth_method?: FederationProvider["client_auth_method"];
  client_secret?: string;
  discovery_issuer?: string;
  redirect_uri?: string;
  scopes?: string[];
  idp_entity_id?: string;
  sp_entity_id?: string;
  acs_url?: string;
  saml_entry_point?: string;
  saml_name_id_format?: string;
  saml_idp_certificate_pem?: string;
  saml_trusted_certificates_pem?: string[];
  saml_want_assertions_signed?: boolean;
  saml_want_authn_response_signed?: boolean;
  saml_sign_authn_requests?: boolean;
  saml_accepted_clock_skew_ms?: number;
};

function federationPath(path: string): string {
  if (!path.startsWith("/api/admin/federation/") || path.includes("//") || path.includes("..")) throw new Error("Invalid federation administration API path");
  return path;
}

async function mutationHeaders(): Promise<Headers> {
  const csrf = await requestApiJson("/auth/csrf", undefined, z.object({ ok: z.literal(true), csrf_token: z.string().min(32) }));
  return withCsrfToken(csrf.csrf_token, { "content-type": "application/json" });
}

async function mutate<T>(path: string, method: "POST" | "PATCH", payload: unknown, schema: z.ZodType<T>): Promise<T> {
  const headers = await mutationHeaders();
  return requestApiJson(federationPath(path), { method, headers, body: JSON.stringify(payload) }, schema);
}

export const federationAdminApi = {
  listProviders: () => requestApiJson("/api/admin/federation/providers", undefined, federationProvidersResponseSchema),
  getProvider: (providerId: string) => requestApiJson(federationPath(`/api/admin/federation/providers/${encodeURIComponent(providerId)}`), undefined, federationProviderResponseSchema),
  getProviderStatus: (providerId: string) => requestApiJson(federationPath(`/api/admin/federation/providers/${encodeURIComponent(providerId)}/status`), undefined, federationProviderResponseSchema),
  reauthenticate: (password: string) => mutate("/api/admin/federation/reauthenticate", "POST", { password }, federationReauthResponseSchema),
  createProvider: (input: FederationProviderInput) => mutate("/api/admin/federation/providers", "POST", input, federationProviderResponseSchema),
  updateProvider: (providerId: string, input: Omit<FederationProviderInput, "provider_id" | "protocol" | "issuer">) => mutate(`/api/admin/federation/providers/${encodeURIComponent(providerId)}`, "PATCH", input, federationProviderResponseSchema),
  enableProvider: (providerId: string) => mutate(`/api/admin/federation/providers/${encodeURIComponent(providerId)}/enable`, "POST", {}, federationSafeStatusResponseSchema),
  disableProvider: (providerId: string) => mutate(`/api/admin/federation/providers/${encodeURIComponent(providerId)}/disable`, "POST", {}, federationSafeStatusResponseSchema),
  rotateSecret: (providerId: string, secret: string) => mutate(`/api/admin/federation/providers/${encodeURIComponent(providerId)}/rotate-secret`, "POST", { purpose: "oidc-client-secret", secret }, federationSafeStatusResponseSchema),
  updateCertificates: (providerId: string, certificates: string[]) => mutate(`/api/admin/federation/providers/${encodeURIComponent(providerId)}/certificates`, "POST", { certificates }, federationSafeStatusResponseSchema),
  revokeTransactions: (providerId: string) => mutate(`/api/admin/federation/providers/${encodeURIComponent(providerId)}/transactions/revoke`, "POST", {}, federationRevokeResponseSchema),
  listIdentities: () => requestApiJson("/api/admin/federation/identities", undefined, federationIdentitiesResponseSchema),
  linkIdentity: (input: { protocol: FederationProtocol; provider_id: string; issuer: string; subject: string; user_id: number }) => mutate("/api/admin/federation/identities", "POST", input, federationIdentityResponseSchema),
  retireIdentity: (identityId: number) => mutate(`/api/admin/federation/identities/${encodeURIComponent(identityId)}/retire`, "POST", {}, z.object({ ok: z.literal(true) })),
};

export function federationErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const code = error.body?.code;
    const known: Record<string, string> = {
      auth_required: "Your session has expired. Sign in again.",
      permission_denied: "Your account does not have permission for this area.",
      csrf_failed: "The security token expired. Refresh the page and try again.",
      recent_reauthentication_required: "Local administrator reauthentication is required.",
      reauthentication_failed: "The local administrator password is incorrect.",
      rate_limited: "Too many attempts. Wait before trying again.",
      federation_provider_conflict: "That provider ID is already in use.",
      federation_identity_conflict: "That external identity is already linked.",
      federation_identity_retired: "That external identity was retired and cannot be reused.",
      federation_user_unknown: "The local user does not exist.",
      federation_account_disabled: "The selected local account is disabled.",
      federation_last_auth_method: "The identity cannot be retired because it is the last usable login method.",
      federation_provider_invalid: "The provider configuration was rejected. Check the highlighted values.",
    };
    return (code && known[code]) || error.body?.error || "The federation administration operation was rejected.";
  }
  if (error instanceof TypeError) return "The federation administration service could not be reached.";
  if (error instanceof Error) return error.message;
  return "The federation administration operation failed.";
}
