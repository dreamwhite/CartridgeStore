"use client";

import Link from "next/link";

import type { FederationProviderInput } from "../../lib/api/federation-admin";
import { useCurrentUser } from "../../lib/auth/use-current-user";
import { Button } from "../ui/button";
import { hasFederationPermission } from "./FederationAdminGuard";
import {
  CertificatePanel,
  Notice,
  Panel,
} from "./presentation";
import {
  ProviderEndpointPanel,
  ProviderHeader,
} from "./provider-details-panels";
import { ProviderForm } from "./provider-form";
import { useProviderDetails } from "./use-provider-details";
import { useSensitiveActions } from "./use-sensitive-actions";

/** Displays safe provider configuration and privileged federation actions. */
export function ProviderDetails({ providerId }: { providerId: string }) {
  const current = useCurrentUser();
  const manage = hasFederationPermission(current.user, "federation:manage");
  const actions = useSensitiveActions();
  const {
    providerQuery,
    statusQuery,
    provider,
    editing,
    setEditing,
    success,
    error,
    mutation,
    stateMutation,
    rotateMutation,
    certMutation,
    revokeMutation,
    secret,
    setSecret,
    certificates,
    setCertificates,
    publicOrigin,
    canonicalRedirect,
    canonicalAcs,
    sensitive,
  } = useProviderDetails(providerId, actions);

  if (providerQuery.isLoading || statusQuery.isLoading) {
    return <p role="status">Loading provider…</p>;
  }

  if (providerQuery.error || !provider) {
    return (
      <div className="space-y-3">
        <Notice error={providerQuery.error ?? statusQuery.error} />
        <Link
          className="text-sm font-semibold text-violet-700"
          href="/admin/federation/providers"
        >
          Back to providers
        </Link>
      </div>
    );
  }

  const updateProvider = (
    input:
      | FederationProviderInput
      | Omit<FederationProviderInput, "provider_id" | "protocol" | "issuer">,
  ) => {
    sensitive(
      () =>
        mutation.mutate(
          input as Omit<
            FederationProviderInput,
            "provider_id" | "protocol" | "issuer"
          >,
        ),
      () => setSecret(""),
    );
  };

  return (
    <div className="space-y-5">
      {actions.dialog}
      <ProviderHeader
        provider={provider}
        manage={manage}
        editing={editing}
        toggleEditing={() => setEditing((value) => !value)}
        toggleEnabled={() => {
          if (
            provider.enabled &&
            !window.confirm(
              "Disable this provider? New federated logins will stop.",
            )
          ) {
            return;
          }
          sensitive(() => stateMutation.mutate(!provider.enabled));
        }}
        statePending={stateMutation.isPending}
      />

      <Notice
        error={
          error ??
          providerQuery.error ??
          mutation.error ??
          stateMutation.error ??
          rotateMutation.error ??
          certMutation.error ??
          revokeMutation.error
        }
        success={success}
      />

      {editing && manage ? (
        <Panel title="Edit provider">
          <ProviderForm
            protocol={provider.protocol}
            provider={provider}
            onSubmit={updateProvider}
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={() => setEditing(false)}
          />
        </Panel>
      ) : (
        <>
          <Panel title="Safe configuration">
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ["Issuer / entity", provider.issuer],
                ["Client ID", provider.client_id ?? "Not configured"],
                [
                  "Configuration",
                  provider.configuration_complete ? "Complete" : "Incomplete",
                ],
                ["Generation", provider.generation],
                ["Updated", provider.updated_at],
                ["Pending transactions", provider.pending_transactions],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt
                    className={
                      "text-xs font-semibold uppercase tracking-wide " +
                      "text-[var(--color-text-muted)]"
                    }
                  >
                    {label}
                  </dt>
                  <dd className="mt-1 break-all text-sm">{String(value)}</dd>
                </div>
              ))}
            </dl>
            {provider.protocol === "oidc" && (
              <div
                className={
                  "mt-5 space-y-2 rounded-md bg-[var(--color-surface-muted)] " +
                  "p-4 text-sm"
                }
              >
                <p>
                  <strong>Redirect URI:</strong>{" "}
                  <code className="break-all">
                    {provider.redirect_uri ?? "Not configured"}
                  </code>
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Client secret configured: {" "}
                  {provider.client_secret_configured
                    ? "yes (value hidden)"
                    : "no"}. Never use a masked value as a secret.
                </p>
              </div>
            )}
            {provider.protocol === "saml" && (
              <CertificatePanel
                provider={provider}
                certificates={certificates}
                setCertificates={setCertificates}
                manage={manage}
                mutation={certMutation}
                request={sensitive}
              />
            )}
          </Panel>

          <ProviderEndpointPanel
            provider={provider}
            publicOrigin={publicOrigin}
            canonicalRedirect={canonicalRedirect}
            canonicalAcs={canonicalAcs}
          />

          {manage && provider.protocol === "oidc" && (
            <Panel title="Rotate OIDC client secret">
              <p className="text-sm text-[var(--color-text-muted)]">
                Rotation replaces the existing secret, which is never readable
                here, and may invalidate pending authentication transactions.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  aria-label="New OIDC client secret"
                  type="password"
                  autoComplete="new-password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  className={
                    "min-h-10 flex-1 rounded-md border " +
                    "border-[var(--color-border)] bg-[var(--color-surface)] px-3"
                  }
                />
                <Button
                  disabled={!secret || rotateMutation.isPending}
                  onClick={() => {
                    if (!window.confirm("Rotate this client secret?")) return;
                    sensitive(
                      () => rotateMutation.mutate(secret),
                      () => setSecret(""),
                    );
                  }}
                >
                  {rotateMutation.isPending ? "Rotating…" : "Rotate secret"}
                </Button>
              </div>
            </Panel>
          )}

          {manage && (
            <Panel title="Pending authentication transactions">
              <p className="text-sm text-[var(--color-text-muted)]">
                Current pending count: {provider.pending_transactions}. Revocation
                invalidates pending transactions for this provider.
              </p>
              <Button
                className="mt-3"
                variant="danger"
                disabled={!provider.pending_transactions || revokeMutation.isPending}
                onClick={() => {
                  if (window.confirm("Revoke all pending transactions for this provider?")) {
                    sensitive(() => revokeMutation.mutate());
                  }
                }}
              >
                {revokeMutation.isPending
                  ? "Revoking…"
                  : "Revoke pending transactions"}
              </Button>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
