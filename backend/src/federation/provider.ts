import crypto from "node:crypto";
import type Database from "better-sqlite3";

import type { AdminAuditLog } from "../admin/audit.js";
import {
  type FederationProtocol,
  type FederationProviderConfig,
  type OidcClientAuthMethod,
  type ProviderInput,
  type ProviderMutationContext,
} from "./provider-contracts.js";

export type {
  FederationProtocol,
  FederationProviderConfig,
  FederationSecretPurpose,
  OidcClientAuthMethod,
  ProviderInput,
  ProviderMutationContext,
} from "./provider-contracts.js";

const PROVIDER_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const REFERENCE_RE = /^federated-provider:[a-z][a-z0-9._-]{0,63}:(oidc-client-secret|saml-sp-signing-private-key|saml-sp-decryption-private-key)$/;
const MAX_SAML_TRUSTED_CERTIFICATES = 2;

export class FederationProviderError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = "FederationProviderError";
  }
}

function text(value: unknown, label: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new FederationProviderError("federation_provider_invalid", 400, label + " is required");
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new FederationProviderError("federation_provider_invalid", 400, label + " is invalid");
  }
  return value.trim();
}

function providerId(value: unknown): string {
  const normalized = text(value, "provider_id", 64, true) as string;
  if (!PROVIDER_ID_RE.test(normalized)) throw new FederationProviderError("federation_provider_invalid", 400, "provider_id is invalid");
  return normalized;
}

function protocol(value: unknown): FederationProtocol {
  if (value !== "oidc" && value !== "saml") throw new FederationProviderError("federation_provider_invalid", 400, "protocol is invalid");
  return value;
}

function clientAuthMethod(value: unknown): OidcClientAuthMethod {
  if (value === undefined || value === null) return "client_secret_basic";
  if (value !== "client_secret_basic" && value !== "client_secret_post" && value !== "none") {
    throw new FederationProviderError("federation_provider_invalid", 400, "client_auth_method is invalid");
  }
  return value;
}

function url(value: unknown, label: string, allowHttp: boolean, max = 512): string | null {
  const normalized = text(value, label, max);
  if (normalized === null) return null;
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new FederationProviderError("federation_provider_invalid", 400, label + " is invalid"); }
  if ((!allowHttp && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.hash) {
    throw new FederationProviderError("federation_provider_invalid", 400, label + " must be an HTTPS URL without credentials or fragments");
  }
  return parsed.toString();
}

function reference(value: unknown, label: string, expectedProvider: string): string | null {
  const normalized = text(value, label, 240);
  if (normalized === null) return null;
  if (!REFERENCE_RE.test(normalized) || !normalized.startsWith("federated-provider:" + expectedProvider + ":")) {
    throw new FederationProviderError("federation_provider_invalid", 400, label + " is not a valid provider-scoped reference");
  }
  return normalized;
}

function scopes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 16) throw new FederationProviderError("federation_provider_invalid", 400, "scopes is invalid");
  const result = value.map((item) => text(item, "scope", 64, true) as string);
  if (new Set(result).size !== result.length) throw new FederationProviderError("federation_provider_invalid", 400, "scopes contains duplicates");
  return result;
}

function booleanOption(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new FederationProviderError("federation_provider_invalid", 400, label + " is invalid");
  return value;
}

function samlCertificate(value: unknown): string | null {
  const normalized = text(value, "saml_idp_certificate_pem", 65536);
  if (normalized === null) return null;
  if (!normalized.includes("BEGIN CERTIFICATE") && !normalized.includes("BEGIN PUBLIC KEY")) {
    throw new FederationProviderError("federation_provider_invalid", 400, "saml_idp_certificate_pem is invalid");
  }
  try {
    if (normalized.includes("BEGIN CERTIFICATE")) new crypto.X509Certificate(normalized);
    else crypto.createPublicKey(normalized);
  } catch {
    throw new FederationProviderError("federation_provider_invalid", 400, "saml_idp_certificate_pem is invalid");
  }
  return normalized;
}

