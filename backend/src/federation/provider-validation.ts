import crypto from "node:crypto";

import {
  type FederationProtocol,
  type FederationProviderConfig,
  type ProviderInput,
} from "./provider-contracts.js";
import { clientAuthMethod, FederationProviderError } from "./provider-codecs.js";

const PROVIDER_ID_RE = /^[a-z][a-z0-9._-]{0,63}$/;
const REFERENCE_RE = new RegExp(
  "^federated-provider:[a-z][a-z0-9._-]{0,63}:" +
    "(oidc-client-secret|saml-sp-signing-private-key|" +
    "saml-sp-decryption-private-key)$",
);
const MAX_SAML_TRUSTED_CERTIFICATES = 2;

function text(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new FederationProviderError(
        "federation_provider_invalid",
        400,
        `${label} is required`,
      );
    }
    return null;
  }
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > max
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      `${label} is invalid`,
    );
  }
  return value.trim();
}

/** Normalizes a provider identifier using the public provider naming rules. */
export function normalizeProviderId(value: unknown): string {
  const normalized = text(value, "provider_id", 64, true) as string;
  if (!PROVIDER_ID_RE.test(normalized)) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "provider_id is invalid",
    );
  }
  return normalized;
}

function protocol(value: unknown): FederationProtocol {
  if (value !== "oidc" && value !== "saml") {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "protocol is invalid",
    );
  }
  return value;
}

function url(
  value: unknown,
  label: string,
  allowHttp: boolean,
  max = 512,
): string | null {
  const normalized = text(value, label, max);
  if (normalized === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      `${label} is invalid`,
    );
  }
  if (
    (!allowHttp && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      `${label} must be an HTTPS URL without credentials or fragments`,
    );
  }
  return parsed.toString();
}

function reference(
  value: unknown,
  label: string,
  expectedProvider: string,
): string | null {
  const normalized = text(value, label, 240);
  if (normalized === null) return null;
  if (
    !REFERENCE_RE.test(normalized) ||
    !normalized.startsWith(`federated-provider:${expectedProvider}:`)
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      `${label} is not a valid provider-scoped reference`,
    );
  }
  return normalized;
}

function scopes(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 16) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "scopes is invalid",
    );
  }
  const result = value.map((item) => text(item, "scope", 64, true) as string);
  if (new Set(result).size !== result.length) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "scopes contains duplicates",
    );
  }
  return result;
}

function booleanOption(
  value: unknown,
  label: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      `${label} is invalid`,
    );
  }
  return value;
}

function samlCertificate(value: unknown): string | null {
  const normalized = text(value, "saml_idp_certificate_pem", 65536);
  if (normalized === null) return null;
  if (
    !normalized.includes("BEGIN CERTIFICATE") &&
    !normalized.includes("BEGIN PUBLIC KEY")
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_idp_certificate_pem is invalid",
    );
  }
  try {
    if (normalized.includes("BEGIN CERTIFICATE")) {
      new crypto.X509Certificate(normalized);
    } else {
      crypto.createPublicKey(normalized);
    }
  } catch {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_idp_certificate_pem is invalid",
    );
  }
  return normalized;
}

function certificateFingerprint(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value.replace(/\r\n/g, "\n").trim(), "utf8")
    .digest("hex");
}

function samlTrustedCertificates(
  value: unknown,
  legacy: string | null,
): string[] {
  if (value === undefined || value === null) {
    return legacy === null ? [] : [legacy];
  }
  if (
    !Array.isArray(value) ||
    value.length > MAX_SAML_TRUSTED_CERTIFICATES
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_trusted_certificates_pem is invalid",
    );
  }
  const result = value.map((item) => samlCertificate(item));
  if (result.some((item): item is null => item === null)) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_trusted_certificates_pem is invalid",
    );
  }
  const certificates = result.filter(
    (item): item is string => item !== null,
  );
  if (
    new Set(certificates.map(certificateFingerprint)).size !==
    certificates.length
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_trusted_certificates_pem contains duplicates",
    );
  }
  return certificates;
}

function samlNameIdFormat(value: unknown): string | null {
  const normalized = text(value, "saml_name_id_format", 160);
  if (normalized === null) return null;
  if (normalized !== "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent") {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_name_id_format must be persistent",
    );
  }
  return normalized;
}

function samlClockSkew(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 300000
  ) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_accepted_clock_skew_ms is invalid",
    );
  }
  return value;
}

/** Normalizes and validates one OIDC or SAML provider definition. */
export function normalizeProvider(
  input: ProviderInput,
  allowHttp: boolean,
): FederationProviderConfig {
  const providerIdValue = normalizeProviderId(input.providerId);
  const protocolValue = protocol(input.protocol);
  const issuer = protocolValue === "oidc"
    ? url(input.issuer, "issuer", allowHttp) as string
    : text(input.issuer, "issuer", 512, true) as string;
  if (/\s/.test(issuer)) {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "issuer is invalid",
    );
  }
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
  const samlTrustedCertificatesPemValue = samlTrustedCertificates(
    input.samlTrustedCertificatesPem,
    samlIdpCertificatePemValue,
  );
  const samlSpCertificatePemValue = samlCertificate(input.samlSpCertificatePem);
  const samlWantAssertionsSigned = booleanOption(
    input.samlWantAssertionsSigned,
    "saml_want_assertions_signed",
    true,
  );
  const samlWantAuthnResponseSigned = booleanOption(
    input.samlWantAuthnResponseSigned,
    "saml_want_authn_response_signed",
    true,
  );
  const samlSignAuthnRequests = booleanOption(
    input.samlSignAuthnRequests,
    "saml_sign_authn_requests",
    false,
  );
  const samlAcceptedClockSkewMs = samlClockSkew(input.samlAcceptedClockSkewMs);
  const samlMetadataLifecyclePolicy = input.samlMetadataLifecyclePolicy ?? "manual";
  if (samlMetadataLifecyclePolicy !== "manual") {
    throw new FederationProviderError(
      "federation_provider_invalid",
      400,
      "saml_metadata_lifecycle_policy is invalid",
    );
  }
  if (protocolValue === "saml") {
    if (
      !idpEntityId ||
      !spEntityId ||
      !acsUrl ||
      !samlEntryPoint ||
      !samlNameIdFormatValue ||
      !samlIdpCertificatePemValue
    ) {
      throw new FederationProviderError(
        "federation_provider_invalid",
        400,
        "SAML provider metadata is incomplete",
      );
    }
    if (issuer !== idpEntityId) {
      throw new FederationProviderError(
        "federation_provider_invalid",
        400,
        "SAML issuer must equal the IdP entity ID",
      );
    }
    if (
      samlSignAuthnRequests &&
      (!input.signingKeyReference || !samlSpCertificatePemValue)
    ) {
      throw new FederationProviderError(
        "federation_provider_invalid",
        400,
        "SAML request signing requires a signing key reference and public certificate",
      );
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
    clientSecretReference: reference(
      input.clientSecretReference,
      "client_secret_reference",
      providerIdValue,
    ),
    idpEntityId,
    spEntityId,
    acsUrl,
    metadataReference: text(input.metadataReference, "metadata_reference", 240),
    trustedCertificateReference: text(
      input.trustedCertificateReference,
      "trusted_certificate_reference",
      240,
    ),
    signingKeyReference: reference(
      input.signingKeyReference,
      "signing_key_reference",
      providerIdValue,
    ),
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
    generation: 1,
  };
}
