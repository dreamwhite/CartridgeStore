"use client";

import { useState, type FormEvent } from "react";

import type {
  FederationProvider,
  FederationProviderInput,
} from "../../lib/api/federation-admin";
import { publicApiPath } from "../../lib/api/origin";

type ProviderFormOptions = {
  protocol: "oidc" | "saml";
  provider?: FederationProvider;
  onSubmit: (
    input:
      | FederationProviderInput
      | Omit<FederationProviderInput, "provider_id" | "protocol" | "issuer">,
  ) => void;
};

/** Owns provider form state and preserves the existing submission payloads. */
export function useProviderForm({
  protocol,
  provider,
  onSubmit,
}: ProviderFormOptions) {
  const [providerId, setProviderId] = useState(provider?.provider_id ?? "");
  const [displayName, setDisplayName] = useState(provider?.display_name ?? "");
  const [issuer, setIssuer] = useState(provider?.issuer ?? "");
  const [clientId, setClientId] = useState(provider?.client_id ?? "");
  const [clientAuthMethod, setClientAuthMethod] = useState<
    FederationProvider["client_auth_method"]
  >(provider?.client_auth_method ?? "client_secret_basic");
  const [clientSecret, setClientSecret] = useState("");
  const [discoveryIssuer, setDiscoveryIssuer] = useState(
    provider?.discovery_issuer ?? "",
  );
  const [redirectUri, setRedirectUri] = useState(
    provider?.redirect_uri ?? "",
  );
  const [scopes, setScopes] = useState(
    provider?.scopes.join(", ") ?? "openid, profile",
  );
  const [idpEntityId, setIdpEntityId] = useState(
    provider?.idp_entity_id ?? "",
  );
  const [spEntityId, setSpEntityId] = useState(provider?.sp_entity_id ?? "");
  const [acsUrl, setAcsUrl] = useState(provider?.acs_url ?? "");
  const [entryPoint, setEntryPoint] = useState(
    provider?.saml_entry_point ?? "",
  );
  const [certificate, setCertificate] = useState("");
  const [trustedCertificates, setTrustedCertificates] = useState("");
  const [assertionsSigned, setAssertionsSigned] = useState(
    provider?.saml_want_assertions_signed ?? true,
  );
  const [responsesSigned, setResponsesSigned] = useState(
    provider?.saml_want_authn_response_signed ?? true,
  );
  const [signRequests, setSignRequests] = useState(
    provider?.saml_sign_authn_requests ?? false,
  );
  const [formError, setFormError] = useState("");

  const publicOrigin = publicApiPath("/").replace(/\/$/, "");
  const canonicalRedirect = `${publicOrigin}/api/auth/oidc/${encodeURIComponent(
    providerId || "<provider-id>",
  )}/callback`;
  const canonicalAcs = `${publicOrigin}/api/auth/saml/${encodeURIComponent(
    providerId || "<provider-id>",
  )}/acs`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (
      !displayName.trim() ||
      !issuer.trim() ||
      (!provider && !providerId.trim())
    ) {
      setFormError("Complete the required fields.");
      return;
    }
    if (
      protocol === "oidc" &&
      clientAuthMethod !== "none" &&
      !provider &&
      !clientSecret
    ) {
      setFormError(
        "A client secret is required for this authentication method.",
      );
      return;
    }
    if (
      protocol === "saml" &&
      (!idpEntityId ||
        !spEntityId ||
        !entryPoint ||
        !(certificate || trustedCertificates))
    ) {
      setFormError(
        "SAML entity IDs, SSO URL, and a trusted certificate are required.",
      );
      return;
    }

    const trustSet = (trustedCertificates.trim() || certificate.trim())
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const input: FederationProviderInput =
      protocol === "oidc"
        ? {
            provider_id: provider?.provider_id ?? providerId.trim(),
            protocol,
            display_name: displayName.trim(),
            issuer: issuer.trim(),
            client_id: clientId.trim() || undefined,
            client_auth_method: clientAuthMethod,
            client_secret: clientSecret || undefined,
            discovery_issuer: discoveryIssuer.trim() || undefined,
            redirect_uri: redirectUri.trim() || canonicalRedirect,
            scopes: scopes
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          }
        : {
            provider_id: provider?.provider_id ?? providerId.trim(),
            protocol,
            display_name: displayName.trim(),
            issuer: issuer.trim() || idpEntityId.trim(),
            idp_entity_id: idpEntityId.trim(),
            sp_entity_id: spEntityId.trim(),
            acs_url: acsUrl.trim() || canonicalAcs,
            saml_entry_point: entryPoint.trim(),
            saml_name_id_format:
              "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
            ...(trustSet.length
              ? {
                  saml_idp_certificate_pem: trustSet[0],
                  saml_trusted_certificates_pem: trustSet,
                }
              : {}),
            saml_want_assertions_signed: assertionsSigned,
            saml_want_authn_response_signed: responsesSigned,
            saml_sign_authn_requests: signRequests,
          };

    onSubmit(
      provider
        ? (Object.fromEntries(
            Object.entries(input).filter(
              ([key]) =>
                !["provider_id", "protocol", "issuer", "client_secret"].includes(
                  key,
                ),
            ),
          ) as Omit<
            FederationProviderInput,
            "provider_id" | "protocol" | "issuer"
          >)
        : input,
    );
  };

  const resetSensitive = () => {
    setClientSecret("");
    setCertificate("");
  };

  return {
    providerId,
    setProviderId,
    displayName,
    setDisplayName,
    issuer,
    setIssuer,
    clientId,
    setClientId,
    clientAuthMethod,
    setClientAuthMethod,
    clientSecret,
    setClientSecret,
    discoveryIssuer,
    setDiscoveryIssuer,
    redirectUri,
    setRedirectUri,
    scopes,
    setScopes,
    idpEntityId,
    setIdpEntityId,
    spEntityId,
    setSpEntityId,
    acsUrl,
    setAcsUrl,
    entryPoint,
    setEntryPoint,
    certificate,
    setCertificate,
    trustedCertificates,
    setTrustedCertificates,
    assertionsSigned,
    setAssertionsSigned,
    responsesSigned,
    setResponsesSigned,
    signRequests,
    setSignRequests,
    formError,
    canonicalRedirect,
    canonicalAcs,
    resetSensitive,
    submit,
  };
}
