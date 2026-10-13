import crypto from "node:crypto";

import { SAML, ValidateInResponseTo, type CacheItem, type CacheProvider, type Profile } from "@node-saml/node-saml";
import { DOMParser } from "@xmldom/xmldom";
import type Database from "better-sqlite3";

import type { AdminAuditLog } from "../admin/audit.js";
import type { AuthService } from "../auth/service.js";
import type { BackendConfig } from "../config/env.js";
import { FederationIdentityError, type FederationIdentityService, ValidatedExternalIdentity } from "../federation/identity.js";
import { FederationProviderError, type FederationProviderConfig, type FederationProviderService } from "../federation/provider.js";
import { FederationTransactionError, type FederationTransactionStore } from "../federation/transaction.js";
import { SecretStorageError, type SecretStore } from "../secrets/service.js";
import { createSamlCorrelation, parseSamlCorrelation } from "./correlation.js";

const SAML_TRANSACTION_TTL_SECONDS = 300;
const MAX_PENDING_KEYS = 4096;
const PERSISTENT_NAME_ID = "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent";

export class SamlError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message);
    this.name = "SamlError";
  }
}

interface SamlRequestContext {
  readonly requestId: string;
  readonly ip: string;
}

export interface SamlLoginResult {
  readonly location: string;
  readonly correlationCookie: string;
}

export interface SamlCallbackResult {
  readonly userId: number;
  readonly returnPath: string;
  readonly sessionCookie: string;
}

interface PendingRow {
  readonly requestId: string;
  readonly transactionId: string;
  readonly callbackBinding: string;
  readonly expiresAt: number;
}

function withRequestId(pending: { readonly requestId: string | null; readonly transactionId: string; readonly callbackBinding: string; readonly expiresAt: number }): PendingRow {
  if (!pending.requestId) throw new SamlError("saml_transaction_invalid", 500, "SAML transaction is unavailable");
  return { requestId: pending.requestId, transactionId: pending.transactionId, callbackBinding: pending.callbackBinding, expiresAt: pending.expiresAt };
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
}

function bounded(value: string | null | undefined, max: number): string | null {
  if (!value || value.length > max || hasControlCharacter(value)) return null;
  return value;
}

function safeReturnPath(value: string | null): string {
  const candidate = value ?? "/";
  if (candidate.length > 512 || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || hasControlCharacter(candidate)) {
    throw new SamlError("saml_return_path_invalid", 400, "SAML return path is invalid");
  }
  return candidate;
}

function certificate(value: string | null, label: string): string {
  if (!value || value.length > 65536 || (!value.includes("BEGIN CERTIFICATE") && !value.includes("BEGIN PUBLIC KEY"))) {
    throw new SamlError("saml_provider_incomplete", 503, label + " is unavailable");
  }
  if (value.includes("BEGIN CERTIFICATE")) {
    try {
      const parsed = new crypto.X509Certificate(value);
      const now = Date.now();
      if (now < Date.parse(parsed.validFrom) || now > Date.parse(parsed.validTo)) {
        throw new SamlError("saml_certificate_expired", 401, "SAML signing certificate is not currently valid");
      }
    } catch (error) {
      if (error instanceof SamlError) throw error;
      throw new SamlError("saml_provider_invalid", 503, label + " is invalid");
    }
  }
  return value;
}

function assertionId(profile: Profile): string {
  const assertion = profile.getAssertion?.();
  if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) throw new SamlError("saml_assertion_invalid", 401, "SAML assertion is invalid");
  const node = assertion.Assertion;
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new SamlError("saml_assertion_invalid", 401, "SAML assertion is invalid");
  const attributes = (node as Record<string, unknown>).$;
  const identifier = attributes && typeof attributes === "object" && !Array.isArray(attributes)
    ? (attributes as Record<string, unknown>).ID
    : undefined;
  if (typeof identifier !== "string" || identifier.length < 1 || identifier.length > 512) {
    throw new SamlError("saml_assertion_invalid", 401, "SAML assertion is invalid");
  }
  return identifier;
}

