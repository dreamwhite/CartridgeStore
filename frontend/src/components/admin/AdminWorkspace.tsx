"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react";

import {
  AdminIntegrationUnavailableError,
  adminApi,
  clearAdminSessionState,
  type AdminCartridge,
  type AdminGroup,
  type AdminRole,
  type AdminToken,
  type AdminUser,
} from "../../lib/api/admin";
import { ApiRequestError } from "../../lib/api/client";
import { Button } from "../ui/button";
import { useAdminStore, type AdminSection } from "../../stores/admin-store";

type Permission = string;

const NAV_ITEMS: Array<{ section: AdminSection; label: string; permission: Permission }> = [
  { section: "settings", label: "Settings", permission: "settings:read" },
  { section: "users", label: "Users", permission: "users:read" },
  { section: "groups", label: "Groups", permission: "groups:read" },
  { section: "roles", label: "Roles", permission: "roles:read" },
  { section: "tokens", label: "Tokens", permission: "tokens:read:any" },
  { section: "catalog", label: "Catalog", permission: "catalog:metadata:write" },
  { section: "backup", label: "Backup", permission: "backup:export" },
];

function errorMessage(error: unknown): string {
  if (error instanceof AdminIntegrationUnavailableError) return "Fastify admin isolato non configurato in questo ambiente.";
  if (error instanceof ApiRequestError) return error.body?.error ?? "Operazione amministrativa rifiutata.";
  if (error instanceof Error) return error.message;
  return "Operazione amministrativa non riuscita.";
}

function Notice({ error, success }: { error?: unknown; success?: string }) {
  if (error) return <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">{errorMessage(error)}</p>;
  if (success) return <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p>;
  return null;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm"><div><h2 className="text-xl font-semibold">{title}</h2></div>{children}</section>;
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-1 text-sm font-medium"><span>{label}</span><input {...props} className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-normal text-[var(--color-text)]" /></label>;
}

function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-md border border-[var(--color-border)]"><table className="w-full border-collapse text-left text-sm">{children}</table></div>;
}

function SettingsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "settings"], queryFn: adminApi.getSettings, retry: false });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [success, setSuccess] = useState("");
  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => adminApi.updateSettings(patch),
    onSuccess: () => { setSuccess("Settings salvate."); void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }); },
  });
  const initialValues = useMemo(() => query.data ? Object.fromEntries(Object.entries(query.data.settings).filter(([, setting]) => setting.writable).map(([key, setting]) => [key, setting.value])) : {}, [query.data]);
  const values = Object.keys(draft).length ? draft : initialValues;
  const writable = query.data ? Object.entries(query.data.settings).filter(([, setting]) => setting.writable) : [];
  return <Panel title="Settings"><Notice error={query.error ?? mutation.error} success={mutation.isSuccess ? success : ""} />{query.isLoading ? <p>Loading settings…</p> : <><div className="grid gap-4 md:grid-cols-2">{writable.map(([key]) => <Field key={key} label={key} value={String(values[key] ?? "")} onChange={(event) => setDraft((current) => ({ ...values, ...current, [key]: event.target.value }))} />)}</div><Button disabled={mutation.isPending} onClick={() => { setSuccess(""); mutation.mutate(values); }}>{mutation.isPending ? "Saving…" : "Save settings"}</Button><div className="grid gap-4 md:grid-cols-2"><AssetUpload kind="logo" onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] })} /><AssetUpload kind="favicon" onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] })} /></div></>}</Panel>;
}

