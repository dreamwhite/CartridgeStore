"use client";

import { useReview } from "./review/use-review";
import { ReviewQueue } from "./review/ReviewQueue";
import { ReviewSubmission } from "./review/ReviewSubmission";
import { WorkflowGuard } from "./WorkflowGuard";

export function ReviewWorkspace() {
  return <WorkflowGuard permission="submissions:read"><ReviewWorkspaceContent /></WorkflowGuard>;
}

function ReviewWorkspaceContent() {
  const state = useReview();
  return <div className="space-y-6"><header className="border-b border-[var(--color-border)] pb-6"><p className="technical-label text-[var(--color-primary)]">Moderation workspace</p><h1 className="mt-1 text-3xl font-bold">Review submissions</h1><p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">Inspect the queue, edit supported publication metadata, and record a decision.</p></header><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"><div><ReviewQueue state={state} /></div><ReviewSubmission state={state} /></div></div>;
}
