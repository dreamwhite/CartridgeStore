"use client";

import { Button } from "../../ui/button";
import { WorkflowMessage } from "../WorkflowGuard";
import { workflowErrorMessage } from "../../../lib/api/workflow";
import type { ReviewState } from "./use-review";

export function ReviewQueue({ state }: { state: ReviewState }) {
  const { status, selectedId, list } = state;
  return <>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Submission status">{["pending", "verified", "rejected", "all"].map((value) => <Button key={value} type="button" variant={status === value ? "primary" : "secondary"} onClick={() => state.selectStatus(value)}>{value}</Button>)}</div>
    {list.isPending && <WorkflowMessage>Loading submissions…</WorkflowMessage>}
    {list.error && <WorkflowMessage tone="error">{workflowErrorMessage(list.error)}</WorkflowMessage>}
    {list.data && <section className="surface-card p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="technical-label text-[var(--color-primary)]">Queue</p><h2 className="mt-1 font-semibold">{status} submissions</h2></div><span className="text-xs text-[var(--color-text-muted)]">{list.data.submissions.length} loaded</span></div>{list.data.submissions.length === 0 ? <p className="rounded-md bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">No submissions in this view.</p> : <ul className="space-y-2">{list.data.submissions.map((submission) => <li key={submission.id}><button className={`w-full rounded-md border p-3 text-left transition-colors hover:border-[var(--color-primary)] ${selectedId === submission.id ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]" : "border-[var(--color-border)]"}`} type="button" onClick={() => state.selectSubmission(submission)}><span className="font-semibold">#{submission.id} {String(submission.metadata.title ?? submission.game_id)}</span><span className="mt-1 block text-xs text-[var(--color-text-muted)]">{submission.status} · {submission.submitted_by}</span></button></li>)}</ul>}</section>}
  </>;
}
