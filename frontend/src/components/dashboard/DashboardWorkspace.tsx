"use client";

import type { LucideIcon } from "lucide-react";
import {
  Archive,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronRight,
  CirclePlus,
  FileCode2,
  FolderKanban,
  PackageCheck,
  Rocket,
  Store,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiRequestError } from "../../lib/api/client";
import { adminApi, AdminIntegrationUnavailableError, type AdminCartridge } from "../../lib/api/admin";
import { adminQueryKeys, workflowQueryKeys } from "../../lib/api/query-keys";
import { listDrafts, listMySubmissions, WorkflowIntegrationUnavailableError } from "../../lib/api/workflow";
import { useCurrentUser } from "../../lib/auth/use-current-user";
import type { OwnedSubmissionSummary, PublisherDraft } from "../../lib/api/contracts";
import { CartridgeArtwork } from "../storefront/CartridgeArtwork";
import { DashboardNav } from "./DashboardNav";
import {
  SettingsPanel,
} from "../admin/settings/SettingsPanel";
import type { SettingsSectionId } from "../admin/settings/settings-sections";
import { Badge, type BadgeVariant } from "../ui/badge";
import { Button } from "../ui/button";
import { StatusMessage } from "../ui/status";

function errorMessage(error: unknown): string {
  if (error instanceof WorkflowIntegrationUnavailableError) return "The publishing workflow is not available in this environment.";
  if (error instanceof AdminIntegrationUnavailableError) return "The catalog management service is not available in this environment.";
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Sign in is required to load this dashboard.";
    if (error.status === 403) return "Your account does not have permission to view this section.";
    if (error.status >= 500) return "The service is temporarily unavailable. Try again in a moment.";
  }
  return "Something went wrong while loading the dashboard.";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function submissionBadge(status: string): { label: string; variant: BadgeVariant } {
  if (status === "verified" || status === "published") return { label: "Published", variant: "published" };
  if (status === "rejected") return { label: "Changes requested", variant: "danger" };
  return { label: "In review", variant: "warning" };
}

function catalogBadge(action: AdminCartridge["moderation_action"]): { label: string; variant: BadgeVariant } {
  if (action === "unpublished") return { label: "Withdrawn", variant: "danger" };
  if (action === "hidden") return { label: "Hidden", variant: "warning" };
  return { label: "Live in store", variant: "published" };
}

function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: number; detail: string; icon: LucideIcon; tone?: "neutral" | "primary" | "success" | "warning" }) {
  const toneClass = tone === "primary" ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]" : tone === "success" ? "bg-[var(--color-success-soft)] text-[var(--color-success-foreground)]" : tone === "warning" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-foreground)]" : "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]";
  return (
    <section className="border-y border-[var(--color-border)] bg-transparent p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p><span className={`grid size-9 place-items-center rounded-lg ${toneClass}`}><Icon aria-hidden="true" className="size-4" /></span></div>
      <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{detail}</p>
    </section>
  );
}

