"use client";

import { Field, Textarea } from "../../ui/input";
import { Button } from "../../ui/button";
import { WorkflowMessage } from "../WorkflowGuard";
import { workflowErrorMessage } from "../../../lib/api/workflow";
import type { ReviewState } from "./use-review";
import { EDITABLE_METADATA_FIELDS } from "./use-review";

export function ReviewSubmission({ state }: { state: ReviewState }) {
  const { selected, selectedId, detail, metadata, note, canApprove, canReject, approve, reject } = state;
  if (!selectedId) return <section className="surface-card p-5 sm:p-6"><div className="grid min-h-56 place-items-center text-center"><div><p className="technical-label text-[var(--color-text-muted)]">No selection</p><p className="mt-2 text-sm text-[var(--color-text-muted)]">Select a submission to inspect it.</p></div></div></section>;
  if (detail.isPending) return <section className="surface-card p-5 sm:p-6"><p role="status">Loading submission…</p></section>;
  if (detail.error) return <section className="surface-card p-5 sm:p-6"><WorkflowMessage tone="error">{workflowErrorMessage(detail.error)}</WorkflowMessage></section>;
  if (!selected) return <section className="surface-card p-5 sm:p-6"><WorkflowMessage tone="warning">The selected submission is no longer available.</WorkflowMessage></section>;
  const submission = selected;

  function approveSelected() {
    if (!canApprove || !window.confirm(`Approve submission #${submission.id}?`)) return;
    approve.mutate({ id: submission.id, nextMetadata: state.metadataForApproval(), nextNote: note });
  }

  function rejectSelected() {
    if (!canReject || !window.confirm(`Reject submission #${submission.id}?`)) return;
    reject.mutate({ id: submission.id, nextNote: note });
  }

  return <section className="surface-card p-5 sm:p-6"><div className="space-y-5"><div className="border-b border-[var(--color-border)] pb-4"><p className="technical-label text-[var(--color-primary)]">Submission #{selected.id}</p><h2 className="mt-1 text-2xl font-bold">{String(selected.metadata.title ?? selected.game_id)}</h2></div><dl className="grid gap-3 border-b border-[var(--color-border)] pb-5 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Status</dt><dd className="mt-1 font-semibold">{selected.status}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Version</dt><dd className="mt-1">{selected.version}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Submitted by</dt><dd className="mt-1">{selected.submitted_by}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Created</dt><dd className="mt-1">{selected.created_at}</dd></div></dl><div><h3 className="font-semibold">Editable publication metadata</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">Identity, version, authors and architectures remain immutable. Only backend-supported metadata fields are sent on approval.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{EDITABLE_METADATA_FIELDS.map((key) => <Field key={key} label={key} id={`review-${key}`} name={`review-${key}`} value={metadata[key] ?? ""} onChange={(event) => state.setMetadata((current) => ({ ...current, [key]: event.target.value }))} disabled={!canApprove} />)}</div></div><div><label className="grid gap-1.5 text-sm font-semibold" htmlFor="review-note">Reviewer note</label><Textarea id="review-note" name="review-note" className="mt-2" value={note} onChange={(event) => state.setNote(event.target.value)} maxLength={4000} disabled={!canApprove && !canReject} placeholder="Explain approval or required changes" /></div><div><h3 className="font-semibold">Architectures</h3><pre className="mt-2 overflow-auto rounded-md bg-[var(--color-surface-muted)] p-3 text-xs">{JSON.stringify(selected.architectures, null, 2)}</pre></div>{selected.review_history && selected.review_history.length > 0 && <div><h3 className="font-semibold">Decision history</h3><ul className="mt-2 space-y-2 text-sm">{selected.review_history.map((item, index) => <li key={`${String(item.decision_id)}-${index}`} className="rounded border border-[var(--color-border)] p-3"><strong>{String(item.decision)}</strong>{item.note ? <p className="mt-1 whitespace-pre-wrap">{String(item.note)}</p> : <p className="mt-1 text-[var(--color-text-muted)]">No note.</p>}</li>)}</ul></div>}<div className="flex flex-wrap gap-3">{canApprove && <Button type="button" loading={approve.isPending} onClick={approveSelected} disabled={reject.isPending}>Approve</Button>}{canReject && <Button type="button" variant="danger" loading={reject.isPending} onClick={rejectSelected} disabled={approve.isPending}>Reject</Button>}</div>{(approve.error || reject.error) && <WorkflowMessage tone="error">{workflowErrorMessage(approve.error ?? reject.error)}</WorkflowMessage>}{(approve.isSuccess || reject.isSuccess) && <p className="text-sm text-emerald-700" role="status">The submission status was updated.</p>}</div></section>;
}