function responseEnvelope(value: string, acsUrl: string): { readonly responseId: string } {
  try {
    const xml = Buffer.from(value, "base64").toString("utf8");
    const document = new DOMParser({ errorHandler: () => undefined }).parseFromString(xml, "text/xml");
    const root = document.documentElement;
    const localName = root?.localName ?? root?.nodeName.split(":").pop();
    const responseId = root?.getAttribute("ID") ?? "";
    const destination = root?.getAttribute("Destination") ?? "";
    if (localName !== "Response" || responseId.length < 1 || responseId.length > 512 || destination !== acsUrl) {
      throw new Error("SAML response envelope is invalid");
    }
    return { responseId };
  } catch {
    throw new SamlError("saml_response_invalid", 401, "SAML authentication response is invalid");
  }
}

function verifiedRecipient(profile: Profile, acsUrl: string, requestId: string): void {
  const assertion = profile.getAssertion?.();
  if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) throw new SamlError("saml_assertion_invalid", 401, "SAML assertion is invalid");
  const node = assertion.Assertion;
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new SamlError("saml_assertion_invalid", 401, "SAML assertion is invalid");
  const subject = (node as Record<string, unknown>).Subject;
  const subjectRecord: unknown = Array.isArray(subject) ? subject[0] as unknown : undefined;
  const confirmations = subjectRecord && typeof subjectRecord === "object" && !Array.isArray(subjectRecord)
    ? (subjectRecord as Record<string, unknown>).SubjectConfirmation
    : undefined;
  const confirmation: unknown = Array.isArray(confirmations) ? confirmations[0] as unknown : undefined;
  const data = confirmation && typeof confirmation === "object" && !Array.isArray(confirmation)
    ? (confirmation as Record<string, unknown>).SubjectConfirmationData
    : undefined;
  const dataRecord: unknown = Array.isArray(data) ? data[0] as unknown : undefined;
  const attributes = dataRecord && typeof dataRecord === "object" && !Array.isArray(dataRecord)
    ? (dataRecord as Record<string, unknown>).$
    : undefined;
  const values = attributes && typeof attributes === "object" && !Array.isArray(attributes) ? attributes as Record<string, unknown> : null;
  if (!values || values.Recipient !== acsUrl || values.InResponseTo !== requestId) {
    throw new SamlError("saml_subject_confirmation_invalid", 401, "SAML subject confirmation is invalid");
  }
}

function samlProvider(provider: FederationProviderConfig, config: BackendConfig): FederationProviderConfig {
  if (provider.protocol !== "saml") throw new SamlError("saml_provider_protocol_mismatch", 409, "SAML provider protocol does not match");
  if (!config.federationPublicOrigin) throw new SamlError("saml_public_origin_missing", 503, "SAML public origin is not configured");
  if (!provider.idpEntityId || !provider.spEntityId || !provider.acsUrl || !provider.samlEntryPoint || !provider.samlNameIdFormat || !provider.samlIdpCertificatePem || provider.samlTrustedCertificatesPem.length < 1) {
    throw new SamlError("saml_provider_incomplete", 503, "SAML provider configuration is incomplete");
  }
  let acs: URL;
  let origin: URL;
  try { acs = new URL(provider.acsUrl); origin = new URL(config.federationPublicOrigin); }
  catch { throw new SamlError("saml_provider_invalid", 503, "SAML provider configuration is invalid"); }
  const expectedPath = "/api/auth/saml/" + provider.providerId + "/acs";
  if (acs.origin !== origin.origin || acs.pathname !== expectedPath || acs.search || acs.hash || acs.username || acs.password) {
    throw new SamlError("saml_acs_invalid", 503, "SAML ACS configuration is invalid");
  }
  if (provider.issuer !== provider.idpEntityId || provider.samlNameIdFormat !== PERSISTENT_NAME_ID || !provider.samlWantAssertionsSigned || !provider.samlWantAuthnResponseSigned) {
    throw new SamlError("saml_provider_invalid", 503, "SAML provider configuration is invalid");
  }
  return provider;
}

class BoundedRateLimiter {
  private readonly values = new Map<string, { count: number; startedAt: number }>();

  constructor(private readonly max: number, private readonly windowSeconds: number) {}

