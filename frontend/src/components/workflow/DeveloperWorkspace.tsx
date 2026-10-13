"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useWorkflowPrincipal } from "./WorkflowGuard";
import { WorkflowMessage } from "./WorkflowGuard";
import { listMySubmissions, workflowErrorMessage } from "../../lib/api/workflow";

export function DeveloperWorkspace() {
  const current = useWorkflowPrincipal();
  const user = current.data?.user;
  const [page, setPage] = useState(1);
  const submissions = useQuery({
    queryKey: ["workflow", "submissions", "mine", page],
    queryFn: () => listMySubmissions(undefined, page, 25),
    enabled: Boolean(user?.authenticated),
    retry: false,
  });

  if (current.isPending) return <WorkflowMessage>Loading your workspace…</WorkflowMessage>;
  if (current.error) return <WorkflowMessage tone="error">{workflowErrorMessage(current.error)}</WorkflowMessage>;
  if (!user?.authenticated) return <WorkflowMessage tone="warning">Sign in is required to open the developer workspace.</WorkflowMessage>;

  const canSubmit = user.permissions?.includes("catalog:submit");
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <p className="text-sm text-[var(--color-text-muted)]">Signed in as</p>
        <h1 className="mt-1 text-2xl font-bold">{user.username}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Role: {user.role} · Groups: {user.groups.length ? user.groups.join(", ") : "none"}</p>
      </section>
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <h2 className="font-semibold">Ownership boundary</h2>
        <p className="mt-2 text-sm">Submission history is loaded from the authenticated ownership-scoped endpoint. Reviewer feedback and developer-owned detail routes are not part of the current backend contract.</p>
      </section>
      {submissions.isPending && <WorkflowMessage>Loading your submissions…</WorkflowMessage>}
      {submissions.error && <WorkflowMessage tone="error">{workflowErrorMessage(submissions.error)}</WorkflowMessage>}
      {submissions.data && <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">My submissions</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Only records owned by your authenticated user ID are returned.</p></div><Link className="text-sm font-semibold text-violet-700 hover:underline" href="/publish">Submit another</Link></div>{submissions.data.submissions.length === 0 ? <p className="mt-5 rounded-md bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">You have no submissions yet.</p> : <ul className="mt-5 space-y-3">{submissions.data.submissions.map((submission) => <li key={submission.id} className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{submission.title}</h3><p className="text-sm text-[var(--color-text-muted)]">#{submission.id} · {submission.game_id} · version {submission.version}</p><p className="text-xs text-[var(--color-text-muted)]">Submitted {submission.created_at}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${submission.status === "verified" ? "bg-emerald-100 text-emerald-800" : submission.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{submission.status === "verified" ? "Verified" : submission.status === "rejected" ? "Rejected" : "Pending review"}</span></li>)}</ul>}
        <nav aria-label="Submission pages" className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4"><span className="text-sm text-[var(--color-text-muted)]">Page {submissions.data.pagination.page} of {Math.max(submissions.data.pagination.pages, 1)}</span><div className="flex gap-2"><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => setPage(submissions.data?.pagination.prev_page ?? page - 1)} disabled={!submissions.data.pagination.has_prev}>Previous</button><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => setPage(submissions.data?.pagination.next_page ?? page + 1)} disabled={!submissions.data.pagination.has_next}>Next</button></div></nav>
      </section>}
      <div className="grid gap-4 sm:grid-cols-2">
        {canSubmit ? (
          <Link className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-violet-500" href="/publish">
            <h2 className="font-semibold">Submit a cartridge</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">Upload a bundle for review.</p>
          </Link>
        ) : <WorkflowMessage tone="warning">Your account does not have catalog submission permission.</WorkflowMessage>}
        <Link className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 hover:border-violet-500" href="/">
          <h2 className="font-semibold">Browse the store</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Return to the published catalog.</p>
        </Link>
      </div>
    </div>
  );
}