function ActionCard({ href, eyebrow, title, description, icon: Icon, featured = false }: { href: string; eyebrow: string; title: string; description: string; icon: LucideIcon; featured?: boolean }) {
  return (
    <Link href={href} className={`group rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] ${featured ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]"}`}>
      <div className="flex items-start justify-between gap-4"><span className={`grid size-10 place-items-center rounded-lg ${featured ? "bg-white/15" : "bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"}`}><Icon aria-hidden="true" className="size-5" /></span><ArrowUpRight aria-hidden="true" className={`size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${featured ? "text-white/75" : "text-[var(--color-text-muted)]"}`} /></div>
      <p className={`mt-6 text-xs font-semibold uppercase tracking-[0.16em] ${featured ? "text-violet-100" : "text-[var(--color-primary)]"}`}>{eyebrow}</p>
      <h3 className="mt-2 text-lg font-bold">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${featured ? "text-violet-100" : "text-[var(--color-text-muted)]"}`}>{description}</p>
    </Link>
  );
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col justify-between gap-5 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-end"><div><p className="technical-label text-[var(--color-primary)]">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{description}</p></div>{action}</header>;
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function SubmissionRow({ submission }: { submission: OwnedSubmissionSummary }) {
  const badge = submissionBadge(submission.status);
  return <li className="flex flex-col gap-2 border-b border-[var(--color-border)] py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{submission.title}</h3><Badge variant={badge.variant}>{badge.label}</Badge></div><p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">{submission.game_id} · v{submission.version}</p></div><div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]"><span>{formatDate(submission.reviewed_at ?? submission.created_at)}</span><ChevronRight aria-hidden="true" className="size-4" /></div></li>;
}

function DraftRow({ draft }: { draft: PublisherDraft }) {
  return <li className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]"><FileCode2 aria-hidden="true" className="size-4" /></span><div className="min-w-0"><p className="truncate font-semibold">{draft.source_submission_id ? `Revision #${draft.source_submission_id}` : "New cartridge"}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{draft.has_artifact ? "Bundle attached" : "Bundle missing"} · updated {formatDate(draft.updated_at)}</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><Badge variant={draft.has_artifact ? "success" : "utility"}>{draft.status}</Badge><Button asChild size="sm" variant="secondary"><Link href="/dashboard/drafts">Open</Link></Button></div></li>;
}

function CatalogRow({ cartridge, onModerate, pending }: { cartridge: AdminCartridge; onModerate: (cartridge: AdminCartridge) => void; pending: boolean }) {
  const badge = catalogBadge(cartridge.moderation_action);
  const withdrawn = cartridge.moderation_action === "unpublished";
  return <li className="flex flex-col gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><CartridgeArtwork gameId={cartridge.id} version={cartridge.selected_version} kind="icon" alt={`${cartridge.title} icon`} className="size-14 shrink-0 rounded-lg border border-[var(--color-border)]" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold">{cartridge.title}</h2><Badge variant={badge.variant}>{badge.label}</Badge></div><p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">{cartridge.id} · v{cartridge.selected_version}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{cartridge.architectures.join(" · ")} · updated {formatDate(typeof cartridge.updated_at === "string" ? cartridge.updated_at : null)}</p></div></div><div className="flex shrink-0 items-center gap-2"><Link href={`/games/${encodeURIComponent(cartridge.id)}?version=${encodeURIComponent(cartridge.selected_version)}`} className="rounded-md px-3 py-2 text-xs font-semibold text-[var(--color-primary-strong)] hover:bg-[var(--color-primary-soft)]">View store</Link><Button size="sm" variant={withdrawn ? "secondary" : "danger"} loading={pending} onClick={() => onModerate(cartridge)}>{withdrawn ? "Restore" : "Withdraw"}</Button></div></li>;
}

export function DashboardWorkspace() {
  const hydrated = useHydrated();
  const current = useCurrentUser();
  const user = current.user;
  const canSubmit = Boolean(user?.permissions?.includes("catalog:submit"));
  const canManageCatalog = Boolean(user?.permissions?.includes("catalog:metadata:write"));
  const drafts = useQuery({ queryKey: workflowQueryKeys.drafts(), queryFn: listDrafts, enabled: canSubmit, retry: false });
  const submissions = useQuery({ queryKey: workflowQueryKeys.mine(1), queryFn: () => listMySubmissions(undefined, 1, 8), enabled: canSubmit, retry: false });
  const catalog = useQuery({ queryKey: adminQueryKeys.catalog({ moderation: true }), queryFn: () => adminApi.listModerationInventory({ page: 1, limit: 8 }), enabled: canManageCatalog, retry: false });

  if (!hydrated || current.isPending) return <DashboardFrame canSubmit={false}><DashboardLoading /></DashboardFrame>;
  if (current.error) return <DashboardFrame canSubmit={false}><StatusMessage tone="danger" className="p-5">{errorMessage(current.error)}</StatusMessage></DashboardFrame>;
  if (!user) return <DashboardFrame canSubmit={false}><StatusMessage tone="warning" className="p-5">Sign in is required to use the developer dashboard.</StatusMessage></DashboardFrame>;

  const draftItems = drafts.data?.drafts ?? [];
  const submissionItems = submissions.data?.submissions ?? [];
  const catalogItems = catalog.data?.cartridges ?? [];
  const metrics = {
    drafts: draftItems.filter((item) => item.status === "draft").length,
    inReview: submissionItems.filter((item) => item.status !== "verified" && item.status !== "rejected").length,
    published: catalogItems.filter((item) => item.moderation_action !== "unpublished" && item.moderation_action !== "hidden").length,
    withdrawn: catalogItems.filter((item) => item.moderation_action === "unpublished").length,
  };
  const workflowError = drafts.error ?? submissions.error;
  const catalogError = catalog.error;

  return <DashboardFrame canSubmit={canSubmit}><div className="space-y-8">
    <section className="relative overflow-hidden rounded-2xl bg-[#2a2041] p-6 text-white shadow-[0_18px_40px_rgb(46_32_86_/_0.16)] sm:p-8 lg:p-10"><div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-50 lg:block" style={{ backgroundImage: "linear-gradient(rgb(255 255 255 / .08) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / .08) 1px, transparent 1px)", backgroundSize: "2rem 2rem", maskImage: "linear-gradient(90deg, transparent, black)" }} /><div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-center"><div className="max-w-2xl"><p className="technical-label text-violet-200">Developer console</p><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Build, publish, repeat.</h1><p className="mt-4 max-w-xl text-sm leading-7 text-violet-100 sm:text-base">Manage your PRG32 cartridges from one place: keep drafts private, send releases to review, and control what stays visible in the public store.</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild size="lg" className="bg-white text-[#2a2041] shadow-none hover:bg-violet-100"><Link href="/dashboard/publish"><CirclePlus aria-hidden="true" className="size-4" />Create a cartridge</Link></Button><Button asChild size="lg" variant="outline" className="border-white/40 text-white hover:border-white/70 hover:bg-white/10 hover:text-white"><Link href="/explore"><Store aria-hidden="true" className="size-4" />Open store</Link></Button></div></div><div className="relative hidden w-64 shrink-0 rounded-xl border border-white/15 bg-black/20 p-4 lg:block"><div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200"><span>Pipeline</span><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-300" />Live</span></div><div className="mt-5 space-y-3"><div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-md bg-white/10"><FileCode2 className="size-3.5" /></span><div className="h-1.5 flex-1 rounded-full bg-white/15"><div className="h-full w-1/3 rounded-full bg-violet-300" /></div></div><div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-md bg-white/10"><UploadCloud className="size-3.5" /></span><div className="h-1.5 flex-1 rounded-full bg-white/15"><div className="h-full w-2/3 rounded-full bg-violet-300" /></div></div><div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-md bg-white/10"><PackageCheck className="size-3.5" /></span><div className="h-1.5 flex-1 rounded-full bg-white/15"><div className="h-full w-full rounded-full bg-emerald-300" /></div></div></div><p className="mt-5 text-xs text-violet-200">Draft → review → store</p></div></div></section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Dashboard summary"><MetricCard label="Published" value={metrics.published} detail="Visible in the store" icon={PackageCheck} tone="success" /><MetricCard label="In review" value={metrics.inReview} detail="Waiting for an editor" icon={UploadCloud} tone="warning" /><MetricCard label="Drafts" value={metrics.drafts} detail="Private work in progress" icon={FileCode2} tone="primary" /><MetricCard label="Withdrawn" value={metrics.withdrawn} detail="Removed from public view" icon={Archive} /></section>

    <section><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="technical-label text-[var(--color-primary)]">Workspace</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Move an idea forward</h2></div><p className="text-sm text-[var(--color-text-muted)]">Choose a workspace to continue.</p></div><div className="mt-4 grid gap-4 md:grid-cols-3"><ActionCard href="/dashboard/publish" eyebrow="Start here" title="Create a cartridge" description="Upload a .prg32 bundle and send it through server validation." icon={CirclePlus} featured={canSubmit} /><ActionCard href="/dashboard/drafts" eyebrow="Keep building" title="Continue a draft" description="Return to private staging and attach the next bundle revision." icon={FolderKanban} /><ActionCard href="/dashboard/cartridges" eyebrow="Ship with confidence" title="Manage releases" description="Review store visibility and withdraw a release without deleting its data." icon={CheckCircle2} /></div></section>

    {workflowError && <StatusMessage tone="warning" className="p-4">{errorMessage(workflowError)}</StatusMessage>}{catalogError && <StatusMessage tone="warning" className="p-4">{errorMessage(catalogError)}</StatusMessage>}

    <section className="border-y border-[var(--color-border)] py-5 sm:py-6">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="technical-label text-[var(--color-primary)]">
            Release pipeline
          </p>
          <h2 className="mt-1 text-lg font-bold">Recent submissions</h2>
        </div>
        <Link
          href="/dashboard/cartridges"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary-strong)] hover:underline"
        >
          View all
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      {!canSubmit ? (
        <p className="py-6 text-sm text-[var(--color-text-muted)]">
          Your account does not have cartridge submission permission.
        </p>
      ) : submissions.isPending ? (
        <p className="py-6 text-sm text-[var(--color-text-muted)]">
          Loading your release pipeline…
        </p>
      ) : submissionItems.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">No releases yet</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Start with a cartridge bundle and your first release will appear here.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/dashboard/publish">
              <Rocket aria-hidden="true" className="size-4" />
              Create first release
            </Link>
          </Button>
        </div>
      ) : (
        <ul>
          {submissionItems
            .slice(0, 5)
            .map((submission) => (
              <SubmissionRow key={submission.id} submission={submission} />
            ))}
        </ul>
      )}
    </section>
  </div></DashboardFrame>;
}

