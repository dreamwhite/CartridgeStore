"use client";

import { useState } from "react";
import { Button } from "../ui/button";
import { federationErrorMessage } from "../../lib/api/federation-admin";

export function ReauthenticationDialog({ open, busy, error, onCancel, onSubmit }: { open: boolean; busy: boolean; error: unknown; onCancel: () => void; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  if (!open) return null;
  const errorText = error ? federationErrorMessage(error) : "";
  return <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4" role="presentation">
    <section className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <h2 id="reauth-title" className="text-xl font-semibold">Confirm administrator identity</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">This protected operation requires a recent local administrator reauthentication. The password is sent only to the canonical backend endpoint and is never stored.</p>
      <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); const value = password; setPassword(""); onSubmit(value); }}>
        <label className="grid gap-1 text-sm font-medium"><span>Local administrator password</span><input autoFocus required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-normal" /></label>
        {errorText && <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">{errorText}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setPassword(""); onCancel(); }} disabled={busy}>Cancel</Button><Button disabled={busy || !password}>{busy ? "Checking…" : "Continue"}</Button></div>
      </form>
    </section>
  </div>;
}
