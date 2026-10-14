import { requestApiJson, withCsrfToken } from "./client";

export type SetupState = "INFRASTRUCTURE_NOT_READY" | "INSTALLATION_REQUIRED" | "INSTALLATION_IN_PROGRESS" | "INSTALLATION_COMPLETE" | "INSTALLATION_RECOVERY_REQUIRED";
export type SetupStep = "admin" | "store" | "registration" | "security" | "smtp" | "oidc" | "saml" | "mdns" | "review";

export type SetupStatus = {
  ok: true;
  state: SetupState;
  setup_required: boolean;
  authorization_required: boolean;
  infrastructure: Record<string, unknown>;
  public_origins: { store: string | null; api: string | null };
  mdns: { infrastructure_allowed: boolean; application_enabled: boolean; effective_enabled: boolean; service_type: string; abi: string; port: number; restart_required: boolean };
};

export type SetupProgress = {
  ok: true;
  state: SetupState;
  completed_steps: SetupStep[];
  admin_user_id: number | null;
  started_at: string | null;
  completed_at: string | null;
  csrf_token: string;
  settings: Record<string, unknown>;
  providers: Array<Record<string, unknown>>;
};

export function getSetupStatus(): Promise<SetupStatus> {
  return requestApiJson("/api/setup/status");
}

export function authorizeSetup(bootstrapToken: string): Promise<SetupProgress & { authorized: true }> {
  return requestApiJson("/api/setup/authorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bootstrap_token: bootstrapToken }),
  });
}

export function getSetupProgress(): Promise<SetupProgress> {
  return requestApiJson("/api/setup/progress");
}

export function saveSetupStep(csrfToken: string, step: SetupStep, payload: Record<string, unknown>): Promise<SetupProgress> {
  return requestApiJson("/api/setup/progress", {
    method: "POST",
    headers: withCsrfToken(csrfToken, { "content-type": "application/json" }),
    body: JSON.stringify({ step, payload }),
  });
}

export function completeSetup(csrfToken: string): Promise<{ ok: true; state: "INSTALLATION_COMPLETE"; redirect: string }> {
  return requestApiJson("/api/setup/complete", {
    method: "POST",
    headers: withCsrfToken(csrfToken),
    body: "{}",
  });
}
