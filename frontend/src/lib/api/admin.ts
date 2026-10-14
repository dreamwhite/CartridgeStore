import type { z } from "zod";

import { ApiRequestError, requestJson, withCsrfToken } from "./client";
import type { Principal } from "./contracts";
import { csrfResponseSchema } from "./schemas";

/** The only browser-visible route to the transitional Fastify admin surface. */
export const ADMIN_PROXY_PREFIX = "/__admin-fastify";

export class AdminIntegrationUnavailableError extends Error {
  constructor() {
    super("The isolated Fastify administrative integration is not enabled.");
    this.name = "AdminIntegrationUnavailableError";
  }
}

let csrfToken: string | null = null;

function adminPath(path: string): string {
  if (!path.startsWith("/") || path.includes("//") || path.includes("..")) {
    throw new Error("Invalid administrative API path");
  }
  return `${ADMIN_PROXY_PREFIX}${path}`;
}

function unavailable(error: unknown): never {
  if (error instanceof ApiRequestError && error.body === null && (error.status === 404 || error.status === 502 || error.status === 503)) {
    throw new AdminIntegrationUnavailableError();
  }
  throw error;
}

async function adminRequest<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  try {
    return await requestJson(adminPath(path), init, schema);
  } catch (error) {
    return unavailable(error);
  }
}

async function mutationHeaders(headers?: HeadersInit): Promise<Headers> {
  if (!csrfToken) {
    const result = await adminRequest("/auth/csrf", undefined, csrfResponseSchema);
    csrfToken = result.csrf_token;
  }
  return withCsrfToken(csrfToken, headers);
}

function jsonMutation(headers?: HeadersInit): Promise<Headers> {
  const merged = new Headers(headers);
  merged.set("content-type", "application/json");
  return mutationHeaders(merged);
}

export function clearAdminSessionState(): void {
  csrfToken = null;
}

export type AdminResponse<T> = { ok: true } & T;

export type AdminSetting = {
  value: unknown;
  type: string;
  writable: boolean;
  restart_required: boolean;
  runtime: string;
};

export type AdminSettings = Record<string, AdminSetting>;
export type AdminSettingsResponse = AdminResponse<{
  settings: AdminSettings;
  application_settings: Record<string, { value: unknown; type: string; category: string; sensitivity: string; writable: boolean; version: number }>;
  read_only: Record<string, unknown>;
}>;

export type AdminUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  external_provider: string | null;
  created_at: string;
  last_login: string | null;
  groups: Array<{ id: number; name: string; created_at: string }>;
  account_status: "active" | "suspended" | "banned" | "disabled";
  status_reason: string | null;
  status_changed_at: string | null;
  status_expires_at: string | null;
};

export type AdminGroup = { id: number; name: string; created_at: string; user_count: number };
export type AdminRole = { name: string; level: number; user_count: number };
export type AdminToken = { id: number; user_id: number; username: string; label: string; created_at: string; last_used: string };
export type AdminAuditEvent = { event_id: string; timestamp: string; actor_user_id: number; target_type: string; target_id: string; action: string; outcome: string; summary?: Record<string, unknown>; request_id: string };
export type AdminCartridgeVariant = {
  architecture: string;
  size: number;
  sha256: string;
  icon_mime: string | null;
  screenshot_mime: string | null;
  has_screenshot: boolean;
  has_signature: boolean;
  updated_at: unknown;
};
export type AdminCartridge = {
  id: string;
  title: string;
  summary: string;
  authors: unknown[];
  tags: unknown[];
  latest_version: unknown;
  selected_version: string;
  versions: string[];
  architectures: string[];
  metadata: Record<string, unknown> | null;
  colophon: Record<string, unknown> | null;
  variants: Record<string, AdminCartridgeVariant>;
  publisher: string;
  updated_at: unknown;
  publication_state: "published";
  artifact_state: "available" | "inconsistent" | "unavailable";
  moderation_action?: "visible" | "hidden" | "unpublished";
  moderation_reason?: string;
  moderation_updated_at?: unknown;
};

export type AdminPage<T> = { ok: true; [key: string]: unknown; page: number; limit: number; total: number } & Record<string, T[] | number | boolean>;

export type AdminUserListResponse = AdminResponse<{ users: AdminUser[]; page: number; limit: number; total: number }>;
export type AdminGroupListResponse = AdminResponse<{ groups: AdminGroup[]; limit: number }>;
export type AdminRoleListResponse = AdminResponse<{ roles: AdminRole[] }>;
export type AdminTokenListResponse = AdminResponse<{ tokens: AdminToken[]; page: number; limit: number; total: number }>;
export type AdminCatalogListResponse = AdminResponse<{ cartridges: AdminCartridge[]; page: number; limit: number; total: number }>;
export type AdminUserResponse = AdminResponse<{ user: AdminUser }>;
export type AdminGroupResponse = AdminResponse<{ group: AdminGroup }>;
export type AdminCatalogResponse = AdminResponse<{ cartridge: AdminCartridge }>;
export type AdminAuditResponse = AdminResponse<{ events: AdminAuditEvent[]; limit: number }>;