export function DashboardDraftsWorkspace() {
  const hydrated = useHydrated();
  const current = useCurrentUser();
  const user = current.user;
  const canSubmit = Boolean(user?.permissions?.includes("catalog:submit"));
  const drafts = useQuery({ queryKey: workflowQueryKeys.drafts(), queryFn: listDrafts, enabled: canSubmit, retry: false });
  if (!hydrated || current.isPending) return <DashboardFrame canSubmit={false}><DashboardLoading /></DashboardFrame>;
  if (current.error) return <DashboardFrame canSubmit={false}><StatusMessage tone="danger" className="p-5">{errorMessage(current.error)}</StatusMessage></DashboardFrame>;
  if (!user) return <DashboardFrame canSubmit={false}><StatusMessage tone="warning" className="p-5">Sign in is required to view drafts.</StatusMessage></DashboardFrame>;
  const items = drafts.data?.drafts ?? [];
  return <DashboardFrame canSubmit={canSubmit}><div className="space-y-6"><PageHeader eyebrow="Private staging" title="Drafts" description="Keep unfinished cartridges private until the bundle and metadata are ready for review." action={<Button asChild><Link href="/dashboard/publish"><CirclePlus aria-hidden="true" className="size-4" />New cartridge</Link></Button>} />{drafts.error ? <StatusMessage tone="warning" className="p-4">{errorMessage(drafts.error)}</StatusMessage> : drafts.isPending ? <DashboardLoading /> : items.length === 0 ? <section className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"><FileCode2 aria-hidden="true" className="size-5" /></span><h2 className="mt-4 text-lg font-bold">Nothing in staging</h2><p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">Create a cartridge when you are ready to start a private release.</p><Button asChild className="mt-5"><Link href="/dashboard/publish">Create a draft</Link></Button></section> : <ul className="grid gap-3">{items.map((draft) => <DraftRow key={draft.id} draft={draft} />)}</ul>}</div></DashboardFrame>;
}

