"use client";

import type { ChangeEventHandler } from "react";

import type { FederationProvider } from "../../lib/api/federation-admin";
import {
  Field,
  TextArea,
} from "./presentation";

/** Controlled values and setters for OIDC provider fields. */
export interface OidcProviderFieldsProps {
  readonly provider?: FederationProvider;
  readonly clientId: string;
  readonly setClientId: ChangeEventHandler<HTMLInputElement>;
  readonly clientAuthMethod: FederationProvider["client_auth_method"];
  readonly setClientAuthMethod: (
    value: FederationProvider["client_auth_method"],
  ) => void;
  readonly clientSecret: string;
  readonly setClientSecret: ChangeEventHandler<HTMLInputElement>;
  readonly discoveryIssuer: string;
  readonly setDiscoveryIssuer: ChangeEventHandler<HTMLInputElement>;
  readonly redirectUri: string;
  readonly setRedirectUri: ChangeEventHandler<HTMLInputElement>;
  readonly canonicalRedirect: string;
  readonly scopes: string;
  readonly setScopes: ChangeEventHandler<HTMLInputElement>;
}

/** Renders the controlled OIDC-specific provider fields. */
export function OidcProviderFields({
  provider,
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
  canonicalRedirect,
  scopes,
  setScopes,
}: OidcProviderFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        label="Client ID"
        value={clientId}
        onChange={setClientId}
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
        onChange={setClientSecret}
        autoComplete="new-password"
        hint="Never displayed again; use rotation later to replace it."
      />
      <Field
        label="Discovery issuer (optional)"
        value={discoveryIssuer}
        onChange={setDiscoveryIssuer}
      />
      <Field
        label="Redirect URI"
        value={redirectUri || canonicalRedirect}
        onChange={setRedirectUri}
        hint="Verify this against the backend public origin before saving."
      />
      <Field
        label="Scopes"
        value={scopes}
        onChange={setScopes}
        hint="Comma-separated; include openid for usable OIDC login."
      />
    </div>
  );
}

/** Controlled values and setters for SAML provider fields. */
export interface SamlProviderFieldsProps {
  readonly provider?: FederationProvider;
  readonly idpEntityId: string;
  readonly setIdpEntityId: ChangeEventHandler<HTMLInputElement>;
  readonly setIssuer: ChangeEventHandler<HTMLInputElement>;
  readonly issuer: string;
  readonly entryPoint: string;
  readonly setEntryPoint: ChangeEventHandler<HTMLInputElement>;
  readonly spEntityId: string;
  readonly setSpEntityId: ChangeEventHandler<HTMLInputElement>;
  readonly acsUrl: string;
  readonly setAcsUrl: ChangeEventHandler<HTMLInputElement>;
  readonly canonicalAcs: string;
  readonly certificate: string;
  readonly setCertificate: ChangeEventHandler<HTMLTextAreaElement>;
  readonly trustedCertificates: string;
  readonly setTrustedCertificates: ChangeEventHandler<HTMLTextAreaElement>;
  readonly assertionsSigned: boolean;
  readonly setAssertionsSigned: (value: boolean) => void;
  readonly responsesSigned: boolean;
  readonly setResponsesSigned: (value: boolean) => void;
  readonly signRequests: boolean;
  readonly setSignRequests: (value: boolean) => void;
}

/** Renders the controlled SAML-specific provider fields. */
export function SamlProviderFields({
  provider,
  idpEntityId,
  setIdpEntityId,
  setIssuer,
  issuer,
  entryPoint,
  setEntryPoint,
  spEntityId,
  setSpEntityId,
  acsUrl,
  setAcsUrl,
  canonicalAcs,
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
}: SamlProviderFieldsProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="IdP Entity ID"
          required
          value={idpEntityId}
          onChange={(event) => {
            setIdpEntityId(event);
            if (!issuer) setIssuer(event);
          }}
        />
        <Field
          label="IdP SSO URL"
          required
          value={entryPoint}
          onChange={setEntryPoint}
        />
        <Field
          label="SP Entity ID"
          required
          value={spEntityId}
          onChange={setSpEntityId}
        />
        <Field
          label="ACS URL"
          value={acsUrl || canonicalAcs}
          onChange={setAcsUrl}
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
      <div className="space-y-4">
        <TextArea
          label="Trusted IdP certificate PEM"
          required={!provider}
          value={certificate}
          onChange={setCertificate}
          hint={
            "PEM is submitted only to the certificate mutation. " +
            "Existing PEM is never returned."
          }
        />
        <TextArea
          label="Replacement trust set (optional)"
          value={trustedCertificates}
          onChange={setTrustedCertificates}
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
    </>
  );
}