export function getAdminPrincipal(): Promise<AdminResponse<{ user: Principal }>> {
  return adminRequest("/auth/me");
}

export function getAdminSettings(): Promise<AdminSettingsResponse> {
  return adminRequest("/api/admin/settings");
}

export function updateAdminSettings(patch: Record<string, unknown>): Promise<AdminSettingsResponse> {
  return jsonMutation().then((headers) => adminRequest("/api/admin/settings", { method: "PATCH", headers, body: JSON.stringify(patch) }));
}

export function testAdminSmtpConnection(): Promise<AdminResponse<{ result: string }>> {
  return jsonMutation().then((headers) => adminRequest("/api/admin/settings/smtp/test-connection", { method: "POST", headers, body: "{}" }));
}

export function sendAdminSmtpTestMessage(to: string): Promise<AdminResponse<{ result: string }>> {
  return jsonMutation().then((headers) => adminRequest("/api/admin/settings/smtp/test-message", { method: "POST", headers, body: JSON.stringify({ to }) }));
}

export function uploadAdminAsset(kind: "logo" | "favicon", file: File): Promise<AdminResponse<{ asset: { kind: string; url: string; mime_type: string; size: number } }>> {
  return mutationHeaders().then((headers) => {
    const body = new FormData();
    body.append("asset", file);
    return adminRequest(`/api/admin/settings/assets/${kind}`, { method: "POST", headers, body });
  });
}

export function listAdminUsers(params: { page?: number; limit?: number; q?: string; role?: string; group_id?: number } = {}): Promise<AdminUserListResponse> {
  return adminRequest(`/api/admin/users?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`);
}

