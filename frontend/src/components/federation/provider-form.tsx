"use client";

import type { FormEvent } from "react";

import {
  federationErrorMessage,
  type FederationProvider,
  type FederationProviderInput,
} from "../../lib/api/federation-admin";
import { Button } from "../ui/button";
import {
  Field,
  Notice,
  TextArea,
} from "./presentation";
import { useProviderForm } from "./use-provider-form";

/** Properties shared by provider creation and provider editing forms. */
export type ProviderFormProps = {
  protocol: "oidc" | "saml";
  provider?: FederationProvider;
  onSubmit: (
    input:
      | FederationProviderInput
      | Omit<FederationProviderInput, "provider_id" | "protocol" | "issuer">,
  ) => void;
  pending: boolean;
  error?: unknown;
  onCancel: () => void;
  clearSensitive?: () => void;
};

/** Renders the protocol-specific provider configuration form. */
export function ProviderForm({
  protocol,
  provider,
  onSubmit,
  pending,
  error,
  onCancel,
  clearSensitive,
}: ProviderFormProps) {
  const {
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
  } = useProviderForm({ protocol, provider, onSubmit });
  const visibleError = formError || (error ? federationErrorMessage(error) : "");

  const handleReset = () => {
    resetSensitive();
    clearSensitive?.();
  };

  const handleCancel = () => {
    resetSensitive();
    clearSensitive?.();
    onCancel();
  };

  return (
    <form className="space-y-5" onSubmit={submit} onReset={handleReset}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Display name"
          required
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Field
          label="Issuer"
          required
          value={issuer}
          onChange={(event) => setIssuer(event.target.value)}
          hint={
            protocol === "saml"
              ? "For SAML this must equal the IdP Entity ID."
              : "The Identity Provider issuer URL."
          }
        />
        {!provider && (
          <Field
            label="Provider ID"
            required
            pattern="[a-z][a-z0-9._-]{0,63}"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            hint="Lowercase identifier; immutable after creation."
          />
        )}
      </div>

      {protocol === "oidc" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Client ID"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />
          <label className="grid gap-1 text-sm font-medium">
            <span>Client authentication method</span>
            <select
              value={clientAuthMethod}
              onChange={(event) =>
                setClientAuthMethod(
                  event.target.value as FederationProvider["client_auth_method"],
                )
              }
              className={
                "min-h-10 rounded-md border border-[var(--color-border)] " +
                "bg-[var(--color-surface)] px-3"
              }
            >
              <option value="client_secret_basic">client_secret_basic</option>
              <option value="client_secret_post">client_secret_post</option>
              <option value="none">none</option>
            </select>
          </label>
          <Field
            label={provider ? "New client secret (optional)" : "Client secret"}
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            autoComplete="new-password"
            hint="Never displayed again; use rotation later to replace it."
          />
          <Field
            label="Discovery issuer (optional)"
            value={discoveryIssuer}
            onChange={(event) => setDiscoveryIssuer(event.target.value)}
          />
          <Field
            label="Redirect URI"
            value={redirectUri || canonicalRedirect}
            onChange={(event) => setRedirectUri(event.target.value)}
            hint="Verify this against the backend public origin before saving."
          />
          <Field
            label="Scopes"
            value={scopes}
            onChange={(event) => setScopes(event.target.value)}
            hint="Comma-separated; include openid for usable OIDC login."
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="IdP Entity ID"
            required
            value={idpEntityId}
            onChange={(event) => {
              setIdpEntityId(event.target.value);
              if (!issuer) setIssuer(event.target.value);
            }}
          />
          <Field
            label="IdP SSO URL"
            required
            value={entryPoint}
            onChange={(event) => setEntryPoint(event.target.value)}
          />
          <Field
            label="SP Entity ID"
            required
            value={spEntityId}
            onChange={(event) => setSpEntityId(event.target.value)}
          />
          <Field
            label="ACS URL"
            value={acsUrl || canonicalAcs}
            onChange={(event) => setAcsUrl(event.target.value)}
            hint="Canonical callback: verify the configured public origin."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={assertionsSigned}
              onChange={(event) => setAssertionsSigned(event.target.checked)}
            />
            Require signed assertions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={responsesSigned}
              onChange={(event) => setResponsesSigned(event.target.checked)}
            />
            Require signed responses
          </label>
        </div>
      )}

      {protocol === "saml" && (
        <div className="space-y-4">
          <TextArea
            label="Trusted IdP certificate PEM"
            required={!provider}
            value={certificate}
            onChange={(event) => setCertificate(event.target.value)}
            hint={
              "PEM is submitted only to the certificate mutation. " +
              "Existing PEM is never returned."
            }
          />
          <TextArea
            label="Replacement trust set (optional)"
            value={trustedCertificates}
            onChange={(event) => setTrustedCertificates(event.target.value)}
            hint="Separate certificates with a blank line; maximum two trusted certificates."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={signRequests}
              onChange={(event) => setSignRequests(event.target.checked)}
            />
            Sign authentication requests (requires backend-managed key material)
          </label>
        </div>
      )}

      {visibleError && <Notice error={visibleError} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
        <Button disabled={pending}>
          {pending ? "Saving…" : provider ? "Save changes" : "Create provider"}
        </Button>
      </div>
    </form>
  );
}