function certificateFingerprint(value: string): string {
  return crypto.createHash("sha256").update(value.replace(/\r\n/g, "\n").trim(), "utf8").digest("hex");
}

function samlTrustedCertificates(value: unknown, legacy: string | null): string[] {
  if (value === undefined || value === null) return legacy === null ? [] : [legacy];
  if (!Array.isArray(value) || value.length > MAX_SAML_TRUSTED_CERTIFICATES) {
    throw new FederationProviderError("federation_provider_invalid", 400, "saml_trusted_certificates_pem is invalid");
  }
  const result = value.map((item) => samlCertificate(item));
  if (result.some((item): item is null => item === null)) throw new FederationProviderError("federation_provider_invalid", 400, "saml_trusted_certificates_pem is invalid");
  const certificates = result.filter((item): item is string => item !== null);
  if (new Set(certificates.map(certificateFingerprint)).size !== certificates.length) {
    throw new FederationProviderError("federation_provider_invalid", 400, "saml_trusted_certificates_pem contains duplicates");
  }
  return certificates;
}

function samlNameIdFormat(value: unknown): string | null {
  const normalized = text(value, "saml_name_id_format", 160);
  if (normalized === null) return null;
  if (normalized !== "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent") {
    throw new FederationProviderError("federation_provider_invalid", 400, "saml_name_id_format must be persistent");
  }
  return normalized;
}

function samlClockSkew(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 300000) {
    throw new FederationProviderError("federation_provider_invalid", 400, "saml_accepted_clock_skew_ms is invalid");
  }
  return value;
}

function rowToConfig(row: Record<string, unknown>): FederationProviderConfig {
  const parsedScopes = typeof row.scopes_json === "string" ? JSON.parse(row.scopes_json) as unknown : [];
  let parsedTrusted: unknown = null;
  if (typeof row.saml_trusted_certificates_json === "string") {
    try { parsedTrusted = JSON.parse(row.saml_trusted_certificates_json) as unknown; } catch { parsedTrusted = null; }
  }
  const legacyCertificate = typeof row.saml_idp_certificate_pem === "string" ? row.saml_idp_certificate_pem : null;
  const trustedCertificates = Array.isArray(parsedTrusted)
    ? parsedTrusted.filter((item): item is string => typeof item === "string")
    : legacyCertificate === null ? [] : [legacyCertificate];
  return {
    providerId: String(row.provider_id),
    protocol: row.protocol as FederationProtocol,
    displayName: String(row.display_name),
    issuer: String(row.issuer),
    enabled: Number(row.enabled) === 1,
    clientId: typeof row.client_id === "string" ? row.client_id : null,
    clientAuthMethod: clientAuthMethod(row.client_auth_method),
    discoveryIssuer: typeof row.discovery_issuer === "string" ? row.discovery_issuer : null,
    redirectUri: typeof row.redirect_uri === "string" ? row.redirect_uri : null,
    scopes: Array.isArray(parsedScopes) ? parsedScopes.filter((item): item is string => typeof item === "string") : [],
    clientSecretReference: typeof row.client_secret_reference === "string" ? row.client_secret_reference : null,
    idpEntityId: typeof row.idp_entity_id === "string" ? row.idp_entity_id : null,
    spEntityId: typeof row.sp_entity_id === "string" ? row.sp_entity_id : null,
    acsUrl: typeof row.acs_url === "string" ? row.acs_url : null,
    metadataReference: typeof row.metadata_reference === "string" ? row.metadata_reference : null,
    trustedCertificateReference: typeof row.trusted_certificate_reference === "string" ? row.trusted_certificate_reference : null,
    signingKeyReference: typeof row.signing_key_reference === "string" ? row.signing_key_reference : null,
    samlEntryPoint: typeof row.saml_entry_point === "string" ? row.saml_entry_point : null,
    samlNameIdFormat: typeof row.saml_name_id_format === "string" ? row.saml_name_id_format : null,
    samlIdpCertificatePem: legacyCertificate,
    samlTrustedCertificatesPem: trustedCertificates,
    samlSpCertificatePem: typeof row.saml_sp_certificate_pem === "string" ? row.saml_sp_certificate_pem : null,
    samlWantAssertionsSigned: Number(row.saml_want_assertions_signed) === 1,
    samlWantAuthnResponseSigned: Number(row.saml_want_authn_response_signed) === 1,
    samlSignAuthnRequests: Number(row.saml_sign_authn_requests) === 1,
    samlAcceptedClockSkewMs: Number(row.saml_accepted_clock_skew_ms ?? 0),
    samlMetadataLifecyclePolicy: "manual",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    generation: Math.max(1, Number(row.generation ?? 1))
  };
}