export function DashboardCartridgesWorkspace() {
  const hydrated = useHydrated();
  const current = useCurrentUser();
  const queryClient = useQueryClient();
  const user = current.user;
  const canSubmit = Boolean(user?.permissions?.includes("catalog:submit"));
  const canManageCatalog = Boolean(user?.permissions?.includes("catalog:metadata:write"));
  const catalog = useQuery({ queryKey: adminQueryKeys.catalog({ moderation: true }), queryFn: () => adminApi.listModerationInventory({ page: 1, limit: 24 }), enabled: canManageCatalog, retry: false });
  const moderation = useMutation({ mutationFn: ({ cartridge, action }: { cartridge: AdminCartridge; action: "unpublished" | "restored" }) => adminApi.moderateCartridge(cartridge.id, cartridge.selected_version, action, action === "unpublished" ? "Withdrawn from the developer dashboard" : "Restored from the developer dashboard"), onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminQueryKeys.catalogRoot() }) });
  function moderate(cartridge: AdminCartridge) {
    const withdrawn = cartridge.moderation_action === "unpublished";
    if (!withdrawn && !window.confirm(`Withdraw ${cartridge.title} from the public store?`)) return;
    moderation.mutate({ cartridge, action: withdrawn ? "restored" : "unpublished" });
  }
  if (!hydrated || current.isPending) return <DashboardFrame canSubmit={false}><DashboardLoading /></DashboardFrame>;
  if (current.error) return <DashboardFrame canSubmit={false}><StatusMessage tone="danger" className="p-5">{errorMessage(current.error)}</StatusMessage></DashboardFrame>;
  if (!user) return <DashboardFrame canSubmit={false}><StatusMessage tone="warning" className="p-5">Sign in is required to view cartridges.</StatusMessage></DashboardFrame>;
  const items = catalog.data?.cartridges ?? [];
  return <DashboardFrame canSubmit={canSubmit}><div className="space-y-6"><PageHeader eyebrow="Store control" title="My cartridges" description="See what is live, inspect the public detail page, and withdraw a release without deleting its cartridge data." action={<Button asChild><Link href="/dashboard/publish"><CirclePlus aria-hidden="true" className="size-4" />Publish new</Link></Button>} />{!canManageCatalog ? <StatusMessage tone="warning" className="p-4">Your account does not have permission to manage catalog visibility.</StatusMessage> : catalog.error ? <StatusMessage tone="warning" className="p-4">{errorMessage(catalog.error)}</StatusMessage> : catalog.isPending ? <DashboardLoading /> : items.length === 0 ? <section className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]"><Box aria-hidden="true" className="size-5" /></span><h2 className="mt-4 text-lg font-bold">No releases in the catalog</h2><p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">Publish a validated cartridge to see its store visibility here.</p><Button asChild className="mt-5"><Link href="/dashboard/publish">Publish a cartridge</Link></Button></section> : <ul className="grid gap-3">{items.map((cartridge) => <CatalogRow key={`${cartridge.id}/${cartridge.selected_version}`} cartridge={cartridge} onModerate={moderate} pending={moderation.isPending} />)}</ul>}</div></DashboardFrame>;
}

