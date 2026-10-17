"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiRequestError } from "../../lib/api/client";
import {
  authorizeSetup,
  completeSetup,
  getSetupProgress,
  getSetupStatus,
  saveSetupStep,
  type SetupProgress,
  type SetupStep,
  type SetupStatus,
} from "../../lib/api/setup";
import { setupSteps } from "./setup-steps";

type FormState = Record<string, string | boolean>;

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.body?.error ?? error.message;
  }
  return error instanceof Error
    ? error.message
    : "The installation request failed.";
}

function payloadFor(
  step: SetupStep,
  form: FormState,
): Record<string, unknown> {
  const value = (name: string, fallback: string | boolean = "") =>
    form[name] ?? fallback;
  if (step === "admin") {
    return {
      username: value("username"),
      email: value("email"),
      password: value("password"),
      password_confirm: value("password_confirm"),
    };
  }
  if (step === "store") {
    return {
      "application.store_name": value(
        "store_name",
        "PRG32 Cartridge Store",
      ),
      "application.store_description": value("store_description"),
      "application.contact_email": value("contact_email"),
    };
  }
  if (step === "registration") {
    return {
      "registration.enabled": Boolean(value("registration_enabled", true)),
      "registration.require_email_verification": Boolean(
        value("email_verification", false),
      ),
    };
  }
  if (step === "security") {
    return {
      "session.lifetime_seconds": Number(
        value("session_lifetime", "86400"),
      ),
      "publishing.enabled": Boolean(value("publishing_enabled", true)),
      "review.require_note_on_rejection": Boolean(value("review_note", false)),
      "security.notify_user_on_account_change": Boolean(
        value("notify_account", true),
      ),
    };
  }
  if (step === "smtp") {
    return {
      enabled: Boolean(value("smtp_enabled", false)),
      "smtp.enabled": Boolean(value("smtp_enabled", false)),
      "smtp.host": value("smtp_host"),
      "smtp.port": Number(value("smtp_port", "1025")),
      "smtp.encryption": value("smtp_encryption", "none"),
      "smtp.auth_enabled": Boolean(value("smtp_auth", false)),
      "smtp.username": value("smtp_username"),
      "smtp.password": value("smtp_password"),
      "smtp.from_name": value("smtp_from_name", "PRG32 Cartridge Store"),
      "smtp.from_email": value("smtp_from_email"),
      "smtp.reply_to": value("smtp_reply_to"),
    };
  }
  if (step === "oidc") {
    return {
      enabled: Boolean(value("oidc_enabled", false)),
      provider_id: value("oidc_provider_id"),
      display_name: value("oidc_display_name"),
      issuer: value("oidc_issuer"),
      client_id: value("oidc_client_id"),
      client_secret: value("oidc_client_secret"),
      client_auth_method: value("oidc_auth_method", "client_secret_basic"),
    };
  }
  if (step === "saml") {
    return {
      enabled: Boolean(value("saml_enabled", false)),
      provider_id: value("saml_provider_id"),
      display_name: value("saml_display_name"),
      idp_entity_id: value("saml_idp_entity_id"),
      saml_entry_point: value("saml_entry_point"),
      saml_idp_certificate_pem: value("saml_certificate"),
    };
  }
  if (step === "mdns") {
    return { enabled: Boolean(value("mdns_enabled", false)) };
  }
  return {};
}

/** Owns setup wizard state, payload mapping and step transitions. */
export function useSetupWizard() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [token, setToken] = useState("");
  const [current, setCurrent] = useState(0);
  const [form, setForm] = useState<FormState>({ enabled: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fatal, setFatal] = useState("");
  const router = useRouter();

  useEffect(() => {
    void getSetupStatus()
      .then(setStatus)
      .catch((error) => setFatal(errorMessage(error)));
  }, []);

  useEffect(() => {
    if (!status?.setup_required || status.state === "INFRASTRUCTURE_NOT_READY") {
      return;
    }
    void getSetupProgress()
      .then((value) => {
        setProgress(value);
        const first = setupSteps.findIndex((step) =>
          !value.completed_steps.includes(step.id),
        );
        setCurrent(first < 0 ? setupSteps.length - 1 : first);
      })
      .catch(() => {
        // The authorization screen is expected before progress.
      });
  }, [status]);

  const activeStep = setupSteps[current] ?? setupSteps[0]!;
  const completed = useMemo(
    () => new Set(progress?.completed_steps ?? []),
    [progress],
  );
  const authorized = Boolean(progress);

  const update = (name: string, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  async function authorize() {
    setBusy(true);
    setMessage("");
    try {
      const result = await authorizeSetup(token);
      setProgress(result);
      setToken("");
      setMessage(
        "Installation session authorized. The token is not stored in this browser.",
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!progress) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await saveSetupStep(
        progress.csrf_token,
        activeStep.id,
        payloadFor(activeStep.id, form),
      );
      setProgress(next);
      if (activeStep.id === "admin") setForm({});
      if (activeStep.id === "smtp") {
        setForm((previous) => ({ ...previous, smtp_password: "" }));
      }
      const nextIndex = setupSteps.findIndex((step) =>
        !next.completed_steps.includes(step.id),
      );
      setCurrent(nextIndex < 0 ? setupSteps.length - 1 : nextIndex);
      setMessage(`${activeStep.label} saved.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!progress) return;
    setBusy(true);
    setMessage("");
    try {
      const reviewed = await saveSetupStep(progress.csrf_token, "review", {});
      setProgress(reviewed);
      await completeSetup(reviewed.csrf_token);
      router.push("/auth/login");
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  async function skipCurrent() {
    if (!progress) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await saveSetupStep(
        progress.csrf_token,
        activeStep.id,
        { enabled: false },
      );
      setProgress(next);
      const nextIndex = setupSteps.findIndex((step) =>
        !next.completed_steps.includes(step.id),
      );
      setCurrent(nextIndex < 0 ? setupSteps.length - 1 : nextIndex);
      setMessage(`${activeStep.label} skipped.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return {
    status,
    progress,
    token,
    setToken,
    current,
    setCurrent,
    form,
    busy,
    message,
    fatal,
    activeStep,
    completed,
    authorized,
    update,
    authorize,
    saveCurrent,
    finish,
    skipCurrent,
  };
}
