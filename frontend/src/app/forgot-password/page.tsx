"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { requestPasswordReset } from "../../lib/api/auth";
import { Button } from "../../components/ui/button";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const mutation = useMutation({ mutationFn: () => requestPasswordReset(identifier.trim()) });
  return <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12"><section className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8"><h1 className="text-3xl font-bold">Forgot password</h1>{mutation.data ? <p className="mt-4 text-emerald-700">If the account is eligible, a reset link has been sent.</p> : <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><label className="block text-sm font-semibold">Email or username<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" /></label>{mutation.error && <p className="text-sm text-rose-700" role="alert">The reset request could not be completed.</p>}<Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Sending…" : "Send reset link"}</Button></form>}<Link className="mt-6 inline-block text-sm font-semibold text-violet-700 underline" href="/login">Return to sign in</Link></section></main>;
}
