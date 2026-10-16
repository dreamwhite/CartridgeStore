import { requestApiJson, withCsrfToken } from "./client";
import {
  setupAuthorizedResponseSchema,
  setupCompleteResponseSchema,
  setupProgressResponseSchema,
  setupResultResponseSchema,
  setupStatusResponseSchema,
} from "./schemas";
import type { z } from "zod";

export type SetupState = z.infer<typeof setupStatusResponseSchema>["state"];
export type SetupStep = z.infer<typeof setupProgressResponseSchema>["completed_steps"][number];
export type SetupStatus = z.infer<typeof setupStatusResponseSchema>;
export type SetupProgress = z.infer<typeof setupProgressResponseSchema>;

export function getSetupStatus(): Promise<SetupStatus> {
  return requestApiJson("/api/setup/status", undefined, setupStatusResponseSchema);
}

export function authorizeSetup(bootstrapToken: string): Promise<z.infer<typeof setupAuthorizedResponseSchema>> {
  return requestApiJson("/api/setup/authorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bootstrap_token: bootstrapToken }),
  }, setupAuthorizedResponseSchema);
}

export function getSetupProgress(): Promise<SetupProgress> {
  return requestApiJson("/api/setup/progress", undefined, setupProgressResponseSchema);
}

export function saveSetupStep(csrfToken: string, step: SetupStep, payload: Record<string, unknown>): Promise<SetupProgress> {
  return requestApiJson("/api/setup/progress", {
    method: "POST",
    headers: withCsrfToken(csrfToken, { "content-type": "application/json" }),
    body: JSON.stringify({ step, payload }),
  }, setupProgressResponseSchema);
}

export function completeSetup(csrfToken: string): Promise<z.infer<typeof setupCompleteResponseSchema>> {
  return requestApiJson("/api/setup/complete", {
    method: "POST",
    headers: withCsrfToken(csrfToken),
    body: "{}",
  }, setupCompleteResponseSchema);
}

export function testSetupSmtpConnection(csrfToken: string) {
  return requestApiJson("/api/setup/smtp/test-connection", { method: "POST", headers: withCsrfToken(csrfToken, { "content-type": "application/json" }), body: "{}" }, setupResultResponseSchema);
}

export function testSetupSmtpMessage(csrfToken: string, to: string) {
  return requestApiJson("/api/setup/smtp/test-message", { method: "POST", headers: withCsrfToken(csrfToken, { "content-type": "application/json" }), body: JSON.stringify({ to }) }, setupResultResponseSchema);
}

export function validateSetupOidc(csrfToken: string, issuer: string) {
  return requestApiJson("/api/setup/federation/oidc/validate", { method: "POST", headers: withCsrfToken(csrfToken, { "content-type": "application/json" }), body: JSON.stringify({ issuer }) }, setupResultResponseSchema);
}

export function importSetupSamlMetadata(csrfToken: string, input: { url?: string; xml?: string }) {
  return requestApiJson("/api/setup/federation/saml/metadata", { method: "POST", headers: withCsrfToken(csrfToken, { "content-type": "application/json" }), body: JSON.stringify(input) }, setupResultResponseSchema);
}
