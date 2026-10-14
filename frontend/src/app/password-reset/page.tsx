"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { completePasswordReset } from "../../lib/api/auth";
import { Button } from "../../components/ui/button";

export default function PasswordResetPage() {
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const mutation = useMutation({ mutationFn: () => completePasswordReset(token.trim(), password, confirmation) });
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12"><section className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8"><h1 className="text-3xl font-bold">Reset password</h1>{mutation.data ? <p className="mt-4 text-emerald-700">Password reset complete. <Link className="underline" href="/login">Sign in</Link>.</p> : <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><label className="block text-sm font-semibold">Reset token<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="off" /></label><label className="block text-sm font-semibold">New password<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></label><label className="block text-sm font-semibold">Confirm password<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></label>{mutation.error && <p className="text-sm text-rose-700" role="alert">This reset link is invalid, expired, or already used.</p>}<Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Resetting…" : "Reset password"}</Button></form>}<Link className="mt-6 inline-block text-sm font-semibold text-violet-700 underline" href="/login">Return to sign in</Link></section></main>;
}
