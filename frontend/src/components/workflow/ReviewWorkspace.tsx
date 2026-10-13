"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { approveSubmission, getSubmission, listSubmissions, rejectSubmission, workflowErrorMessage } from "../../lib/api/workflow";
import { Button } from "../ui/button";
import { useWorkflowPrincipal, WorkflowGuard, WorkflowMessage } from "./WorkflowGuard";

export function ReviewWorkspace() {
  return <WorkflowGuard permission="submissions:read"><ReviewWorkspaceContent /></WorkflowGuard>;
}

function ReviewWorkspaceContent() {
  const current = useWorkflowPrincipal();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const list = useQuery({ queryKey: ["workflow", "submissions", status], queryFn: () => listSubmissions(status === "all" ? undefined : status), retry: false });
  const detail = useQuery({ queryKey: ["workflow", "submission", selectedId], queryFn: () => getSubmission(selectedId as number), enabled: selectedId !== null, retry: false });
  const mutationOptions = { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["workflow", "submissions"] }); queryClient.invalidateQueries({ queryKey: ["workflow", "submission", selectedId] }); } };
  const approve = useMutation({ mutationFn: ({ id, metadata }: { id: number; metadata: Record<string, unknown> }) => approveSubmission(id, metadata), ...mutationOptions });
  const reject = useMutation({ mutationFn: (id: number) => rejectSubmission(id), ...mutationOptions });
  const selected = detail.data?.submission;
  const canApprove = current.data?.user.permissions?.includes("submissions:review") && selected?.status === "pending";
  const canReject = current.data?.user.permissions?.includes("submissions:reject") && selected?.status === "pending";

  function metadataForSubmission(submission: NonNullable<typeof selected>): Record<string, string> {
    const next: Record<string, string> = {};
    for (const key of ["title", "summary", "description", "license", "homepage", "repository", "tags"]) {
      const value = submission.metadata[key];
      next[key] = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
    }
    return next;
  }

  function metadataForApproval(): Record<string, unknown> {
    const result: Record<string, unknown> = { ...metadata };
    result.tags = (metadata.tags ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return result;
  }

  function approveSelected() {
    if (!selected || !canApprove || !window.confirm(`Approve submission #${selected.id}?`)) return;
    approve.mutate({ id: selected.id, metadata: metadataForApproval() });
  }

  function rejectSelected() {
    if (!selected || !canReject || !window.confirm(`Reject submission #${selected.id}?`)) return;
    reject.mutate(selected.id);
  }

  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-violet-700">Editor workflow</p><h1 className="mt-1 text-3xl font-bold">Review submissions</h1><p className="mt-2 text-[var(--color-text-muted)]">Only the isolated Fastify review contract is used. Flask is not used as a fallback.</p></header>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Submission status">
      {["pending", "verified", "rejected", "all"].map((value) => <Button key={value} type="button" variant={status === value ? "primary" : "secondary"} onClick={() => { setStatus(value); setSelectedId(null); setMetadata({}); }}>{value}</Button>)}
    </div>
    {list.isPending && <WorkflowMessage>Loading submissions…</WorkflowMessage>}
    {list.error && <WorkflowMessage tone="error">{workflowErrorMessage(list.error)}</WorkflowMessage>}
    {list.data && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"><h2 className="mb-3 font-semibold">{status} submissions</h2>{list.data.submissions.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No submissions in this view.</p> : <ul className="space-y-2">{list.data.submissions.map((submission) => <li key={submission.id}><button className={`w-full rounded-md border p-3 text-left hover:border-violet-500 ${selectedId === submission.id ? "border-violet-600" : "border-[var(--color-border)]"}`} type="button" onClick={() => { setSelectedId(submission.id); setMetadata(metadataForSubmission(submission)); }}><span className="font-semibold">#{submission.id} {String(submission.metadata.title ?? submission.game_id)}</span><span className="mt-1 block text-xs text-[var(--color-text-muted)]">{submission.status} · {submission.submitted_by}</span></button></li>)}</ul>}</section>
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">{!selectedId && <p className="text-sm text-[var(--color-text-muted)]">Select a submission to inspect it.</p>}{detail.isPending && <p>Loading submission…</p>}{detail.error && <WorkflowMessage tone="error">{workflowErrorMessage(detail.error)}</WorkflowMessage>}{selected && <div className="space-y-4"><div><p className="text-sm text-[var(--color-text-muted)]">Submission #{selected.id}</p><h2 className="text-2xl font-bold">{String(selected.metadata.title ?? selected.game_id)}</h2></div><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Status</dt><dd>{selected.status}</dd></div><div><dt className="font-semibold">Version</dt><dd>{selected.version}</dd></div><div><dt className="font-semibold">Submitted by</dt><dd>{selected.submitted_by}</dd></div><div><dt className="font-semibold">Created</dt><dd>{selected.created_at}</dd></div></dl><div><h3 className="font-semibold">Editable publication metadata</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">Identity, version, authors and architectures remain immutable. Only backend-supported metadata fields are sent on approval.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{["title", "summary", "description", "license", "homepage", "repository", "tags"].map((key) => <label key={key} className="text-sm font-semibold">{key}<input className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-normal" value={metadata[key] ?? ""} onChange={(event) => setMetadata((currentMetadata) => ({ ...currentMetadata, [key]: event.target.value }))} disabled={!canApprove} /></label>)}</div></div><div><h3 className="font-semibold">Architectures</h3><pre className="mt-2 overflow-auto rounded-md bg-[var(--color-surface-muted)] p-3 text-xs">{JSON.stringify(selected.architectures, null, 2)}</pre></div><div className="flex flex-wrap gap-3">{canApprove && <Button type="button" onClick={approveSelected} disabled={approve.isPending || reject.isPending}>Approve</Button>}{canReject && <Button type="button" variant="danger" onClick={rejectSelected} disabled={approve.isPending || reject.isPending}>Reject</Button>}</div>{(approve.error || reject.error) && <WorkflowMessage tone="error">{workflowErrorMessage(approve.error ?? reject.error)}</WorkflowMessage>}{(approve.isSuccess || reject.isSuccess) && <p className="text-sm text-emerald-700" role="status">The submission status was updated.</p>}</div>}</section>
    </div>}
  </div>;
}