  allow(key: string, now = Date.now()): boolean {
    if (this.values.size >= MAX_PENDING_KEYS && !this.values.has(key)) this.values.delete(this.values.keys().next().value as string);
    const current = this.values.get(key);
    if (!current || now - current.startedAt >= this.windowSeconds * 1000) {
      this.values.set(key, { count: 1, startedAt: now });
      return true;
    }
    current.count += 1;
    return current.count <= this.max;
  }
}

/**
 * Node-SAML exposes get/remove rather than an atomic consume hook. This cache
 * therefore reads only the durable pending transaction; the SAML service
 * performs the final SQLite BEGIN IMMEDIATE consume after the library has
 * verified the response and assertion. removeAsync is intentionally a no-op
 * so the library cannot consume a transaction before those checks complete.
 */
class DurableSamlCacheProvider implements CacheProvider {
  constructor(
    private readonly transactions: FederationTransactionStore,
    private readonly providerId: string,
    private readonly pending: PendingRow
  ) {}

  saveAsync(key: string, value: string): Promise<CacheItem | null> {
    if (key !== this.pending.requestId || !this.transactions.isRequestPending({ protocol: "saml", providerId: this.providerId, requestId: key })) return Promise.resolve(null);
    return Promise.resolve({ value, createdAt: Date.now() });
  }

  getAsync(key: string): Promise<string | null> {
    return Promise.resolve(this.transactions.isRequestPending({ protocol: "saml", providerId: this.providerId, requestId: key }) ? new Date().toISOString() : null);
  }

  removeAsync(key: string | null): Promise<string | null> {
    return Promise.resolve(key === this.pending.requestId ? key : null);
  }
}

export class SamlService {
  private readonly loginLimiter: BoundedRateLimiter;
  private readonly callbackLimiter: BoundedRateLimiter;

  constructor(
    private readonly config: BackendConfig,
    private readonly database: Database.Database,
    private readonly auth: AuthService,
    private readonly providers: FederationProviderService,
    private readonly identities: FederationIdentityService,
    private readonly transactions: FederationTransactionStore,
    private readonly secrets: SecretStore,
    private readonly audit: AdminAuditLog
  ) {
    this.loginLimiter = new BoundedRateLimiter(config.authRateLimitMax, config.authRateLimitWindowSeconds);
    this.callbackLimiter = new BoundedRateLimiter(config.authRateLimitMax * 2, config.authRateLimitWindowSeconds);
  }

  async start(providerId: string, returnTo: string | null, context: SamlRequestContext): Promise<SamlLoginResult> {
    if (!this.loginLimiter.allow(context.ip + ":" + providerId)) throw new SamlError("saml_rate_limited", 429, "too many SAML requests");
    const provider = this.requireProvider(providerId);
    const returnPath = safeReturnPath(returnTo);
    const browserBinding = crypto.randomBytes(32).toString("base64url");
    const state = crypto.randomBytes(32).toString("base64url");
    const requestId = "_" + crypto.randomBytes(32).toString("base64url");
    const callbackBinding = digest(provider.acsUrl + "\u0000" + browserBinding);
    const transaction = this.transactions.create({ protocol: "saml", providerId: provider.providerId, callbackBinding, state, requestId, returnPath, ttlSeconds: SAML_TRANSACTION_TTL_SECONDS });
    const pending = this.transactions.pending(transaction.transactionId);
    if (!pending?.requestId) throw new SamlError("saml_transaction_invalid", 500, "SAML transaction is unavailable");
    const pendingWithRequestId = withRequestId(pending);
    try {
      const strategy = this.strategy(provider, pendingWithRequestId);
      const location = await strategy.getAuthorizeUrlAsync(state, undefined, {});
      this.auditEvent("federation.saml.started", provider.providerId, context.requestId, "committed");
      return { location, correlationCookie: createSamlCorrelation(this.config.authSessionSecret ?? "", transaction.transactionId, browserBinding) };
    } catch (error) {
      this.auditEvent("federation.saml.rejected", provider.providerId, context.requestId, "rejected");
      if (error instanceof SamlError) throw error;
      throw new SamlError("saml_unavailable", 503, "SAML authentication is unavailable");
    }
  }