function AssetUpload({ kind, onSuccess }: { kind: "logo" | "favicon"; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({ mutationFn: () => { if (!file) throw new Error("Select a file first."); return adminApi.uploadAsset(kind, file); }, onSuccess });
  return <div className="space-y-2 rounded-md border border-[var(--color-border)] p-3"><p className="text-sm font-semibold">{kind} asset</p><input aria-label={`${kind} asset`} type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Button variant="secondary" disabled={!file || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Uploading…" : "Upload"}</Button><Notice error={mutation.error} success={mutation.isSuccess ? "Asset updated." : ""} /></div>;
}

function UsersPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => adminApi.listUsers({ page: 1, limit: 100 }), retry: false });
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: adminApi.getRoles, retry: false });
  const groups = useQuery({ queryKey: ["admin", "groups"], queryFn: () => adminApi.listGroups(), retry: false });
  const selected = useQuery({ queryKey: ["admin", "user", selectedId], queryFn: () => adminApi.getUser(selectedId as number), enabled: selectedId !== null, retry: false });
  const create = useMutation({ mutationFn: () => adminApi.createUser({ username, email, password, password_confirm: password }), onSuccess: () => { setUsername(""); setEmail(""); setPassword(""); void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); } });
  const update = useMutation({ mutationFn: (input: Record<string, unknown>) => adminApi.updateUser(selectedId as number, input), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); void queryClient.invalidateQueries({ queryKey: ["admin", "user", selectedId] }); } });
  const remove = useMutation({ mutationFn: () => adminApi.deleteUser(selectedId as number), onSuccess: () => { setSelectedId(null); void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); } });
  const roleMutation = useMutation({ mutationFn: (role: string) => adminApi.setUserRole(selectedId as number, role), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "user", selectedId] }); void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); } });
  const groupsMutation = useMutation({ mutationFn: (ids: number[]) => adminApi.replaceUserGroups(selectedId as number, ids), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "user", selectedId] }); void queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); } });
  return <Panel title="Users"><Notice error={users.error ?? selected.error ?? create.error ?? update.error ?? remove.error ?? roleMutation.error ?? groupsMutation.error} success={create.isSuccess ? "User created." : ""} /><div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]"><div className="space-y-4"><Table><thead><tr className="border-b border-[var(--color-border)]"><th className="p-3">Username</th><th className="p-3">Email</th><th className="p-3">Role</th></tr></thead><tbody>{(users.data?.users ?? []).map((user) => <tr key={user.id} className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]" onClick={() => setSelectedId(user.id)}><td className="p-3 font-medium">{user.username}</td><td className="p-3">{user.email}</td><td className="p-3">{user.role}</td></tr>)}</tbody></Table><form className="grid gap-3 rounded-md border border-[var(--color-border)] p-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><h3 className="font-semibold">Create user</h3><Field label="Username" value={username} required onChange={(event) => setUsername(event.target.value)} /><Field label="Email" type="email" value={email} required onChange={(event) => setEmail(event.target.value)} /><Field label="Password" type="password" value={password} required onChange={(event) => setPassword(event.target.value)} /><Button disabled={create.isPending}>{create.isPending ? "Creating…" : "Create user"}</Button></form></div><div className="space-y-4">{selectedId === null ? <p className="text-sm text-[var(--color-text-muted)]">Select a user to manage role, groups, or account data.</p> : selected.data?.user ? <UserEditor user={selected.data.user} roles={roles.data?.roles ?? []} groups={groups.data?.groups ?? []} onUpdate={(input) => update.mutate(input)} onRole={(role) => roleMutation.mutate(role)} onGroups={(ids) => groupsMutation.mutate(ids)} onDelete={() => { if (window.confirm("Delete this user?")) remove.mutate(); }} /> : <p>Loading user…</p>}</div></div></Panel>;
}

function UserEditor({ user, roles, groups, onUpdate, onRole, onGroups, onDelete }: { user: AdminUser; roles: AdminRole[]; groups: AdminGroup[]; onUpdate: (input: Record<string, unknown>) => void; onRole: (role: string) => void; onGroups: (ids: number[]) => void; onDelete: () => void }) {
  const [email, setEmail] = useState(user.email);
  const [selectedGroups, setSelectedGroups] = useState(user.groups.map((group) => group.id));
  return <div className="space-y-4 rounded-md border border-[var(--color-border)] p-4"><h3 className="font-semibold">Edit {user.username}</h3><Field label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /><Button variant="secondary" onClick={() => onUpdate({ email })}>Save email</Button><label className="grid gap-1 text-sm font-medium"><span>Role</span><select className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3" value={user.role} onChange={(event) => onRole(event.target.value)}>{roles.map((role) => <option key={role.name}>{role.name}</option>)}</select></label><fieldset className="space-y-2"><legend className="text-sm font-semibold">Groups</legend>{groups.map((group) => <label key={group.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedGroups.includes(group.id)} disabled={group.name === "editors"} onChange={(event) => setSelectedGroups((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} />{group.name}</label>)}<Button variant="secondary" onClick={() => onGroups(selectedGroups)}>Save groups</Button></fieldset><Button variant="danger" onClick={onDelete}>Delete user</Button></div>;
}

function GroupsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const groups = useQuery({ queryKey: ["admin", "groups"], queryFn: () => adminApi.listGroups(), retry: false });
  const create = useMutation({ mutationFn: () => adminApi.createGroup(name), onSuccess: () => { setName(""); void queryClient.invalidateQueries({ queryKey: ["admin", "groups"] }); } });
  const rename = useMutation({ mutationFn: ({ id, name: value }: { id: number; name: string }) => adminApi.renameGroup(id, value), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "groups"] }) });
  const remove = useMutation({ mutationFn: (id: number) => adminApi.deleteGroup(id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "groups"] }) });
  return <Panel title="Groups"><Notice error={groups.error ?? create.error ?? rename.error ?? remove.error} success={create.isSuccess ? "Group created." : ""} /><Table><thead><tr className="border-b border-[var(--color-border)]"><th className="p-3">Name</th><th className="p-3">Users</th><th className="p-3">Actions</th></tr></thead><tbody>{(groups.data?.groups ?? []).map((group) => <GroupRow key={group.id} group={group} onRename={(value) => rename.mutate({ id: group.id, name: value })} onDelete={() => { if (window.confirm(`Delete ${group.name}?`)) remove.mutate(group.id); }} />)}</tbody></Table><form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}><Field label="New group" value={name} onChange={(event) => setName(event.target.value)} required /><Button disabled={!name || create.isPending}>Create group</Button></form></Panel>;
}

function GroupRow({ group, onRename, onDelete }: { group: AdminGroup; onRename: (name: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(group.name);
  const protectedGroup = group.name === "editors";
  return <tr className="border-b border-[var(--color-border)] last:border-0"><td className="p-3"><input className="w-full rounded border border-[var(--color-border)] bg-transparent px-2 py-1" value={name} disabled={protectedGroup} onChange={(event) => setName(event.target.value)} /></td><td className="p-3">{group.user_count}</td><td className="flex gap-2 p-3"><Button variant="secondary" disabled={protectedGroup} onClick={() => onRename(name)}>Rename</Button><Button variant="danger" disabled={protectedGroup} onClick={onDelete}>Delete</Button></td></tr>;
}

function RolesPanel() {
  const query = useQuery({ queryKey: ["admin", "roles"], queryFn: adminApi.getRoles, retry: false });
  return <Panel title="Roles"><Notice error={query.error} /><Table><thead><tr className="border-b border-[var(--color-border)]"><th className="p-3">Role</th><th className="p-3">Level</th><th className="p-3">Users</th></tr></thead><tbody>{(query.data?.roles ?? []).map((role) => <tr key={role.name} className="border-b border-[var(--color-border)] last:border-0"><td className="p-3">{role.name}</td><td className="p-3">{role.level}</td><td className="p-3">{role.user_count}</td></tr>)}</tbody></Table></Panel>;
}

function TokensPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "tokens"], queryFn: () => adminApi.listTokens({ page: 1, limit: 100 }), retry: false });
  const revoke = useMutation({ mutationFn: (id: number) => adminApi.revokeToken(id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "tokens"] }) });
  return <Panel title="API tokens"><Notice error={query.error ?? revoke.error} /><p className="text-sm text-[var(--color-text-muted)]">Only token metadata is returned. Token secrets are never displayed here.</p><Table><thead><tr className="border-b border-[var(--color-border)]"><th className="p-3">Owner</th><th className="p-3">Label</th><th className="p-3">Last used</th><th className="p-3">Actions</th></tr></thead><tbody>{(query.data?.tokens ?? []).map((token) => <TokenRow key={token.id} token={token} onRevoke={() => { if (window.confirm("Revoke this token?")) revoke.mutate(token.id); }} />)}</tbody></Table></Panel>;
}

function TokenRow({ token, onRevoke }: { token: AdminToken; onRevoke: () => void }) { return <tr className="border-b border-[var(--color-border)] last:border-0"><td className="p-3">{token.username}</td><td className="p-3">{token.label}</td><td className="p-3">{token.last_used || "Never"}</td><td className="p-3"><Button variant="danger" onClick={onRevoke}>Revoke</Button></td></tr>; }

function CatalogPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | undefined>();
  const cartridges = useQuery({ queryKey: ["admin", "catalog"], queryFn: () => adminApi.listCartridges({ page: 1, limit: 100 }), retry: false });
  const detail = useQuery({ queryKey: ["admin", "cartridge", selectedId, selectedVersion], queryFn: () => adminApi.getCartridge(selectedId as string, selectedVersion), enabled: selectedId !== null, retry: false });
  const update = useMutation({ mutationFn: (input: { id: string; version: string; metadata: Record<string, unknown> }) => adminApi.updateCartridge(input.id, input.version, input.metadata), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }); void queryClient.invalidateQueries({ queryKey: ["admin", "cartridge", selectedId, selectedVersion] }); } });
  const remove = useMutation({ mutationFn: (input: { id: string; version: string; architecture: string }) => adminApi.deleteCartridge(input.id, input.version, input.architecture), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "catalog"] }); void queryClient.invalidateQueries({ queryKey: ["admin", "cartridge", selectedId, selectedVersion] }); } });
  return <Panel title="Catalog administration"><Notice error={cartridges.error ?? detail.error ?? update.error ?? remove.error} /><div className="grid gap-5 xl:grid-cols-[1fr_1.2fr]"><Table><thead><tr className="border-b border-[var(--color-border)]"><th className="p-3">Cartridge</th><th className="p-3">Version</th><th className="p-3">State</th></tr></thead><tbody>{(cartridges.data?.cartridges ?? []).map((cartridge) => <tr key={cartridge.id} className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-muted)]" onClick={() => { setSelectedId(cartridge.id); setSelectedVersion(cartridge.selected_version); }}><td className="p-3">{cartridge.title}</td><td className="p-3">{cartridge.selected_version}</td><td className="p-3">{cartridge.artifact_state}</td></tr>)}</tbody></Table>{detail.data?.cartridge ? <CatalogEditor cartridge={detail.data.cartridge} onUpdate={(metadata) => update.mutate({ id: detail.data.cartridge.id, version: detail.data.cartridge.selected_version, metadata })} onDelete={(architecture) => { if (window.confirm(`Delete ${architecture} from ${detail.data.cartridge.id}?`)) remove.mutate({ id: detail.data.cartridge.id, version: detail.data.cartridge.selected_version, architecture }); }} /> : <p className="text-sm text-[var(--color-text-muted)]">Select a published cartridge. Metadata edits and architecture deletion use the backend consistency boundary.</p>}</div></Panel>;
}

function CatalogEditor({ cartridge, onUpdate, onDelete }: { cartridge: AdminCartridge; onUpdate: (metadata: Record<string, unknown>) => void; onDelete: (architecture: string) => void }) {
  const [title, setTitle] = useState(cartridge.metadata?.title?.toString() ?? cartridge.title);
  const [summary, setSummary] = useState(cartridge.metadata?.summary?.toString() ?? cartridge.summary);
  const [tags, setTags] = useState(Array.isArray(cartridge.metadata?.tags) ? cartridge.metadata.tags.join(", ") : cartridge.tags.join(", "));
  const [architecture, setArchitecture] = useState(cartridge.architectures[0] ?? "");
  return <div className="space-y-4 rounded-md border border-[var(--color-border)] p-4"><h3 className="font-semibold">{cartridge.title} · {cartridge.selected_version}</h3><Field label="Title" value={title} onChange={(event) => setTitle(event.target.value)} /><label className="grid gap-1 text-sm font-medium"><span>Summary</span><textarea className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 font-normal" value={summary} onChange={(event) => setSummary(event.target.value)} /></label><Field label="Tags (comma separated)" value={tags} onChange={(event) => setTags(event.target.value)} /><Button variant="secondary" onClick={() => onUpdate({ title, summary, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) })}>Save metadata</Button><div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4"><select className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3" value={architecture} onChange={(event) => setArchitecture(event.target.value)}>{cartridge.architectures.map((item) => <option key={item}>{item}</option>)}</select><Button variant="danger" disabled={!architecture} onClick={() => onDelete(architecture)}>Delete architecture</Button></div><p className="text-xs text-[var(--color-text-muted)]">Immutable cartridge identifiers and publication state are backend-owned.</p></div>;
}