export function getAdminUser(id: number): Promise<AdminUserResponse> { return adminRequest(`/api/admin/users/${encodeURIComponent(id)}`); }
export function createAdminUser(input: Record<string, unknown>): Promise<AdminUserResponse> {
  return jsonMutation().then((headers) => adminRequest("/api/admin/users", { method: "POST", headers, body: JSON.stringify(input) }));
}
export function updateAdminUser(id: number, input: Record<string, unknown>): Promise<AdminUserResponse> {
  return jsonMutation().then((headers) => adminRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", headers, body: JSON.stringify(input) }));
}
export function setAdminUserStatus(id: number, status: "active" | "suspended" | "banned", reason = "", expires_at?: string): Promise<AdminUserResponse> {
  const body = { status, reason, ...(expires_at ? { expires_at } : {}) };
  return jsonMutation().then((headers) => adminRequest(`/api/admin/users/${encodeURIComponent(id)}/status`, { method: "PATCH", headers, body: JSON.stringify(body) }));
}
export function setAdminUserRole(id: number, role: string): Promise<AdminUserResponse> {
  const body = { role };
  return jsonMutation().then((headers) => adminRequest(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "PATCH", headers, body: JSON.stringify(body) }));
}
export function replaceAdminUserGroups(id: number, group_ids: number[]): Promise<AdminUserResponse> {
  const body = { group_ids };
  return jsonMutation().then((headers) => adminRequest(`/api/admin/users/${encodeURIComponent(id)}/groups`, { method: "PUT", headers, body: JSON.stringify(body) }));
}
export function deleteAdminUser(id: number): Promise<AdminResponse<{ user_id: number }>> {
  return mutationHeaders().then((headers) => adminRequest(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE", headers }));
}

export function listAdminGroups(limit = 100): Promise<AdminGroupListResponse> { return adminRequest(`/api/admin/groups?limit=${limit}`); }
export function createAdminGroup(name: string): Promise<AdminGroupResponse> {
  const body = { name };
  return jsonMutation().then((headers) => adminRequest("/api/admin/groups", { method: "POST", headers, body: JSON.stringify(body) }));
}
export function renameAdminGroup(id: number, name: string): Promise<AdminGroupResponse> {
  const body = { name };
  return jsonMutation().then((headers) => adminRequest(`/api/admin/groups/${encodeURIComponent(id)}`, { method: "PATCH", headers, body: JSON.stringify(body) }));
}
export function deleteAdminGroup(id: number): Promise<AdminResponse<{ group_id: number }>> {
  return mutationHeaders().then((headers) => adminRequest(`/api/admin/groups/${encodeURIComponent(id)}`, { method: "DELETE", headers }));
}
export function getAdminRoles(): Promise<AdminRoleListResponse> { return adminRequest("/api/admin/roles"); }
export function listAdminTokens(params: { page?: number; limit?: number; user_id?: number } = {}): Promise<AdminTokenListResponse> {
  return adminRequest(`/api/admin/tokens?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`);
}
export function revokeAdminToken(id: number): Promise<AdminResponse<{ token_id: number }>> {
  return mutationHeaders().then((headers) => adminRequest(`/api/admin/tokens/${encodeURIComponent(id)}`, { method: "DELETE", headers }));
}

export function listAdminCartridges(params: { page?: number; limit?: number; q?: string; version?: string; architecture?: string } = {}): Promise<AdminCatalogListResponse> {
  return adminRequest(`/api/admin/cartridges?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`);
}
export function listAdminModerationInventory(params: { page?: number; limit?: number; q?: string; version?: string; architecture?: string } = {}): Promise<AdminCatalogListResponse> {
  return adminRequest(`/api/admin/catalog/moderation?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`);
}
export function getAdminModerationCartridge(id: string, version?: string): Promise<AdminCatalogResponse> {
  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  return adminRequest(`/api/admin/catalog/moderation/${encodeURIComponent(id)}${query}`);
}
export function getAdminCartridge(id: string, version?: string): Promise<AdminCatalogResponse> {
  const query = version ? `?version=${encodeURIComponent(version)}` : "";
  return adminRequest(`/api/admin/cartridges/${encodeURIComponent(id)}${query}`);
}
export function updateAdminCartridge(id: string, version: string, metadata: Record<string, unknown>): Promise<AdminCatalogResponse> {
  const body = { metadata };
  return jsonMutation().then((headers) => adminRequest(`/api/admin/cartridges/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`, { method: "PATCH", headers, body: JSON.stringify(body) }));
}
export function deleteAdminCartridge(id: string, version: string, architecture?: string): Promise<AdminResponse<{ id: string; version: string; architecture: string | null; deleted: true }>> {
  const query = new URLSearchParams({ version });
  if (architecture) query.set("architecture", architecture);
  return mutationHeaders().then((headers) => adminRequest(`/api/admin/cartridges/${encodeURIComponent(id)}?${query}`, { method: "DELETE", headers }));
}

export function moderateAdminCartridge(id: string, version: string, action: "hidden" | "unpublished" | "restored", reason = ""): Promise<AdminResponse<{ moderation: { id: string; version: string; action: string; reason: string } }>> {
  return jsonMutation().then((headers) => adminRequest(`/api/admin/cartridges/${encodeURIComponent(id)}/moderation?version=${encodeURIComponent(version)}`, { method: "POST", headers, body: JSON.stringify({ action, reason }) }));
}

export function listAdminAudit(limit = 100): Promise<AdminAuditResponse> {
  return adminRequest(`/api/admin/audit?limit=${encodeURIComponent(limit)}`);
}

async function backupRequest(path: string, init: RequestInit): Promise<Response> {
  try {
    const response = await fetch(adminPath(path), { ...init, credentials: "same-origin" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const error = new ApiRequestError("Administrative backup request failed", response.status, body?.ok === false ? body : null);
      return unavailable(error);
    }
    return response;
  } catch (error) {
    return unavailable(error);
  }
}

export async function downloadAdminBackup(password?: string): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers();
  if (password) headers.set("X-PRG32-Backup-Password", password);
  const response = await backupRequest("/admin/backup/download", { headers });
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename=([^;]+)/i)?.[1]?.replace(/^"|"$/g, "") || "prg32-backup.bin";
  return { blob: await response.blob(), filename };
}

export async function restoreAdminBackup(file: File, password?: string): Promise<AdminResponse<Record<string, unknown>>> {
  const headers = await mutationHeaders();
  if (password) headers.set("X-PRG32-Backup-Password", password);
  const body = new FormData();
  body.append("backup", file);
  const response = await adminRequest<AdminResponse<Record<string, unknown>>>("/admin/backup/restore", { method: "POST", headers, body });
  clearAdminSessionState();
  return response;
}

export const adminApi = {
  getPrincipal: getAdminPrincipal,
  getSettings: getAdminSettings,
  updateSettings: updateAdminSettings,
  testSmtpConnection: testAdminSmtpConnection,
  sendSmtpTestMessage: sendAdminSmtpTestMessage,
  uploadAsset: uploadAdminAsset,
  listUsers: listAdminUsers,
  getUser: getAdminUser,
  createUser: createAdminUser,
  updateUser: updateAdminUser,
  setUserStatus: setAdminUserStatus,
  setUserRole: setAdminUserRole,
  replaceUserGroups: replaceAdminUserGroups,
  deleteUser: deleteAdminUser,
  listGroups: listAdminGroups,
  createGroup: createAdminGroup,
  renameGroup: renameAdminGroup,
  deleteGroup: deleteAdminGroup,
  getRoles: getAdminRoles,
  listTokens: listAdminTokens,
  revokeToken: revokeAdminToken,
  listCartridges: listAdminCartridges,
  listModerationInventory: listAdminModerationInventory,
  getCartridge: getAdminCartridge,
  getModerationCartridge: getAdminModerationCartridge,
  updateCartridge: updateAdminCartridge,
  deleteCartridge: deleteAdminCartridge,
  moderateCartridge: moderateAdminCartridge,
  listAudit: listAdminAudit,
  downloadBackup: downloadAdminBackup,
  restoreBackup: restoreAdminBackup,
};