  async complete(providerId: string, samlResponse: string, relayState: string | null, correlationCookie: string | undefined, sessionCookie: string | undefined, context: SamlRequestContext): Promise<SamlCallbackResult> {
    if (!this.callbackLimiter.allow(context.ip + ":" + providerId)) throw new SamlError("saml_rate_limited", 429, "too many SAML requests");
    const provider = this.requireProvider(providerId);
    const correlation = this.config.authSessionSecret ? parseSamlCorrelation(this.config.authSessionSecret, correlationCookie) : null;
    if (!correlation) throw new SamlError("saml_browser_binding_failed", 401, "SAML browser correlation failed");
    const callbackBinding = digest(provider.acsUrl + "\u0000" + correlation.binding);
    const pending = this.transactions.pending(correlation.transactionId);
    if (!pending && this.transactions.wasConsumed(correlation.transactionId)) throw new SamlError("saml_replay_rejected", 409, "SAML response was already used");
    if (!pending || pending.protocol !== "saml" || pending.providerId !== provider.providerId || pending.callbackBinding !== callbackBinding || !pending.requestId) {
      throw new SamlError("saml_transaction_invalid", 400, "SAML transaction is invalid");
    }
    const pendingWithRequestId = withRequestId(pending);
    if (pending.expiresAt <= Date.now()) throw new SamlError("saml_transaction_expired", 400, "SAML transaction expired");
    const safeRelayState = bounded(relayState, this.config.samlMaxRelayStateBytes);
    if (!safeRelayState || safeRelayState.length < 32) throw new SamlError("saml_relay_state_invalid", 400, "SAML RelayState is invalid");
    if (Buffer.byteLength(samlResponse, "utf8") > this.config.samlMaxResponseBytes || !/^[A-Za-z0-9+/=_-]+$/.test(samlResponse)) {
      throw new SamlError("saml_response_too_large", 413, "SAML response is too large");
    }
    const envelope = responseEnvelope(samlResponse, provider.acsUrl as string);
    let profile: Profile | null;
    try {
      const strategy = this.strategy(provider, pendingWithRequestId);
      const result = await strategy.validatePostResponseAsync({ SAMLResponse: samlResponse });
      profile = result.profile;
    } catch (error) {
      this.auditEvent("federation.saml.rejected", provider.providerId, context.requestId, "rejected");
      if (error instanceof SamlError) throw error;
      throw new SamlError("saml_response_invalid", 401, "SAML authentication response is invalid");
    }
    if (!profile || profile.issuer !== provider.idpEntityId || profile.nameIDFormat !== PERSISTENT_NAME_ID || !bounded(profile.nameID, 512)) {
      throw new SamlError("saml_identity_invalid", 401, "SAML identity is invalid");
    }
    if (profile.inResponseTo !== pending.requestId) throw new SamlError("saml_in_response_to_invalid", 401, "SAML response correlation is invalid");
    verifiedRecipient(profile, provider.acsUrl as string, pending.requestId);
    const assertionIdentifier = assertionId(profile);
    let transaction;
    try {
      transaction = this.transactions.consumeByRequestId({ protocol: "saml", providerId: provider.providerId, requestId: pending.requestId, state: safeRelayState, callbackBinding });
      this.transactions.recordReplays("saml", provider.providerId, ["assertion:" + assertionIdentifier, "response:" + envelope.responseId, "response-digest:" + digest(samlResponse)]);
    } catch (error) {
      if (error instanceof FederationTransactionError && error.code === "federation_transaction_replayed") throw new SamlError("saml_replay_rejected", 409, "SAML response was already used");
      if (error instanceof FederationTransactionError && error.code === "federation_transaction_expired") throw new SamlError("saml_transaction_expired", 400, "SAML transaction expired");
      throw new SamlError("saml_transaction_invalid", 400, "SAML transaction is invalid");
    }
    const externalIdentity = ValidatedExternalIdentity.fromProtocolAdapter({ protocol: "saml", providerId: provider.providerId, issuer: profile.issuer, subject: profile.nameID, authenticatedAt: new Date().toISOString() });
    let resolved;
    try { resolved = this.identities.resolve(externalIdentity); }
    catch (error) {
      if (error instanceof FederationIdentityError && error.code === "federation_identity_unknown") throw new SamlError("saml_identity_link_required", 401, "SAML identity is not linked");
      if (error instanceof FederationIdentityError && error.code === "federation_account_disabled") throw new SamlError("saml_account_disabled", 403, "SAML authentication is unavailable");
      throw error;
    }
    const current = this.auth.context(sessionCookie, undefined);
    const session = this.auth.rotateSession(current.session, resolved.userId);
    if (!session) throw new SamlError("saml_session_unavailable", 503, "authentication session is unavailable");
    this.auditEvent("federation.saml.succeeded", provider.providerId, context.requestId, "committed", digest(provider.issuer + "\u0000" + profile.nameID).slice(0, 32));
    return { userId: resolved.userId, returnPath: transaction.returnPath, sessionCookie: session.cookieValue };
  }

