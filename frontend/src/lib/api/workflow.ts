import type {
  AuthUserResponse,
  OwnedSubmissionListResponse,
  WorkflowSubmissionListResponse,
  WorkflowSubmissionResponse,
  WorkflowSubmissionResult,
  DraftListResponse,
  DraftResponse,
} from "./contracts";
import type { ZodType } from "zod";
import { ApiRequestError, requestJson, withCsrfToken } from "./client";
import {
  authUserResponseSchema,
  csrfResponseSchema,
  ownedSubmissionListResponseSchema,
  workflowSubmissionListResponseSchema,
  workflowSubmissionResponseSchema,
  workflowSubmissionResultSchema,
  draftListResponseSchema,
  draftResponseSchema,
} from "./schemas";

export const WORKFLOW_PROXY_PREFIX = "/__workflow-fastify";

export class WorkflowIntegrationUnavailableError extends Error {
  constructor(message = "The isolated publishing and review integration is unavailable.") {
    super(message);
    this.name = "WorkflowIntegrationUnavailableError";
  }
}

function workflowPath(path: string): string {
  const pathname = path.split("?", 1)[0] ?? "";
  if (!pathname.startsWith("/") || pathname.includes("//") || pathname.includes("..")) {
    throw new Error("Invalid workflow API path");
  }
  return `${WORKFLOW_PROXY_PREFIX}${path}`;
}

async function workflowRequest<T>(path: string, init?: RequestInit, schema?: ZodType<T>): Promise<T> {
  try {
    return await requestJson(workflowPath(path), init, schema);
  } catch (error) {
    if (error instanceof ApiRequestError && [404, 502, 503].includes(error.status) && !error.body) {
      throw new WorkflowIntegrationUnavailableError();
    }
    throw error;
  }
}

let csrfToken: string | null = null;

export function clearWorkflowSessionState(): void {
  csrfToken = null;
}

async function workflowCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await workflowRequest("/auth/csrf", undefined, csrfResponseSchema);
  csrfToken = response.csrf_token;
  return csrfToken;
}

function invalidateWorkflowCsrf(): void {
  csrfToken = null;
}

export function getWorkflowPrincipal(): Promise<AuthUserResponse> {
  return workflowRequest("/auth/me", undefined, authUserResponseSchema);
}

export function listSubmissions(status?: string): Promise<WorkflowSubmissionListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return workflowRequest(`/api/submissions${query}`, undefined, workflowSubmissionListResponseSchema);
}

export function getSubmission(id: number): Promise<WorkflowSubmissionResponse> {
  return workflowRequest(`/api/submissions/${id}`, undefined, workflowSubmissionResponseSchema);
}

export function listMySubmissions(status?: string, page?: number, perPage?: number): Promise<OwnedSubmissionListResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page !== undefined) params.set("page", String(page));
  if (perPage !== undefined) params.set("per_page", String(perPage));
  const query = params.toString();
  return workflowRequest(`/api/submissions/mine${query ? `?${query}` : ""}`, undefined, ownedSubmissionListResponseSchema);
}

export function listDrafts(): Promise<DraftListResponse> { return workflowRequest("/api/drafts", undefined, draftListResponseSchema); }
export async function createDraft(metadata: Record<string, unknown> = {}): Promise<DraftResponse> { return workflowRequest("/api/drafts", { method: "POST", headers: withCsrfToken(await workflowCsrf(), { "content-type": "application/json" }), body: JSON.stringify({ metadata }) }, draftResponseSchema); }
export async function updateDraft(id: string, metadata: Record<string, unknown>): Promise<DraftResponse> { return workflowRequest(`/api/drafts/${encodeURIComponent(id)}`, { method: "PATCH", headers: withCsrfToken(await workflowCsrf(), { "content-type": "application/json" }), body: JSON.stringify({ metadata }) }, draftResponseSchema); }
export async function deleteDraft(id: string): Promise<{ ok: true }> { return workflowRequest(`/api/drafts/${encodeURIComponent(id)}`, { method: "DELETE", headers: withCsrfToken(await workflowCsrf()) }); }
export async function attachDraftArtifact(id: string, file: File): Promise<DraftResponse> { const form = new FormData(); form.set("bundle", file, file.name); return workflowRequest(`/api/drafts/${encodeURIComponent(id)}/artifact`, { method: "POST", headers: withCsrfToken(await workflowCsrf()), body: form }, draftResponseSchema); }
export async function submitDraft(id: string): Promise<WorkflowSubmissionResult> { return workflowRequest(`/api/drafts/${encodeURIComponent(id)}/submit`, { method: "POST", headers: withCsrfToken(await workflowCsrf()) }, workflowSubmissionResultSchema); }
export async function resubmitSubmission(id: number): Promise<DraftResponse> { return workflowRequest(`/api/submissions/${id}/resubmit`, { method: "POST", headers: withCsrfToken(await workflowCsrf()) }, draftResponseSchema); }

export async function submitBundle(file: File): Promise<WorkflowSubmissionResult> {
  const form = new FormData();
  form.set("bundle", file, file.name);
  try {
    return await workflowRequest(
      "/api/publish/bundle",
      { method: "POST", headers: withCsrfToken(await workflowCsrf()), body: form },
      workflowSubmissionResultSchema,
    );
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403 && error.body?.code === "csrf_failed") {
      invalidateWorkflowCsrf();
    }
    throw error;
  }
}

export async function approveSubmission(id: number, metadata: Record<string, unknown>, note = ""): Promise<WorkflowSubmissionResponse> {
  return workflowRequest(
    `/api/submissions/${id}/verify`,
    {
      method: "POST",
      headers: withCsrfToken(await workflowCsrf(), { "content-type": "application/json" }),
      body: JSON.stringify({ metadata, note }),
    },
    workflowSubmissionResponseSchema,
  );
}

export async function rejectSubmission(id: number, note = ""): Promise<WorkflowSubmissionResponse> {
  return workflowRequest(
    `/api/submissions/${id}/reject`,
    { method: "POST", headers: withCsrfToken(await workflowCsrf(), { "content-type": "application/json" }), body: JSON.stringify({ note }) },
    workflowSubmissionResponseSchema,
  );
}

export function workflowErrorMessage(error: unknown): string {
  if (error instanceof WorkflowIntegrationUnavailableError) return "The isolated publishing and review service is not configured or is unavailable.";
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return "Sign in is required for this workflow.";
    if (error.status === 403 && error.body?.code === "csrf_failed") return "Your session expired. Refresh and try again.";
    if (error.status === 403) return "You are not authorized for this workflow.";
    if (error.status === 404) return "The requested submission was not found.";
    if (error.status === 409) return "The submission changed state. Refresh before trying again.";
    if (error.status === 413) return "The bundle is too large for the publishing service.";
    if (error.status >= 500) return "The publishing and review service is temporarily unavailable.";
  }
  if (error instanceof TypeError) return "The publishing and review service could not be reached.";
  return "The workflow request could not be completed.";
}
