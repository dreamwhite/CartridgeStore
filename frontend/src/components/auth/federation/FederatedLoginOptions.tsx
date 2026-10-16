"use client";

import { authErrorMessage, federatedLoginUrl } from "../../../lib/api/auth";
import { StatusMessage } from "../../ui/status";
import { useAuthProviders } from "./use-auth-providers";

type FederatedLoginOptionsProps = {
  enabled: boolean;
  returnTo: string;
};

export function FederatedLoginOptions({ enabled, returnTo }: FederatedLoginOptionsProps) {
  const providers = useAuthProviders(enabled);
  const enabledProviders = providers.data?.providers.filter((provider) => provider.enabled) ?? [];

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 sm:p-10 md:border-l md:border-t-0">
      <p className="technical-label text-[var(--color-primary)]">Federated access</p>
      <h2 className="mt-2 text-lg font-semibold">Continue with a provider</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">Available OIDC and SAML providers are supplied by the backend.</p>
      {providers.isPending && <p className="mt-6 text-sm text-[var(--color-text-muted)]" role="status">Loading providers…</p>}
      {providers.error && <StatusMessage tone="warning" role="alert" className="mt-6">{authErrorMessage(providers.error, "providers")} Local sign-in remains available.</StatusMessage>}
      {!providers.isPending && !providers.error && enabledProviders.length === 0 && <p className="mt-6 text-sm text-[var(--color-text-muted)]">No federated providers are enabled.</p>}
      <div className="mt-6 space-y-3">
        {enabledProviders.map((provider) => (
          <a
            key={`${provider.protocol}:${provider.provider_id}`}
            href={federatedLoginUrl(provider, returnTo)}
            className="flex min-h-11 items-center justify-between rounded-md border border-[var(--color-border)] px-4 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            <span>{provider.display_name}</span>
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{provider.protocol === "oidc" ? "OIDC" : "SAML 2.0"}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