  metadata(providerId: string): Promise<string> {
    const provider = this.requireProvider(providerId);
    const strategy = this.strategy(provider, null);
    return Promise.resolve(strategy.generateServiceProviderMetadata(null, provider.samlSignAuthnRequests ? certificate(provider.samlSpCertificatePem, "saml_sp_certificate_pem") : null));
  }

  private strategy(provider: FederationProviderConfig, pending: PendingRow | null): SAML {
    const idpCerts = provider.samlTrustedCertificatesPem.map((item) => certificate(item, "saml_idp_certificate_pem"));
    let privateKey: string | undefined;
    if (provider.samlSignAuthnRequests) {
      if (!provider.signingKeyReference) throw new SamlError("saml_signing_key_missing", 503, "SAML signing key is unavailable");
      try { privateKey = this.secrets.decryptProviderSecret(this.database, provider.providerId, "saml-sp-signing-private-key"); }
      catch (error) {
        if (error instanceof SecretStorageError) throw new SamlError("saml_signing_key_unavailable", 503, "SAML signing key is unavailable");
        throw error;
      }
    }
    const cacheProvider: CacheProvider = pending
      ? new DurableSamlCacheProvider(this.transactions, provider.providerId, pending)
      : { saveAsync: () => Promise.resolve(null), getAsync: () => Promise.resolve(null), removeAsync: () => Promise.resolve(null) };
    return new SAML({
      entryPoint: provider.samlEntryPoint as string,
      idpIssuer: provider.idpEntityId as string,
      idpCert: idpCerts.length === 1 ? idpCerts[0] as string : idpCerts,
      issuer: provider.spEntityId as string,
      callbackUrl: provider.acsUrl as string,
      identifierFormat: provider.samlNameIdFormat,
      allowCreate: false,
      acceptedClockSkewMs: provider.samlAcceptedClockSkewMs,
      disableRequestedAuthnContext: true,
      authnContext: [],
      forceAuthn: false,
      passive: false,
      skipRequestCompression: false,
      audience: provider.spEntityId as string,
      wantAssertionsSigned: provider.samlWantAssertionsSigned,
      wantAuthnResponseSigned: provider.samlWantAuthnResponseSigned,
      validateInResponseTo: ValidateInResponseTo.always,
      requestIdExpirationPeriodMs: SAML_TRANSACTION_TTL_SECONDS * 1000,
      cacheProvider,
      generateUniqueId: () => pending?.requestId ?? "_" + crypto.randomBytes(32).toString("base64url"),
      ...(privateKey === undefined ? {} : { privateKey, publicCert: certificate(provider.samlSpCertificatePem, "saml_sp_certificate_pem"), signatureAlgorithm: "sha256" as const, digestAlgorithm: "sha256" })
    });
  }

  private requireProvider(providerId: string): FederationProviderConfig {
    if (!/^[a-z][a-z0-9._-]{0,63}$/.test(providerId)) throw new SamlError("saml_provider_invalid", 400, "SAML provider is invalid");
    try { return samlProvider(this.providers.enabled(providerId, "saml"), this.config); }
    catch (error) {
      if (error instanceof SamlError) throw error;
      if (error instanceof FederationProviderError) throw new SamlError(error.code, error.statusCode, error.message);
      throw error;
    }
  }

  private auditEvent(action: string, providerId: string, requestId: string, outcome: "attempted" | "committed" | "failed" | "rejected", targetId = providerId): void {
    try { this.audit.append({ actor_user_id: 0, target_type: "saml_provider", target_id: targetId, action, outcome, request_id: requestId }); } catch { /* audit failure never changes the authentication result */ }
  }
}
