"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CURRENT_USER_QUERY_KEY,
  authErrorMessage,
  createAuthToken,
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  getPasskeys,
  reauthenticate,
  renamePasskey,
  revokePasskey,
  changePassword,
  getAuthTokens,
  revokeAuthToken,
  updateAuthToken,
} from "../../lib/api/auth";
import { ApiRequestError } from "../../lib/api/client";
import { Button } from "../ui/button";

function operationError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) return "This account is not allowed to manage API tokens.";
  return authErrorMessage(error, "session");
}

export function AccountWorkspace() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const tokens = useQuery({ queryKey: ["auth", "tokens"], queryFn: getAuthTokens, retry: false });
  const passkeys = useQuery({ queryKey: ["auth", "passkeys"], queryFn: getPasskeys, retry: false });
  const create = useMutation({
    mutationFn: () => createAuthToken(label),
    onSuccess: (result) => { setLabel(""); setNewToken(result.token); void queryClient.invalidateQueries({ queryKey: ["auth", "tokens"] }); },
  });
  const revoke = useMutation({
    mutationFn: (id: number) => revokeAuthToken(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["auth", "tokens"] }),
  });
  const rename = useMutation({
    mutationFn: ({ id, nextLabel }: { id: number; nextLabel: string }) => updateAuthToken(id, nextLabel),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["auth", "tokens"] }),
  });
  const passwordChange = useMutation({
    mutationFn: () => changePassword(currentPassword, password, passwordConfirm),
    onSuccess: () => { setCurrentPassword(""); setPassword(""); setPasswordConfirm(""); },
  });

  async function enrollPasskey() {
    const current = window.prompt("Enter your current password to authorize passkey enrollment.");
    if (current === null) return;
    const displayName = window.prompt("Name this passkey (for example: MacBook Touch ID).", "Passkey") ?? "Passkey";
    setPasskeyBusy(true); setPasskeyError("");
    try {
      await reauthenticate(current);
      const options = await beginPasskeyRegistration();
      const response = await startRegistration({ optionsJSON: options.options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
      await finishPasskeyRegistration(response, displayName);
      await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });
    } catch { setPasskeyError("Passkey enrollment could not be completed. Check the password and try again."); }
    finally { setPasskeyBusy(false); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Authenticated area</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Your account</h1>
        <p className="mt-3 text-[var(--color-text-muted)]">Session and token operations use the canonical Fastify authentication contract.</p>
      </section>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-xl font-bold">Password</h2>
        <form className="mt-5 grid gap-3 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); passwordChange.mutate(); }}>
          <label className="text-sm font-semibold">Current password<input className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
          <label className="text-sm font-semibold">New password<input className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /></label>
          <label className="text-sm font-semibold">Confirm password<input className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" required /></label>
          <Button className="sm:col-span-3 sm:justify-self-start" type="submit" disabled={passwordChange.isPending}>Change password</Button>
        </form>
        {passwordChange.data && <p className="mt-3 text-sm text-emerald-700" role="status">Password changed and other sessions were signed out.</p>}
        {passwordChange.error && <p className="mt-3 text-sm text-rose-700" role="alert">Password change failed. Check the current password and confirmation.</p>}
      </section>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="tokens-heading">
        <h2 id="tokens-heading" className="text-xl font-bold">API tokens</h2>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Token secrets are shown only once when created. Store them securely; they cannot be recovered here.</p>
        {newToken && <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status"><strong>New token:</strong> <code className="break-all">{newToken}</code><button className="ml-3 underline" type="button" onClick={() => setNewToken(null)}>Dismiss</button></div>}
        <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (label.trim()) create.mutate(); }}>
          <label className="flex-1 text-sm font-semibold">Label<input className="mt-2 min-h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Firmware client" maxLength={80} /></label>
          <Button className="self-end" type="submit" disabled={!label.trim() || create.isPending}>Create token</Button>
        </form>
        {(create.error || revoke.error || rename.error || tokens.error) && <p className="mt-4 text-sm text-rose-700" role="alert">{operationError(create.error ?? revoke.error ?? rename.error ?? tokens.error)}</p>}
        {tokens.isPending && <p className="mt-5 text-sm" role="status">Loading token metadata…</p>}
        {tokens.data?.tokens.length === 0 && <p className="mt-5 rounded-md bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">No API tokens have been created.</p>}
        {tokens.data && tokens.data.tokens.length > 0 && <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">{tokens.data.tokens.map((token) => <TokenRow key={token.id} id={token.id} label={token.label} lastUsed={token.last_used} disabled={revoke.isPending || rename.isPending} onRename={(nextLabel) => rename.mutate({ id: token.id, nextLabel })} onRevoke={() => { if (window.confirm(`Revoke ${token.label}?`)) revoke.mutate(token.id); }} />)}</ul>}
      </section>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="passkeys-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="passkeys-heading" className="text-xl font-bold">Passkeys</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Passkeys are optional. Password and generic OIDC/SAML recovery remain available.</p></div><Button type="button" onClick={() => void enrollPasskey()} disabled={passkeyBusy}>{passkeyBusy ? "Waiting for authenticator…" : "Add passkey"}</Button></div>
        {passkeyError && <p className="mt-4 text-sm text-rose-700" role="alert">{passkeyError}</p>}
        {passkeys.error && <p className="mt-4 text-sm text-[var(--color-text-muted)]">Passkey management is not enabled in this deployment.</p>}
        {passkeys.data?.credentials.length === 0 && <p className="mt-5 rounded-md bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">No passkeys are registered.</p>}
        {passkeys.data && passkeys.data.credentials.length > 0 && <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">{passkeys.data.credentials.map((credential) => <li key={credential.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{credential.display_name}</p><p className="text-xs text-[var(--color-text-muted)]">Added {credential.created_at}{credential.last_used_at ? ` · Last used ${credential.last_used_at}` : " · Never used"}{credential.revoked ? " · Revoked" : ""}</p></div><div className="flex gap-2"><Button type="button" variant="secondary" disabled={credential.revoked} onClick={() => { const name = window.prompt("New passkey name", credential.display_name); if (name?.trim()) void renamePasskey(credential.id, name.trim()).then(() => queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] })).catch(() => setPasskeyError("Passkey rename failed.")); }}>Rename</Button><Button type="button" variant="danger" disabled={credential.revoked} onClick={() => { if (window.confirm(`Remove ${credential.display_name}?`)) void revokePasskey(credential.id).then(() => queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] })).catch(() => setPasskeyError("Passkey removal failed.")); }}>Remove</Button></div></li>)}</ul>}
      </section>
      <button className="text-sm font-semibold text-violet-700 underline" type="button" onClick={() => { queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY }); router.replace("/login"); }}>Re-authenticate</button>
    </div>
  );
}

function TokenRow({ id, label, lastUsed, disabled, onRename, onRevoke }: { id: number; label: string; lastUsed: string; disabled: boolean; onRename: (label: string) => void; onRevoke: () => void }) {
  const [nextLabel, setNextLabel] = useState(label);
  return <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0 flex-1"><label className="text-sm font-semibold">Label<input className="mt-1 min-h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-normal" value={nextLabel} maxLength={80} onChange={(event) => setNextLabel(event.target.value)} /></label><p className="mt-1 text-xs text-[var(--color-text-muted)]">Last used: {lastUsed || "Never"} · ID {id}</p></div><div className="flex gap-2"><Button type="button" variant="secondary" disabled={disabled || !nextLabel.trim() || nextLabel === label} onClick={() => onRename(nextLabel.trim())}>Rename</Button><Button type="button" variant="danger" disabled={disabled} onClick={onRevoke}>Revoke</Button></div></li>;
}