export class FederationProviderService {
  constructor(
    private readonly database: Database.Database,
    private readonly audit?: AdminAuditLog
  ) {}

  create(input: ProviderInput, context?: ProviderMutationContext, allowHttp = false): FederationProviderConfig {
    const normalized = this.normalizeForProvisioning(input, allowHttp);
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.insertNormalized(normalized);
      this.database.exec("COMMIT");
      this.auditMutation(context, "federation.provider.created", normalized.providerId);
      return this.get(normalized.providerId);
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      if (this.isConstraint(error)) throw new FederationProviderError("federation_provider_conflict", 409, "provider identity already exists");
      throw error;
    }
  }

  normalizeForProvisioning(input: ProviderInput, allowHttp = false): FederationProviderConfig {
    return this.normalize(input, allowHttp);
  }

  provisionMany(inputs: readonly ProviderInput[], allowHttp = false): { readonly providers: readonly FederationProviderConfig[]; readonly alreadyPresent: readonly string[] } {
    const normalized = inputs.map((input) => this.normalizeForProvisioning(input, allowHttp));
    const providerIds = new Set<string>();
    const issuerKeys = new Set<string>();
    for (const provider of normalized) {
      if (providerIds.has(provider.providerId)) throw new FederationProviderError("federation_provider_duplicate", 409, "provider document contains duplicate provider ids");
      providerIds.add(provider.providerId);
      const issuerKey = `${provider.protocol}\u0000${provider.issuer}`;
      if (issuerKeys.has(issuerKey)) throw new FederationProviderError("federation_provider_duplicate", 409, "provider document contains duplicate provider identities");
      issuerKeys.add(issuerKey);
      if (provider.protocol === "oidc" && provider.clientAuthMethod !== "none" && !provider.clientSecretReference) {
        throw new FederationProviderError("federation_provider_secret_reference_required", 400, "OIDC client secret reference is required");
      }
      if (provider.protocol === "saml" && provider.samlSignAuthnRequests && !provider.signingKeyReference) {
        throw new FederationProviderError("federation_provider_secret_reference_required", 400, "SAML signing key reference is required");
      }
    }
    const alreadyPresent: string[] = [];
    try {
      this.database.exec("BEGIN IMMEDIATE");
      for (const provider of normalized) {
        const row = this.database.prepare("SELECT * FROM federation_providers WHERE provider_id = ?").get(provider.providerId) as Record<string, unknown> | undefined;
        if (row) {
          const existing = rowToConfig(row);
          if (!sameProvisionedProvider(existing, provider)) throw new FederationProviderError("federation_provider_conflict", 409, "existing provider does not match the explicit provisioning document");
          alreadyPresent.push(provider.providerId);
          continue;
        }
        const conflicting = this.database.prepare("SELECT provider_id FROM federation_providers WHERE protocol = ? AND issuer = ?").get(provider.protocol, provider.issuer) as { provider_id?: string } | undefined;
        if (conflicting?.provider_id) throw new FederationProviderError("federation_provider_conflict", 409, "provider issuer or entity identity is already assigned");
        this.insertNormalized(provider);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      if (error instanceof FederationProviderError) throw error;
      if (this.isConstraint(error)) throw new FederationProviderError("federation_provider_conflict", 409, "provider identity already exists");
      throw error;
    }
    return { providers: normalized.map((provider) => this.get(provider.providerId)), alreadyPresent };
  }

  update(providerIdValue: string, changes: Partial<Omit<ProviderInput, "providerId" | "protocol" | "issuer">>, context?: ProviderMutationContext, allowHttp = false): FederationProviderConfig {
    const current = this.get(providerIdValue);
    const input: ProviderInput = {
      providerId: current.providerId,
      protocol: current.protocol,
      displayName: changes.displayName ?? current.displayName,
      issuer: current.issuer,
      clientAuthMethod: changes.clientAuthMethod ?? current.clientAuthMethod,
      ...(changes.clientId === undefined ? (current.clientId === null ? {} : { clientId: current.clientId }) : { clientId: changes.clientId }),
      ...(changes.discoveryIssuer === undefined ? (current.discoveryIssuer === null ? {} : { discoveryIssuer: current.discoveryIssuer }) : { discoveryIssuer: changes.discoveryIssuer }),
      ...(changes.redirectUri === undefined ? (current.redirectUri === null ? {} : { redirectUri: current.redirectUri }) : { redirectUri: changes.redirectUri }),
      scopes: changes.scopes ?? current.scopes,
      ...(changes.clientSecretReference === undefined ? (current.clientSecretReference === null ? {} : { clientSecretReference: current.clientSecretReference }) : { clientSecretReference: changes.clientSecretReference }),
      ...(changes.idpEntityId === undefined ? (current.idpEntityId === null ? {} : { idpEntityId: current.idpEntityId }) : { idpEntityId: changes.idpEntityId }),
      ...(changes.spEntityId === undefined ? (current.spEntityId === null ? {} : { spEntityId: current.spEntityId }) : { spEntityId: changes.spEntityId }),
      ...(changes.acsUrl === undefined ? (current.acsUrl === null ? {} : { acsUrl: current.acsUrl }) : { acsUrl: changes.acsUrl }),
      ...(changes.metadataReference === undefined ? (current.metadataReference === null ? {} : { metadataReference: current.metadataReference }) : { metadataReference: changes.metadataReference }),
      ...(changes.trustedCertificateReference === undefined ? (current.trustedCertificateReference === null ? {} : { trustedCertificateReference: current.trustedCertificateReference }) : { trustedCertificateReference: changes.trustedCertificateReference }),
      ...(changes.signingKeyReference === undefined ? (current.signingKeyReference === null ? {} : { signingKeyReference: current.signingKeyReference }) : { signingKeyReference: changes.signingKeyReference }),
      ...(changes.samlEntryPoint === undefined ? (current.samlEntryPoint === null ? {} : { samlEntryPoint: current.samlEntryPoint }) : { samlEntryPoint: changes.samlEntryPoint }),
      ...(changes.samlNameIdFormat === undefined ? (current.samlNameIdFormat === null ? {} : { samlNameIdFormat: current.samlNameIdFormat }) : { samlNameIdFormat: changes.samlNameIdFormat }),
      ...(changes.samlIdpCertificatePem === undefined ? (current.samlIdpCertificatePem === null ? {} : { samlIdpCertificatePem: current.samlIdpCertificatePem }) : { samlIdpCertificatePem: changes.samlIdpCertificatePem }),
      samlTrustedCertificatesPem: changes.samlTrustedCertificatesPem ?? current.samlTrustedCertificatesPem,
      ...(changes.samlSpCertificatePem === undefined ? (current.samlSpCertificatePem === null ? {} : { samlSpCertificatePem: current.samlSpCertificatePem }) : { samlSpCertificatePem: changes.samlSpCertificatePem }),
      samlWantAssertionsSigned: changes.samlWantAssertionsSigned ?? current.samlWantAssertionsSigned,
      samlWantAuthnResponseSigned: changes.samlWantAuthnResponseSigned ?? current.samlWantAuthnResponseSigned,
      samlSignAuthnRequests: changes.samlSignAuthnRequests ?? current.samlSignAuthnRequests,
      samlAcceptedClockSkewMs: changes.samlAcceptedClockSkewMs ?? current.samlAcceptedClockSkewMs,
      samlMetadataLifecyclePolicy: changes.samlMetadataLifecyclePolicy ?? current.samlMetadataLifecyclePolicy
    };
    const normalized = this.normalizeForProvisioning(input, allowHttp);
    const securityChanged = current.clientId !== normalized.clientId
      || current.clientAuthMethod !== normalized.clientAuthMethod
      || current.discoveryIssuer !== normalized.discoveryIssuer
      || current.redirectUri !== normalized.redirectUri
      || JSON.stringify(current.scopes) !== JSON.stringify(normalized.scopes)
      || current.clientSecretReference !== normalized.clientSecretReference
      || current.idpEntityId !== normalized.idpEntityId
      || current.spEntityId !== normalized.spEntityId
      || current.acsUrl !== normalized.acsUrl
      || current.metadataReference !== normalized.metadataReference
      || current.trustedCertificateReference !== normalized.trustedCertificateReference
      || current.signingKeyReference !== normalized.signingKeyReference
      || current.samlEntryPoint !== normalized.samlEntryPoint
      || current.samlNameIdFormat !== normalized.samlNameIdFormat
      || JSON.stringify(current.samlTrustedCertificatesPem) !== JSON.stringify(normalized.samlTrustedCertificatesPem)
      || current.samlSpCertificatePem !== normalized.samlSpCertificatePem
      || current.samlWantAssertionsSigned !== normalized.samlWantAssertionsSigned
      || current.samlWantAuthnResponseSigned !== normalized.samlWantAuthnResponseSigned
      || current.samlSignAuthnRequests !== normalized.samlSignAuthnRequests
      || current.samlAcceptedClockSkewMs !== normalized.samlAcceptedClockSkewMs;
    try {
      this.database.exec("BEGIN IMMEDIATE");
      this.database.prepare(
        "UPDATE federation_providers SET display_name = ?, client_id = ?, client_auth_method = ?, discovery_issuer = ?, redirect_uri = ?, scopes_json = ?, client_secret_reference = ?, idp_entity_id = ?, sp_entity_id = ?, acs_url = ?, metadata_reference = ?, trusted_certificate_reference = ?, signing_key_reference = ?, saml_entry_point = ?, saml_name_id_format = ?, saml_idp_certificate_pem = ?, saml_trusted_certificates_json = ?, saml_sp_certificate_pem = ?, saml_want_assertions_signed = ?, saml_want_authn_response_signed = ?, saml_sign_authn_requests = ?, saml_accepted_clock_skew_ms = ?, saml_metadata_lifecycle_policy = ?, generation = generation + ?, updated_at = datetime('now') WHERE provider_id = ?"
      ).run(
        normalized.displayName, normalized.clientId, normalized.clientAuthMethod, normalized.discoveryIssuer, normalized.redirectUri, JSON.stringify(normalized.scopes),
        normalized.clientSecretReference, normalized.idpEntityId, normalized.spEntityId, normalized.acsUrl,
        normalized.metadataReference, normalized.trustedCertificateReference, normalized.signingKeyReference,
        normalized.samlEntryPoint, normalized.samlNameIdFormat, normalized.samlIdpCertificatePem, JSON.stringify(normalized.samlTrustedCertificatesPem), normalized.samlSpCertificatePem,
        normalized.samlWantAssertionsSigned ? 1 : 0, normalized.samlWantAuthnResponseSigned ? 1 : 0,
        normalized.samlSignAuthnRequests ? 1 : 0, normalized.samlAcceptedClockSkewMs, normalized.samlMetadataLifecyclePolicy,
        securityChanged ? 1 : 0, normalized.providerId
      );
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    this.auditMutation(context, "federation.provider.updated", normalized.providerId);
    return this.get(normalized.providerId);
  }

  setEnabled(providerIdValue: string, enabled: boolean, context?: ProviderMutationContext): FederationProviderConfig {
    const provider = this.get(providerIdValue);
    if (provider.enabled === enabled) return provider;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE federation_providers SET enabled = ?, generation = generation + 1, updated_at = datetime('now') WHERE provider_id = ? AND enabled = ?")
        .run(enabled ? 1 : 0, provider.providerId, enabled ? 0 : 1);
      if (!enabled) this.database.prepare("UPDATE federation_transactions SET consumed_at = ? WHERE provider_id = ? AND consumed_at IS NULL")
        .run(Date.now(), provider.providerId);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    this.auditMutation(context, enabled ? "federation.provider.enabled" : "federation.provider.disabled", provider.providerId);
    return this.get(provider.providerId);
  }

  pendingTransactionCount(providerIdValue: string): number {
    const provider = this.get(providerIdValue);
    return Number((this.database.prepare("SELECT COUNT(*) AS count FROM federation_transactions WHERE provider_id = ? AND consumed_at IS NULL AND expires_at > ?")
      .get(provider.providerId, Date.now()) as { count: number }).count);
  }

  bumpGeneration(providerIdValue: string, context?: ProviderMutationContext, action = "federation.provider.security_updated"): FederationProviderConfig {
    const provider = this.get(providerIdValue);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE federation_providers SET generation = generation + 1, updated_at = datetime('now') WHERE provider_id = ?")
        .run(provider.providerId);
      this.database.prepare("UPDATE federation_transactions SET consumed_at = ? WHERE provider_id = ? AND consumed_at IS NULL")
        .run(Date.now(), provider.providerId);
      this.database.exec("COMMIT");
    } catch (error) {
      if (this.database.inTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
    this.auditMutation(context, action, provider.providerId);
    return this.get(provider.providerId);
  }

  updateTrustedSamlCertificates(providerIdValue: string, certificates: readonly string[], context?: ProviderMutationContext, allowHttp = false): FederationProviderConfig {
    if (certificates.length < 1) throw new FederationProviderError("federation_provider_invalid", 400, "at least one SAML trusted certificate is required");
    const first = certificates[0];
    if (!first) throw new FederationProviderError("federation_provider_invalid", 400, "at least one SAML trusted certificate is required");
    return this.update(providerIdValue, {
      samlIdpCertificatePem: first,
      samlTrustedCertificatesPem: certificates
    }, context, allowHttp);
  }

  get(providerIdValue: string): FederationProviderConfig {
    const id = providerId(providerIdValue);
    const row = this.database.prepare("SELECT * FROM federation_providers WHERE provider_id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new FederationProviderError("federation_provider_unknown", 404, "federation provider is unknown");
    return rowToConfig(row);
  }

  list(): readonly FederationProviderConfig[] {
    return (this.database.prepare("SELECT * FROM federation_providers ORDER BY provider_id ASC").all() as Array<Record<string, unknown>>)
      .map((row) => rowToConfig(row));
  }

  publicList(): readonly { provider_id: string; protocol: FederationProtocol; display_name: string; enabled: boolean }[] {
    return (this.database.prepare("SELECT provider_id, protocol, display_name, enabled FROM federation_providers ORDER BY provider_id ASC").all() as Array<{ provider_id: string; protocol: FederationProtocol; display_name: string; enabled: number }>).map((row) => ({
      provider_id: row.provider_id,
      protocol: row.protocol,
      display_name: row.display_name,
      enabled: row.enabled === 1
    }));
  }

  enabled(providerIdValue: string, expectedProtocol?: FederationProtocol): FederationProviderConfig {
    const provider = this.get(providerIdValue);
    if (!provider.enabled) throw new FederationProviderError("federation_provider_disabled", 403, "federation provider is disabled");
    if (expectedProtocol !== undefined && provider.protocol !== expectedProtocol) {
      throw new FederationProviderError("federation_provider_protocol_mismatch", 409, "federation provider protocol does not match");
    }
    return provider;
  }

  private normalize(input: ProviderInput, allowHttp: boolean): FederationProviderConfig {
    const providerIdValue = providerId(input.providerId);
    const protocolValue = protocol(input.protocol);
    const issuer = protocolValue === "oidc"
      ? url(input.issuer, "issuer", allowHttp) as string
      : text(input.issuer, "issuer", 512, true) as string;
    if (/\s/.test(issuer)) throw new FederationProviderError("federation_provider_invalid", 400, "issuer is invalid");
    const displayName = text(input.displayName, "display_name", 160, true) as string;
    const discoveryIssuer = url(input.discoveryIssuer, "discovery_issuer", allowHttp);
    const redirectUri = url(input.redirectUri, "redirect_uri", allowHttp);
    const acsUrl = url(input.acsUrl, "acs_url", allowHttp);
    const scopesValue = scopes(input.scopes);
    const clientAuthMethodValue = clientAuthMethod(input.clientAuthMethod);
    const idpEntityId = text(input.idpEntityId, "idp_entity_id", 512);
    const spEntityId = text(input.spEntityId, "sp_entity_id", 512);
    const samlEntryPoint = url(input.samlEntryPoint, "saml_entry_point", allowHttp);
    const samlNameIdFormatValue = samlNameIdFormat(input.samlNameIdFormat);
    const samlIdpCertificatePemValue = samlCertificate(input.samlIdpCertificatePem);
    const samlTrustedCertificatesPemValue = samlTrustedCertificates(input.samlTrustedCertificatesPem, samlIdpCertificatePemValue);
    const samlSpCertificatePemValue = samlCertificate(input.samlSpCertificatePem);
    const samlWantAssertionsSigned = booleanOption(input.samlWantAssertionsSigned, "saml_want_assertions_signed", true);
    const samlWantAuthnResponseSigned = booleanOption(input.samlWantAuthnResponseSigned, "saml_want_authn_response_signed", true);
    const samlSignAuthnRequests = booleanOption(input.samlSignAuthnRequests, "saml_sign_authn_requests", false);
    const samlAcceptedClockSkewMs = samlClockSkew(input.samlAcceptedClockSkewMs);
    const samlMetadataLifecyclePolicy = input.samlMetadataLifecyclePolicy ?? "manual";
    if (samlMetadataLifecyclePolicy !== "manual") throw new FederationProviderError("federation_provider_invalid", 400, "saml_metadata_lifecycle_policy is invalid");
    if (protocolValue === "saml") {
      if (!idpEntityId || !spEntityId || !acsUrl || !samlEntryPoint || !samlNameIdFormatValue || !samlIdpCertificatePemValue) {
        throw new FederationProviderError("federation_provider_invalid", 400, "SAML provider metadata is incomplete");
      }
      if (issuer !== idpEntityId) throw new FederationProviderError("federation_provider_invalid", 400, "SAML issuer must equal the IdP entity ID");
      if (samlSignAuthnRequests && (!input.signingKeyReference || !samlSpCertificatePemValue)) {
        throw new FederationProviderError("federation_provider_invalid", 400, "SAML request signing requires a signing key reference and public certificate");
      }
    }
    return {
      providerId: providerIdValue,
      protocol: protocolValue,
      displayName,
      issuer,
      enabled: false,
      clientId: text(input.clientId, "client_id", 240),
      clientAuthMethod: clientAuthMethodValue,
      discoveryIssuer,
      redirectUri,
      scopes: scopesValue,
      clientSecretReference: reference(input.clientSecretReference, "client_secret_reference", providerIdValue),
      idpEntityId,
      spEntityId,
      acsUrl,
      metadataReference: text(input.metadataReference, "metadata_reference", 240),
      trustedCertificateReference: text(input.trustedCertificateReference, "trusted_certificate_reference", 240),
      signingKeyReference: reference(input.signingKeyReference, "signing_key_reference", providerIdValue),
      samlEntryPoint,
      samlNameIdFormat: samlNameIdFormatValue,
      samlIdpCertificatePem: samlIdpCertificatePemValue,
      samlTrustedCertificatesPem: samlTrustedCertificatesPemValue,
      samlSpCertificatePem: samlSpCertificatePemValue,
      samlWantAssertionsSigned,
      samlWantAuthnResponseSigned,
      samlSignAuthnRequests,
      samlAcceptedClockSkewMs,
      samlMetadataLifecyclePolicy,
      createdAt: "",
      updatedAt: "",
      generation: 1
    };
  }

  private insertNormalized(normalized: FederationProviderConfig): void {
    this.database.prepare(
      "INSERT INTO federation_providers(provider_id, protocol, display_name, issuer, client_id, client_auth_method, discovery_issuer, redirect_uri, scopes_json, client_secret_reference, idp_entity_id, sp_entity_id, acs_url, metadata_reference, trusted_certificate_reference, signing_key_reference, saml_entry_point, saml_name_id_format, saml_idp_certificate_pem, saml_trusted_certificates_json, saml_sp_certificate_pem, saml_want_assertions_signed, saml_want_authn_response_signed, saml_sign_authn_requests, saml_accepted_clock_skew_ms, saml_metadata_lifecycle_policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      normalized.providerId, normalized.protocol, normalized.displayName, normalized.issuer,
      normalized.clientId, normalized.clientAuthMethod, normalized.discoveryIssuer, normalized.redirectUri, JSON.stringify(normalized.scopes),
      normalized.clientSecretReference, normalized.idpEntityId, normalized.spEntityId, normalized.acsUrl,
      normalized.metadataReference, normalized.trustedCertificateReference, normalized.signingKeyReference,
      normalized.samlEntryPoint, normalized.samlNameIdFormat, normalized.samlIdpCertificatePem, JSON.stringify(normalized.samlTrustedCertificatesPem), normalized.samlSpCertificatePem,
      normalized.samlWantAssertionsSigned ? 1 : 0, normalized.samlWantAuthnResponseSigned ? 1 : 0,
      normalized.samlSignAuthnRequests ? 1 : 0, normalized.samlAcceptedClockSkewMs, normalized.samlMetadataLifecyclePolicy
    );
  }

  private auditMutation(context: ProviderMutationContext | undefined, action: string, target: string): void {
    if (!context || !this.audit) return;
    // Administrative routes preflight audit storage before mutation. If the
    // bounded append still fails after commit, surface the failure rather than
    // silently reporting an untracked security mutation.
    this.audit.append({ actor_user_id: context.actorUserId, target_type: "federation_provider", target_id: target, action, outcome: "committed", request_id: context.requestId });
  }

  private isConstraint(error: unknown): boolean {
    return error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("SQLITE_CONSTRAINT");
  }
}

function sameProvisionedProvider(left: FederationProviderConfig, right: FederationProviderConfig): boolean {
  const fields: Array<keyof FederationProviderConfig> = [
    "providerId", "protocol", "displayName", "issuer", "clientId", "clientAuthMethod",
    "discoveryIssuer", "redirectUri", "scopes", "clientSecretReference", "idpEntityId",
    "spEntityId", "acsUrl", "metadataReference", "trustedCertificateReference",
    "signingKeyReference", "samlEntryPoint", "samlNameIdFormat", "samlIdpCertificatePem",
    "samlTrustedCertificatesPem", "samlSpCertificatePem", "samlWantAssertionsSigned",
    "samlWantAuthnResponseSigned", "samlSignAuthnRequests", "samlAcceptedClockSkewMs",
    "samlMetadataLifecyclePolicy"
  ];
  return fields.every((field) => JSON.stringify(left[field]) === JSON.stringify(right[field]));
}
