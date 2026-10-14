"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { completeRegistration, requestRegistration } from "../../lib/api/auth";
import { ApiRequestError } from "../../lib/api/client";
import { authIntegrationEnabled } from "../../lib/auth/config";
import { Button } from "../ui/button";

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 409) return "An account already exists for that email.";
    if (error.status === 400) return "Check the submitted registration details.";
    if (error.status === 403) return "Your session expired. Refresh and try again.";
  }
  return "Registration could not be completed. Try again later.";
}

export function RegisterPanel({ complete = false }: { complete?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const registration = useMutation({ mutationFn: () => requestRegistration(username.trim(), email.trim(), password, confirmation) });
  const completion = useMutation({
    mutationFn: () => completeRegistration(token.trim(), password, confirmation),
    onSuccess: () => router.replace("/account"),
  });

  if (!authIntegrationEnabled) return <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12"><section className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8"><h1 className="text-3xl font-bold">Registration unavailable</h1><p className="mt-3 text-[var(--color-text-muted)]">The isolated Fastify authentication integration is disabled in this environment.</p></section></main>;
  if (registration.data) return <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12"><section className="w-full rounded-xl border border-emerald-300 bg-emerald-50 p-8 text-emerald-950"><h1 className="text-3xl font-bold">Check your email</h1><p className="mt-3">If registration is enabled, a one-time completion link was issued for {registration.data.email}.</p><Link className="mt-6 inline-block font-semibold underline" href="/login">Return to sign in</Link></section></main>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (complete) completion.mutate();
    else registration.mutate();
  }

  return <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-12"><section className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm"><p className="text-sm font-semibold uppercase tracking-wide text-violet-700">PRG32 Cartridge Store</p><h1 className="mt-2 text-3xl font-bold">{complete ? "Complete registration" : "Create an account"}</h1><p className="mt-3 text-[var(--color-text-muted)]">{complete ? "Open the one-time link to activate your account." : "Choose your account name and password. We will send a one-time verification link."}</p><form className="mt-8 space-y-5" onSubmit={submit}>{complete ? <><label className="block text-sm font-semibold">Registration token<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="off" /></label><label className="block text-sm font-semibold">Password<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></label><label className="block text-sm font-semibold">Confirm password<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></label></> : <><label className="block text-sm font-semibold">Username<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" maxLength={80} /></label><label className="block text-sm font-semibold">Email<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label className="block text-sm font-semibold">Password<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></label><label className="block text-sm font-semibold">Confirm password<input className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-normal" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required autoComplete="new-password" /></label></>}{(registration.error || completion.error) && <p className="text-sm text-rose-700" role="alert">{errorMessage(registration.error ?? completion.error)}</p>}<Button type="submit" disabled={registration.isPending || completion.isPending}>{complete ? (completion.isPending ? "Completing…" : "Complete registration") : (registration.isPending ? "Requesting…" : "Request verification email")}</Button></form><p className="mt-6 text-sm text-[var(--color-text-muted)]"><Link className="font-semibold text-violet-700 underline" href="/login">Return to sign in</Link></p></section></main>;
}