export function DashboardSettingsWorkspace({
  section,
}: {
  section: SettingsSectionId;
}) {
  const hydrated = useHydrated();
  const current = useCurrentUser();
  const user = current.user;
  const canSubmit = Boolean(user?.permissions?.includes("catalog:submit"));

  if (!hydrated || current.isPending) return <DashboardFrame canSubmit={false}><DashboardLoading /></DashboardFrame>;
  if (current.error) return <DashboardFrame canSubmit={false}><StatusMessage tone="danger" className="p-5">{errorMessage(current.error)}</StatusMessage></DashboardFrame>;
  if (!user) return <DashboardFrame canSubmit={false}><StatusMessage tone="warning" className="p-5">Sign in is required to view developer settings.</StatusMessage></DashboardFrame>;

  return <DashboardFrame canSubmit={canSubmit}><div className="space-y-8"><PageHeader eyebrow="Developer settings" title="Settings" description="Manage one focused area of the Cartridge Store configuration at a time." /><SettingsPanel section={section} /></div></DashboardFrame>;
}

export function DashboardFrame({ children, canSubmit }: { children: ReactNode; canSubmit: boolean }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[var(--color-surface-muted)]">
      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="dashboard-sidebar border-b border-[var(--color-border)] px-4 py-5 lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="technical-label text-[var(--color-primary)]">
                Store workspace
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight">
                Developer dashboard
              </h2>
              <p className="mt-1 hidden text-xs leading-5 text-[var(--color-text-muted)] lg:block">
                Build and manage cartridges for the PRG32 Store.
              </p>
            </div>
            <Link
              href="/dashboard/publish"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-[var(--shadow-brand)] hover:bg-[var(--color-primary-strong)] lg:hidden"
            >
              <CirclePlus aria-hidden="true" className="size-3.5" />
              New
            </Link>
          </div>

          <div className="mt-7 overflow-x-auto border-t border-[var(--color-border)] pt-6 pb-1 lg:mt-9 lg:overflow-visible">
            <DashboardNav canSubmit={canSubmit} />
          </div>

          <Link
            href="/docs"
            className="mt-auto hidden items-center gap-2 border-t border-[var(--color-border)] pt-5 text-sm font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary-strong)] lg:flex"
          >
            <BookOpen aria-hidden="true" className="size-4" />
            <span>Cartridge docs</span>
            <ChevronRight aria-hidden="true" className="ml-auto size-4" />
          </Link>
        </aside>
        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-10 lg:py-8 xl:px-14">
          {children}
        </main>
      </div>
    </div>
  );
}

export function DashboardLoading() {
  return <div className="space-y-5" aria-busy="true"><div className="h-36 animate-pulse rounded-2xl bg-[var(--color-surface)]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-[var(--color-surface)]" />)}</div></div>;
}
