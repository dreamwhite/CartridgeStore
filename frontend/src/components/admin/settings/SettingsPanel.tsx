"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { Field, Notice, Panel } from "../admin-ui";
import { useAdminSettings } from "./use-settings";

type SettingValues = Record<string, unknown>;

function AssetUpload({
  kind,
  onUpload,
}: {
  kind: "logo" | "favicon";
  onUpload: (kind: "logo" | "favicon", file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
      <p className="text-sm font-semibold">{kind} asset</p>
      <input
        aria-label={`${kind} asset`}
        type="file"
        accept="image/*"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
      />
      <Button
        variant="secondary"
        disabled={!file}
        onClick={() => file && onUpload(kind, file)}
      >
        Upload
      </Button>
    </div>
  );
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
    >
      <header className="border-b border-[var(--color-border)] pb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}

function textValue(values: SettingValues, key: string, fallback = "") {
  return String(values[key] ?? fallback);
}

function numberValue(values: SettingValues, key: string, fallback: number) {
  const value = values[key];
  return typeof value === "number" ? value : fallback;
}

export function SettingsPanel() {
  const {
    query,
    update,
    testConnection,
    sendTestMessage,
    uploadAsset,
  } = useAdminSettings();
  const [draft, setDraft] = useState<SettingValues>({});
  const [typedDraft, setTypedDraft] = useState<SettingValues>({});
  const [smtpRecipient, setSmtpRecipient] = useState("admin@example.test");
  const [success, setSuccess] = useState("");

  const initialValues = useMemo(
    () =>
      query.data
        ? Object.fromEntries(
            Object.entries(query.data.settings)
              .filter(([, setting]) => setting.writable)
              .map(([key, setting]) => [key, setting.value]),
          )
        : {},
    [query.data],
  );
  const initialTypedValues = useMemo(
    () =>
      query.data
        ? Object.fromEntries(
            Object.entries(query.data.application_settings ?? {}).map(
              ([key, setting]) => [key, setting.value],
            ),
          )
        : {},
    [query.data],
  );
  const values = Object.keys(draft).length ? draft : initialValues;
  const typedValues = Object.keys(typedDraft).length
    ? typedDraft
    : initialTypedValues;
  const error =
    query.error ??
    update.error ??
    testConnection.error ??
    sendTestMessage.error ??
    uploadAsset.error;
  const disabled = query.isLoading || update.isPending;

  function setLegacyValue(key: string, value: unknown) {
    setDraft((current) => ({ ...values, ...current, [key]: value }));
  }

  function setApplicationValue(key: string, value: unknown) {
    setTypedDraft((current) => ({ ...typedValues, ...current, [key]: value }));
  }

  function saveSettings() {
    setSuccess("");
    update.mutate(
      { ...values, application_settings: typedValues },
      { onSuccess: () => setSuccess("Settings salvate.") },
    );
  }

  return (
    <Panel title="Settings">
      <Notice error={error} success={success} />
      {query.isLoading ? (
        <p>Loading settings…</p>
      ) : (
        <div className="space-y-4">
          <SettingsSection
            id="general"
            title="General"
            description="Define the public identity and contact details of the Cartridge Store."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Store name"
                value={textValue(values, "store_name", "PRG32 Cartridge Store")}
                onChange={(event) =>
                  setLegacyValue("store_name", event.target.value)
                }
              />
              <Field
                label="Store tagline"
                value={textValue(values, "store_tagline")}
                onChange={(event) =>
                  setLegacyValue("store_tagline", event.target.value)
                }
              />
              <Field
                label="Contact email"
                type="email"
                value={textValue(values, "store_contact_email")}
                onChange={(event) =>
                  setLegacyValue("store_contact_email", event.target.value)
                }
              />
              <Field
                label="Institution"
                value={textValue(values, "store_institution")}
                onChange={(event) =>
                  setLegacyValue("store_institution", event.target.value)
                }
              />
              <Field
                label="Application description"
                value={textValue(
                  typedValues,
                  "application.store_description",
                )}
                onChange={(event) =>
                  setApplicationValue(
                    "application.store_description",
                    event.target.value,
                  )
                }
              />
              <Field
                label="Application contact email"
                type="email"
                value={textValue(typedValues, "application.contact_email")}
                onChange={(event) =>
                  setApplicationValue(
                    "application.contact_email",
                    event.target.value,
                  )
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="appearance"
            title="Appearance"
            description="Control the visual defaults used by the public Store interface."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Primary color"
                value={textValue(values, "theme_primary_color", "#7045d8")}
                onChange={(event) =>
                  setLegacyValue("theme_primary_color", event.target.value)
                }
              />
              <Field
                label="Secondary color"
                value={textValue(values, "theme_secondary_color", "#5931bc")}
                onChange={(event) =>
                  setLegacyValue("theme_secondary_color", event.target.value)
                }
              />
              <Field
                label="Font family"
                value={textValue(
                  values,
                  "theme_font_family",
                  "system-ui, sans-serif",
                )}
                onChange={(event) =>
                  setLegacyValue("theme_font_family", event.target.value)
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <AssetUpload
                kind="logo"
                onUpload={(kind, file) => uploadAsset.mutate({ kind, file })}
              />
              <AssetUpload
                kind="favicon"
                onUpload={(kind, file) => uploadAsset.mutate({ kind, file })}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="registration"
            title="Registration and sessions"
            description="Control account creation and the lifetime of authenticated sessions."
          >
            <div className="grid gap-3">
              <Switch
                label="Allow registration"
                description="Let new users create Cartridge Store accounts."
                checked={values.auth_allow_registration === true}
                disabled={disabled}
                onChange={(checked) =>
                  setLegacyValue("auth_allow_registration", checked)
                }
              />
              <Switch
                label="Enable registration workflow"
                description="Enable the canonical registration policy."
                checked={typedValues["registration.enabled"] === true}
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue("registration.enabled", checked)
                }
              />
              <Switch
                label="Require email verification"
                description="Require a verified email before an account becomes active."
                checked={
                  typedValues["registration.require_email_verification"] ===
                  true
                }
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue(
                    "registration.require_email_verification",
                    checked,
                  )
                }
              />
            </div>
            <Field
              label="Session lifetime (seconds)"
              type="number"
              min={60}
              value={String(
                numberValue(typedValues, "session.lifetime_seconds", 86400),
              )}
              onChange={(event) =>
                setApplicationValue(
                  "session.lifetime_seconds",
                  Number(event.target.value),
                )
              }
            />
          </SettingsSection>

          <SettingsSection
            id="publishing"
            title="Publishing and review"
            description="Control whether cartridges can be submitted and how review decisions are recorded."
          >
            <div className="grid gap-3">
              <Switch
                label="Enable publishing"
                description="Allow publishers to submit cartridge bundles for validation."
                checked={typedValues["publishing.enabled"] === true}
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue("publishing.enabled", checked)
                }
              />
              <Switch
                label="Require a note when rejecting"
                description="Ask reviewers to explain requested changes."
                checked={
                  typedValues["review.require_note_on_rejection"] === true
                }
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue(
                    "review.require_note_on_rejection",
                    checked,
                  )
                }
              />
            </div>
            <Field
              label="Maximum artifact size (bytes)"
              type="number"
              min={1}
              value={String(
                numberValue(
                  typedValues,
                  "publishing.max_artifact_bytes",
                  52428800,
                ),
              )}
              onChange={(event) =>
                setApplicationValue(
                  "publishing.max_artifact_bytes",
                  Number(event.target.value),
                )
              }
            />
          </SettingsSection>

          <SettingsSection
            id="telemetry"
            title="Telemetry and discovery"
            description="Choose which optional runtime integrations are active."
          >
            <div className="grid gap-3">
              <Switch
                label="Collect telemetry"
                description="Accept runtime metrics and run samples from compatible clients."
                checked={typedValues["telemetry.collection_enabled"] === true}
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue("telemetry.collection_enabled", checked)
                }
              />
              <Switch
                label="Enable mDNS discovery"
                description="Advertise the Cartridge Store on the local network."
                checked={typedValues["discovery.mdns_enabled"] === true}
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue("discovery.mdns_enabled", checked)
                }
              />
              <Switch
                label="Notify users about account changes"
                description="Send security notifications when account data changes."
                checked={
                  typedValues["security.notify_user_on_account_change"] === true
                }
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue(
                    "security.notify_user_on_account_change",
                    checked,
                  )
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            id="email"
            title="Email delivery"
            description="Configure SMTP delivery for transactional and security messages. Secrets remain write-only."
          >
            <div className="grid gap-3">
              <Switch
                label="Enable SMTP"
                description="Allow the service to deliver email through the configured SMTP server."
                checked={typedValues["smtp.enabled"] === true}
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue("smtp.enabled", checked)
                }
              />
              <Switch
                label="Enable SMTP authentication"
                description="Authenticate with the configured SMTP username and secret."
                checked={typedValues["smtp.auth_enabled"] === true}
                disabled={disabled}
                onChange={(checked) =>
                  setApplicationValue("smtp.auth_enabled", checked)
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="SMTP host"
                value={textValue(typedValues, "smtp.host")}
                onChange={(event) =>
                  setApplicationValue("smtp.host", event.target.value)
                }
              />
              <Field
                label="SMTP port"
                type="number"
                value={String(numberValue(typedValues, "smtp.port", 1025))}
                onChange={(event) =>
                  setApplicationValue("smtp.port", Number(event.target.value))
                }
              />
              <Field
                label="Encryption"
                value={textValue(typedValues, "smtp.encryption", "none")}
                onChange={(event) =>
                  setApplicationValue("smtp.encryption", event.target.value)
                }
              />
              <Field
                label="SMTP username"
                value={textValue(typedValues, "smtp.username")}
                onChange={(event) =>
                  setApplicationValue("smtp.username", event.target.value)
                }
              />
              <Field
                label="From name"
                value={textValue(
                  typedValues,
                  "smtp.from_name",
                  "PRG32 Cartridge Store",
                )}
                onChange={(event) =>
                  setApplicationValue("smtp.from_name", event.target.value)
                }
              />
              <Field
                label="From email"
                type="email"
                value={textValue(typedValues, "smtp.from_email")}
                onChange={(event) =>
                  setApplicationValue("smtp.from_email", event.target.value)
                }
              />
              <Field
                label="Reply-to"
                type="email"
                value={textValue(typedValues, "smtp.reply_to")}
                onChange={(event) =>
                  setApplicationValue("smtp.reply_to", event.target.value)
                }
              />
            </div>
            <div className="flex flex-wrap items-end gap-3 border-t border-[var(--color-border)] pt-4">
              <Button
                variant="secondary"
                disabled={testConnection.isPending}
                onClick={() => {
                  setSuccess("");
                  testConnection.mutate(undefined, {
                    onSuccess: () => setSuccess("SMTP connection accepted."),
                  });
                }}
              >
                {testConnection.isPending
                  ? "Testing…"
                  : "Test SMTP connection"}
              </Button>
              <Field
                label="Test recipient"
                type="email"
                value={smtpRecipient}
                onChange={(event) => setSmtpRecipient(event.target.value)}
              />
              <Button
                variant="secondary"
                disabled={!smtpRecipient || sendTestMessage.isPending}
                onClick={() => {
                  setSuccess("");
                  sendTestMessage.mutate(smtpRecipient, {
                    onSuccess: () => setSuccess("SMTP test message accepted."),
                  });
                }}
              >
                {sendTestMessage.isPending ? "Sending…" : "Send test message"}
              </Button>
            </div>
          </SettingsSection>

          <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
            <Button disabled={update.isPending} onClick={saveSettings}>
              {update.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