function BackupPanel() {
  const [downloadPassword, setDownloadPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const download = useMutation({ mutationFn: () => adminApi.downloadBackup(downloadPassword || undefined), onSuccess: ({ blob, filename }) => { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); setMessage("Backup downloaded."); } });
  const restore = useMutation({ mutationFn: () => { if (!file) throw new Error("Select a backup file first."); return adminApi.restoreBackup(file, restorePassword || undefined); }, onSuccess: () => { clearAdminSessionState(); setMessage("Restore completed. Authenticate again before continuing."); } });
  return <Panel title="Backup and restore"><Notice error={download.error ?? restore.error} success={message} /><div className="grid gap-5 md:grid-cols-2"><div className="space-y-3 rounded-md border border-[var(--color-border)] p-4"><h3 className="font-semibold">Download</h3><Field label="Optional backup password" type="password" value={downloadPassword} onChange={(event) => setDownloadPassword(event.target.value)} /><Button disabled={download.isPending} onClick={() => download.mutate()}>{download.isPending ? "Preparing…" : "Download backup"}</Button></div><div className="space-y-3 rounded-md border border-[var(--color-border)] p-4"><h3 className="font-semibold">Restore</h3><input aria-label="backup file" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><Field label="Optional backup password" type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} /><Button variant="danger" disabled={!file || restore.isPending} onClick={() => { if (window.confirm("Restore this backup? The current admin session will be invalidated.")) restore.mutate(); }}>{restore.isPending ? "Restoring…" : "Restore backup"}</Button></div></div></Panel>;
}

function ActivePanel({ section }: { section: AdminSection }) {
  if (section === "settings") return <SettingsPanel />;
  if (section === "users") return <UsersPanel />;
  if (section === "groups") return <GroupsPanel />;
  if (section === "roles") return <RolesPanel />;
  if (section === "tokens") return <TokensPanel />;
  if (section === "catalog") return <CatalogPanel />;
  return <BackupPanel />;
}

export function AdminWorkspace() {
  const section = useAdminStore((state) => state.section);
  const setSection = useAdminStore((state) => state.setSection);
  const principal = useQuery({ queryKey: ["admin", "principal"], queryFn: adminApi.getPrincipal, retry: false });
  const permissions = useMemo(() => new Set(principal.data?.user.permissions ?? []), [principal.data]);
  const available = NAV_ITEMS.filter((item) => permissions.has(item.permission));
  useEffect(() => { const first = available[0]; if (first && !available.some((item) => item.section === section)) setSection(first.section); }, [available, section, setSection]);
  if (principal.isLoading) return <main className="mx-auto max-w-7xl px-6 py-12"><p>Loading administrative session…</p></main>;
  if (principal.error) return <main className="mx-auto max-w-2xl space-y-4 px-6 py-12"><h1 className="text-3xl font-bold">Administration unavailable</h1><Notice error={principal.error} /><p className="text-sm text-[var(--color-text-muted)]">This route never falls back to Flask administration. Enable the isolated Fastify target explicitly in development/test.</p></main>;
  if (!principal.data?.user.authenticated) return <main className="mx-auto max-w-2xl space-y-4 px-6 py-12"><h1 className="text-3xl font-bold">Sign-in required</h1><p>Use the existing browser authentication flow, then return here.</p></main>;
  if (!available.length) return <main className="mx-auto max-w-2xl space-y-4 px-6 py-12"><h1 className="text-3xl font-bold">No administrative permissions</h1><p>Your Fastify principal has no administrative capability exposed to this client.</p></main>;
  return <main className="mx-auto max-w-7xl space-y-6 px-6 py-10"><header className="space-y-2"><p className="text-sm font-semibold uppercase tracking-wide text-violet-700">PRG32 Cartridge Store</p><h1 className="text-3xl font-bold">Administration</h1><p className="text-sm text-[var(--color-text-muted)]">Signed in as {principal.data.user.username}. Capabilities are supplied by the backend authorization registry.</p></header><div className="grid gap-6 lg:grid-cols-[220px_1fr]"><nav aria-label="Administrative sections" className="flex gap-2 overflow-x-auto lg:flex-col">{available.map((item) => <button key={item.section} type="button" className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${section === item.section ? "bg-violet-700 text-white" : "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"}`} onClick={() => setSection(item.section)}>{item.label}</button>)}</nav><ActivePanel section={section} /></div></main>;
}
