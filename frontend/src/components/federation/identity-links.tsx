"use client";

import type { FormEvent } from "react";

import { useCurrentUser } from "../../lib/auth/use-current-user";
import { Button } from "../ui/button";
import { hasFederationPermission } from "./FederationAdminGuard";
import { Field, Notice, Panel } from "./presentation";
import { useIdentityLinks } from "./use-identity-links";
import { useSensitiveActions } from "./use-sensitive-actions";

/** Manages explicit mappings between external identities and local users. */
export function IdentityLinks() {
  const current = useCurrentUser();
  const manage = hasFederationPermission(current.user, "federation:manage");
  const actions = useSensitiveActions();
  const {
    query,
    providers,
    form,
    setForm,
    success,
    link,
    retire,
    selectedProvider,
  } = useIdentityLinks();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProvider) return;
    actions.request(() => link.mutate(), undefined);
  };

  return (
    <div className="space-y-5">
      {actions.dialog}
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">
          Explicit mapping
        </p>
        <h2 className="mt-1 text-3xl font-bold">Identity links</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Links are keyed by protocol, provider, issuer, and external subject.
          Users are never created or matched by email.
        </p>
      </div>
      <Notice
        error={query.error ?? providers.error ?? link.error ?? retire.error}
        success={success}
      />
      {query.isLoading ? (
        <p role="status">Loading identity links…</p>
      ) : (
        <Panel title="Linked external identities">
          {query.data?.identities.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              No identity links are configured.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="p-2">Local user</th>
                    <th className="p-2">Provider</th>
                    <th className="p-2">External identity</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.identities.map((identity) => (
                    <tr
                      key={identity.id}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="p-2 font-mono">{identity.userId}</td>
                      <td className="p-2">
                        {identity.providerId}{" "}
                        <span className="text-xs uppercase text-[var(--color-text-muted)]">
                          {identity.protocol}
                        </span>
                      </td>
                      <td className="max-w-xs p-2">
                        <div className="break-all text-xs">
                          {identity.issuer}
                        </div>
                        <div className="break-all font-mono text-xs text-[var(--color-text-muted)]">
                          {identity.subject}
                        </div>
                      </td>
                      <td className="p-2">
                        {identity.unlinkedAt ? "Retired" : "Active"}
                      </td>
                      <td className="p-2">
                        {manage && !identity.unlinkedAt && (
                          <Button
                            variant="danger"
                            className="min-h-8 px-2 py-1 text-xs"
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Retire this identity link? Federated login through it may stop.",
                                )
                              ) {
                                actions.request(() => retire.mutate(identity.id));
                              }
                            }}
                          >
                            Retire
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {manage && (
        <Panel title="Create explicit identity link">
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={submit}
          >
            <label className="grid gap-1 text-sm font-medium">
              <span>Protocol *</span>
              <select
                required
                value={form.protocol}
                onChange={(event) =>
                  setForm({
                    ...form,
                    protocol: event.target.value as "oidc" | "saml",
                    provider_id: "",
                  })
                }
                className={
                  "min-h-10 rounded-md border border-[var(--color-border)] " +
                  "bg-[var(--color-surface)] px-3"
                }
              >
                <option value="oidc">OIDC</option>
                <option value="saml">SAML 2.0</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>Provider *</span>
              <select
                required
                value={form.provider_id}
                onChange={(event) => {
                  const value = event.target.value;
                  const provider = providers.data?.providers.find(
                    (item) => item.provider_id === value,
                  );
                  setForm({
                    ...form,
                    provider_id: value,
                    issuer: provider?.issuer ?? "",
                  });
                }}
                className={
                  "min-h-10 rounded-md border border-[var(--color-border)] " +
                  "bg-[var(--color-surface)] px-3"
                }
              >
                <option value="">Select a provider</option>
                {providers.data?.providers
                  .filter((provider) => provider.protocol === form.protocol)
                  .map((provider) => (
                    <option
                      key={provider.provider_id}
                      value={provider.provider_id}
                    >
                      {provider.display_name} ({provider.provider_id})
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label="Issuer"
              required
              value={form.issuer}
              onChange={(event) =>
                setForm({ ...form, issuer: event.target.value })
              }
              hint="Must exactly match the provider issuer."
            />
            <Field
              label="External subject"
              required
              value={form.subject}
              onChange={(event) =>
                setForm({ ...form, subject: event.target.value })
              }
            />
            <Field
              label="Existing local user ID"
              required
              type="number"
              min="1"
              value={form.user_id}
              onChange={(event) =>
                setForm({ ...form, user_id: event.target.value })
              }
              hint={
                "Use an existing enabled local account; no lookup or " +
                "automatic creation is performed."
              }
            />
            <div className="flex items-end">
              <Button disabled={!selectedProvider || link.isPending}>
                {link.isPending ? "Linking…" : "Create identity link"}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
