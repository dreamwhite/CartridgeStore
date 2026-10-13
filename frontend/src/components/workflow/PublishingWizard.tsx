"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "../ui/button";
import { submitBundle, workflowErrorMessage } from "../../lib/api/workflow";
import { useWorkflowPrincipal, WorkflowGuard, WorkflowMessage } from "./WorkflowGuard";

const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function PublishingWizard() {
  return <WorkflowGuard permission="catalog:submit"><PublishingWizardForm /></WorkflowGuard>;
}

function PublishingWizardForm() {
  const current = useWorkflowPrincipal();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const submission = useMutation({ mutationFn: (bundle: File) => submitBundle(bundle) });

  function selectFile(candidate: File | undefined) {
    setFileError(null);
    submission.reset();
    if (!candidate) { setFile(null); return; }
    if (!candidate.name.toLowerCase().endsWith(".zip")) { setFile(null); setFileError("Select a .zip cartridge bundle."); return; }
    if (candidate.size > MAX_BUNDLE_BYTES) { setFile(null); setFileError(`The bundle exceeds the client limit of ${formatBytes(MAX_BUNDLE_BYTES)}.`); return; }
    setFile(candidate);
  }

  if (submission.data) {
    return <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50 p-6 text-emerald-950">
      <h1 className="text-2xl font-bold">Submission received</h1>
      <p>Submission #{submission.data.submission_id} is pending review. It is not published automatically.</p>
      <p className="text-sm">Version: {submission.data.version} · Architectures: {submission.data.submitted.map((item) => item.architecture).join(", ") || "not reported"}</p>
      <Button type="button" variant="secondary" onClick={() => { submission.reset(); setFile(null); setStep(1); }}>Submit another bundle</Button>
    </section>;
  }

  return <div className="space-y-6">
    <header>
      <p className="text-sm font-semibold text-violet-700">Developer publishing</p>
      <h1 className="mt-1 text-3xl font-bold">Submit a cartridge</h1>
      <p className="mt-2 text-[var(--color-text-muted)]">The isolated Fastify workflow validates the bundle and creates a pending review submission.</p>
    </header>
    <ol aria-label="Publishing steps" className="grid gap-2 text-sm sm:grid-cols-4">
      {["Basics", "Bundle", "Server validation", "Review"].map((label, index) => <li key={label} className={`rounded-md border p-3 ${step === index + 1 ? "border-violet-600 bg-violet-50" : "border-[var(--color-border)]"}`}><span className="font-semibold">{index + 1}. </span>{label}</li>)}
    </ol>
    {step === 1 && <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-xl font-semibold">Bundle contract</h2>
      <p className="text-sm text-[var(--color-text-muted)]">The bundle manifest is authoritative. This UI does not duplicate backend metadata parsing or invent separate title/version fields.</p>
      <Button type="button" onClick={() => setStep(2)}>Continue</Button>
    </section>}
    {step === 2 && <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-xl font-semibold">Choose the ZIP bundle</h2>
      <input aria-label="Cartridge bundle" type="file" accept=".zip,application/zip" onChange={(event) => selectFile(event.target.files?.[0])} />
      {fileError && <p className="text-sm text-rose-700" role="alert">{fileError}</p>}
      <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setStep(1)}>Back</Button><Button type="button" onClick={() => setStep(3)} disabled={!file}>Continue</Button></div>
    </section>}
    {step === 3 && <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-xl font-semibold">Server-side validation</h2>
      <p className="text-sm text-[var(--color-text-muted)]">The server will validate the manifest, architectures, archive limits and cartridge files. Nothing is extracted in the browser.</p>
      <p className="rounded-md bg-[var(--color-surface-muted)] p-3 text-sm">{file?.name} · {file ? formatBytes(file.size) : "No file selected"}</p>
      <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setStep(2)}>Back</Button><Button type="button" onClick={() => setStep(4)} disabled={!file}>Continue</Button></div>
    </section>}
    {step === 4 && <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-xl font-semibold">Review and submit</h2>
      <p className="text-sm text-[var(--color-text-muted)]">{file?.name} will be sent once. The result remains pending until an authorized editor approves it.</p>
      {submission.error && <WorkflowMessage tone="error">{workflowErrorMessage(submission.error)}</WorkflowMessage>}
      <div className="flex gap-3"><Button type="button" variant="secondary" onClick={() => setStep(3)} disabled={submission.isPending}>Back</Button><Button type="button" onClick={() => file && submission.mutate(file)} disabled={!file || submission.isPending}>{submission.isPending ? "Uploading…" : "Submit for review"}</Button></div>
    </section>}
    {current.data?.user && <p className="text-xs text-[var(--color-text-muted)]">Submitting as {current.data.user.username}.</p>}
  </div>;
}
