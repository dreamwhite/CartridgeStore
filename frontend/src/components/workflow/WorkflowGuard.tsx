"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getWorkflowPrincipal, workflowErrorMessage } from "../../lib/api/workflow";
import { authIntegrationEnabled } from "../../lib/auth/config";

export const WORKFLOW_PRINCIPAL_QUERY_KEY = ["workflow", "principal"] as const;

export function useWorkflowPrincipal() {
  return useQuery({
    queryKey: WORKFLOW_PRINCIPAL_QUERY_KEY,
    queryFn: getWorkflowPrincipal,
    enabled: authIntegrationEnabled,
    retry: false,
    staleTime: 30_000,
  });
}

export function WorkflowGuard({
  children,
  permission,
}: Readonly<{ children: ReactNode; permission?: string }>) {
  const current = useWorkflowPrincipal();

  if (!authIntegrationEnabled) {
    return <WorkflowMessage tone="muted">The isolated workflow integration is disabled.</WorkflowMessage>;
  }
  if (current.isPending) {
    return <WorkflowMessage>Checking workflow authorization…</WorkflowMessage>;
  }
  if (current.error) {
    return <WorkflowMessage tone="error">{workflowErrorMessage(current.error)}</WorkflowMessage>;
  }
  if (!current.data?.user.authenticated) {
    return <WorkflowMessage tone="warning">Sign in is required to use this workflow.</WorkflowMessage>;
  }
  if (permission && !current.data.user.permissions?.includes(permission)) {
    return <WorkflowMessage tone="warning">You are not authorized for this workflow.</WorkflowMessage>;
  }
  return children;
}

export function WorkflowMessage({
  children,
  tone = "muted",
}: Readonly<{ children: ReactNode; tone?: "muted" | "warning" | "error" }>) {
  const colors = {
    muted: "border-[var(--color-border)] bg-[var(--color-surface)]",
    warning: "border-amber-300 bg-amber-50 text-amber-950",
    error: "border-rose-300 bg-rose-50 text-rose-950",
  } as const;
  return <p className={`rounded-md border p-5 ${colors[tone]}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}
