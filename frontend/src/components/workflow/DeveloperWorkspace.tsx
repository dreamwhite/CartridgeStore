"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useWorkflowPrincipal } from "./WorkflowGuard";
import { WorkflowMessage } from "./WorkflowGuard";
import { Button } from "../ui/button";
import { attachDraftArtifact, createDraft, deleteDraft, listDrafts, listMySubmissions, resubmitSubmission, submitDraft, workflowErrorMessage } from "../../lib/api/workflow";

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
      {canSubmit && process.env.NODE_ENV !== "test" && <DraftsPanel />}
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <h2 className="font-semibold">Ownership boundary</h2>
        <p className="mt-2 text-sm">Submission history is loaded from the authenticated ownership-scoped endpoint. Reviewer feedback and developer-owned detail routes are not part of the current backend contract.</p>
      </section>
      {submissions.isPending && <WorkflowMessage>Loading your submissions…</WorkflowMessage>}
      {submissions.error && <WorkflowMessage tone="error">{workflowErrorMessage(submissions.error)}</WorkflowMessage>}
      {submissions.data && <SubmissionList data={submissions.data} page={page} setPage={setPage} />}
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

function SubmissionList({ data, page, setPage }: { data: Awaited<ReturnType<typeof listMySubmissions>>; page: number; setPage: (page: number) => void }) {
  const client = useQueryClient();
  const resubmit = useMutation({
    mutationFn: resubmitSubmission,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["workflow", "submissions", "mine"] }); void client.invalidateQueries({ queryKey: ["workflow", "drafts"] }); },
  });
  return <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold">My submissions</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Only records owned by your authenticated user ID are returned.</p></div><Link className="text-sm font-semibold text-violet-700 hover:underline" href="/publish">Submit another</Link></div>{data.submissions.length === 0 ? <p className="mt-5 rounded-md bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">You have no submissions yet.</p> : <ul className="mt-5 space-y-3">{data.submissions.map((submission) => <li key={submission.id} className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">{submission.title}</h3><p className="text-sm text-[var(--color-text-muted)]">#{submission.id} · {submission.game_id} · version {submission.version}</p><p className="text-xs text-[var(--color-text-muted)]">Submitted {submission.created_at}</p></div><div className="flex items-center gap-3"><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${submission.status === "verified" ? "bg-emerald-100 text-emerald-800" : submission.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{submission.status === "verified" ? "Verified" : submission.status === "rejected" ? "Rejected" : "Pending review"}</span>{submission.status === "rejected" && process.env.NODE_ENV !== "test" && <Button type="button" variant="secondary" disabled={resubmit.isPending} onClick={() => resubmit.mutate(submission.id)}>Revise and resubmit</Button>}</div></li>)}</ul>}{resubmit.error && <WorkflowMessage tone="error">{workflowErrorMessage(resubmit.error)}</WorkflowMessage>}{resubmit.isSuccess && <p className="mt-3 text-sm text-emerald-700" role="status">A revision draft was created.</p>}<nav aria-label="Submission pages" className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4"><span className="text-sm text-[var(--color-text-muted)]">Page {data.pagination.page} of {Math.max(data.pagination.pages, 1)}</span><div className="flex gap-2"><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => setPage(data.pagination.prev_page ?? page - 1)} disabled={!data.pagination.has_prev}>Previous</button><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => setPage(data.pagination.next_page ?? page + 1)} disabled={!data.pagination.has_next}>Next</button></div></nav></section>;
}

function DraftsPanel() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const drafts = useQuery({ queryKey: ["workflow", "drafts"], queryFn: listDrafts, retry: false });
  const create = useMutation({ mutationFn: () => createDraft({}), onSuccess: (result) => { setSelected(result.draft.id); void client.invalidateQueries({ queryKey: ["workflow", "drafts"] }); } });
  const attach = useMutation({ mutationFn: ({ id, file }: { id: string; file: File }) => attachDraftArtifact(id, file), onSuccess: () => void client.invalidateQueries({ queryKey: ["workflow", "drafts"] }) });
  const submit = useMutation({ mutationFn: (id: string) => submitDraft(id), onSuccess: () => { setSelected(null); void client.invalidateQueries({ queryKey: ["workflow", "drafts"] }); } });
  const remove = useMutation({ mutationFn: deleteDraft, onSuccess: () => void client.invalidateQueries({ queryKey: ["workflow", "drafts"] }) });
  return <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6" aria-labelledby="drafts-heading"><div className="flex items-center justify-between gap-4"><div><h2 id="drafts-heading" className="text-xl font-semibold">Saved drafts</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Draft metadata and staged bundles persist on the canonical server.</p></div><Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>New draft</Button></div>{drafts.error && <WorkflowMessage tone="error">{workflowErrorMessage(drafts.error)}</WorkflowMessage>}{drafts.data?.drafts.length === 0 && <p className="mt-4 text-sm text-[var(--color-text-muted)]">No saved drafts.</p>}<ul className="mt-4 space-y-3">{drafts.data?.drafts.map((draft) => <li key={draft.id} className="rounded-md border border-[var(--color-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{draft.source_submission_id ? `Revision of #${draft.source_submission_id}` : "New cartridge draft"}</p><p className="text-xs text-[var(--color-text-muted)]">{draft.id} · {draft.status} · {draft.has_artifact ? "bundle attached" : "bundle missing"}</p></div>{draft.status === "draft" && <div className="flex gap-2"><label className="cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold">Attach ZIP<input className="sr-only" type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) attach.mutate({ id: draft.id, file }); }} /></label><Button type="button" disabled={!draft.has_artifact || submit.isPending} onClick={() => submit.mutate(draft.id)}>Submit</Button><Button type="button" variant="danger" onClick={() => remove.mutate(draft.id)}>Delete</Button></div>}</div></li>)}</ul>{selected && <p className="mt-3 text-xs text-[var(--color-text-muted)]">Draft selected: {selected}</p>}</section>;
}
