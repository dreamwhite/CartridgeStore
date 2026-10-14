"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import {
  authErrorMessage,
  CURRENT_USER_QUERY_KEY,
  federatedLoginUrl,
  getAuthProviders,
  beginPasskeyLogin,
  finishPasskeyLogin,
  loginWithPassword,
} from "../../lib/api/auth";
import { authIntegrationEnabled } from "../../lib/auth/config";
import { safeReturnPath } from "../../lib/auth/return-path";
import { useCurrentUser } from "../../lib/auth/use-current-user";
import { Button } from "../ui/button";

type LoginPanelProps = {
  enabled?: boolean;
};

export function LoginPanel({ enabled = authIntegrationEnabled }: LoginPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const returnTo = useMemo(() => safeReturnPath(searchParams.get("return_to")), [searchParams]);
  const reason = searchParams.get("reason");
  const current = useCurrentUser(enabled);
  const providers = useQuery({
    queryKey: ["auth", "providers"],
    queryFn: getAuthProviders,
    enabled,
    retry: false,
    staleTime: 30_000,
  });
  const login = useMutation({
    mutationFn: () => loginWithPassword(username.trim(), password),
    onSuccess: async () => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      router.replace(returnTo);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password || login.isPending) return;
    login.mutate();
  }

  async function signInWithPasskey(username = "") {
    setPasskeyBusy(true); setPasskeyError("");
    try {
      const options = await beginPasskeyLogin(username);
      const response = await startAuthentication({ optionsJSON: options.options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      await finishPasskeyLogin(response);
      await queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
      router.replace(returnTo);
    } catch (error) {
      setPasskeyError(error instanceof Error ? "Passkey sign-in could not be completed. Use password sign-in or try again." : "Passkey sign-in is unavailable.");
    } finally { setPasskeyBusy(false); }
  }

  if (!enabled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12">
        <section className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm" aria-labelledby="auth-disabled-title">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Development integration</p>
          <h1 id="auth-disabled-title" className="mt-2 text-3xl font-bold tracking-tight">Authentication is disabled</h1>
          <p className="mt-3 text-[var(--color-text-muted)]">The isolated Fastify authentication target is not enabled in this environment.</p>
          <Link className="mt-6 inline-flex text-sm font-semibold text-violet-700 underline-offset-4 hover:underline" href="/">Return to the store</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
      <section className="grid w-full gap-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:p-10" aria-labelledby="login-title">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">PRG32 Cartridge Store</p>
          <h1 id="login-title" className="mt-2 text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-3 max-w-md text-[var(--color-text-muted)]">Use your Cartridge Store account to continue.</p>

          {reason === "expired" && <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">Your session expired. Please sign in again.</p>}
          {reason === "required" && <p className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">Sign in is required to view that page.</p>}
          {current.error && <p className="mt-5 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">{authErrorMessage(current.error, "session")}</p>}

          <form className="mt-8 space-y-5" onSubmit={submit}>
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="username">Username or email</label>
              <input
                id="username"
                name="username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
              />
            </div>
            {login.error && <p className="text-sm text-rose-700" role="alert">{authErrorMessage(login.error, "login")}</p>}
            <Button className="w-full" type="submit" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div className="mt-4 grid gap-2">
            <Button type="button" variant="secondary" disabled={passkeyBusy} onClick={() => void signInWithPasskey(username)}>{passkeyBusy ? "Waiting for passkey…" : "Sign in with a passkey"}</Button>
            <Button type="button" variant="secondary" disabled={passkeyBusy} onClick={() => void signInWithPasskey("")}>Use a discoverable passkey</Button>
          </div>
          {passkeyError && <p className="mt-3 text-sm text-rose-700" role="alert">{passkeyError}</p>}
        </div>

        <div className="border-t border-[var(--color-border)] pt-8 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <h2 className="text-lg font-semibold">Continue with a provider</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Available OIDC and SAML providers are supplied by the backend.</p>
          {providers.isPending && <p className="mt-6 text-sm text-[var(--color-text-muted)]" role="status">Loading providers…</p>}
          {providers.error && <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">{authErrorMessage(providers.error, "providers")} Local sign-in remains available.</p>}
          {!providers.isPending && !providers.error && providers.data?.providers.filter((provider) => provider.enabled).length === 0 && <p className="mt-6 text-sm text-[var(--color-text-muted)]">No federated providers are enabled.</p>}
          <div className="mt-6 space-y-3">
            {providers.data?.providers.filter((provider) => provider.enabled).map((provider) => (
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
          {current.user && <p className="mt-8 text-sm text-[var(--color-text-muted)]">Already signed in as <strong>{current.user.username}</strong>.</p>}
        </div>
      </section>
    </main>
  );
}
