"use client";

import {
  Activity,
  Mail,
  MailOpen,
  Network,
  Palette,
  PlugZap,
  RadioTower,
  Rocket,
  Send,
  SlidersHorizontal,
  Terminal,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "../../ui/button";
import { HelpTooltip } from "../../ui/help-tooltip";
import { SelectField, SelectItem } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Field } from "../admin-ui";
import type { ManagedAssetKind } from "../../../lib/runtime-assets";
import type { SettingsSectionId } from "./settings-sections";
import {
  AssetUpload,
  ColorField,
  megabytesValue,
  numberValue,
  readOnlyValue,
  SettingsSection,
  textValue,
  type SettingValues,
} from "./settings-ui";

export type SettingsSectionContentProps = {
  activeSection: SettingsSectionId;
  values: SettingValues;
  typedValues: SettingValues;
  disabled: boolean;
  logoUrl: string;
  faviconUrl: string;
  mdnsInfo: unknown;
  discoveryInfo: unknown;
  emailTemplates: unknown;
  mdnsRuntimeEnabled: boolean;
  setLegacyValue: (key: string, value: unknown) => void;
  setApplicationValue: (key: string, value: unknown) => void;
  onUpload: (kind: ManagedAssetKind, file: File) => Promise<string>;
  onDelete: (kind: ManagedAssetKind) => Promise<void>;
  smtpRecipient: string;
  setSmtpRecipient: Dispatch<SetStateAction<string>>;
  smtpPassword: string;
  setSmtpPassword: Dispatch<SetStateAction<string>>;
  smtpLog: SmtpLogEntry[];
  onTestConnection: () => void;
  onSendTestMessage: () => void;
  testConnectionPending: boolean;
  sendTestMessagePending: boolean;
};

export type SmtpLogEntry = {
  readonly message: string;
  readonly tone: "info" | "success" | "error";
};

function GeneralSection({
  values,
  typedValues,
  setLegacyValue,
  setApplicationValue,
}: Pick<
  SettingsSectionContentProps,
  "values" | "typedValues" | "setLegacyValue" | "setApplicationValue"
>) {
  return (
    <SettingsSection
      icon={SlidersHorizontal}
      title="General"
      description="Define the public identity and contact details of the Cartridge Store."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Store name"
          placeholder="PRG32 Cartridge Store"
          help="Public catalog name used by the backend catalog metadata and the Store identity."
          value={textValue(values, "store_name", "PRG32 Cartridge Store")}
          onChange={(event) => setLegacyValue("store_name", event.target.value)}
        />
        <Field
          label="Store tagline"
          placeholder="Build, publish, repeat."
          help="Short brand line. It is persisted, but it is not currently rendered by the public storefront."
          value={textValue(values, "store_tagline")}
          onChange={(event) => setLegacyValue("store_tagline", event.target.value)}
        />
        <Field
          label="Contact email"
          type="email"
          placeholder="support@example.test"
          help="Public contact address. It is saved in Store settings, but is not currently rendered by the public storefront."
          value={textValue(values, "store_contact_email")}
          onChange={(event) => setLegacyValue("store_contact_email", event.target.value)}
        />
        <Field
          label="Institution"
          placeholder="Università degli Studi di Napoli Parthenope"
          help="Public institutional context. It is persisted, but its storefront rendering is not wired yet."
          value={textValue(values, "store_institution")}
          onChange={(event) => setLegacyValue("store_institution", event.target.value)}
        />
        <Field
          label="Application description"
          placeholder="Discover and download published PRG32 cartridges."
          help="Application-level description stored in typed settings; it is separate from each cartridge description and is not currently rendered by the storefront."
          value={textValue(typedValues, "application.store_description")}
          onChange={(event) =>
            setApplicationValue("application.store_description", event.target.value)
          }
        />
        <Field
          label="Application contact email"
          type="email"
          placeholder="admin@example.test"
          help="Application contact stored in typed settings. It is not the SMTP sender address and is not currently rendered by the storefront."
          value={textValue(typedValues, "application.contact_email")}
          onChange={(event) =>
            setApplicationValue("application.contact_email", event.target.value)
          }
        />
      </div>
    </SettingsSection>
  );
}

function AppearanceSection({
  values,
  logoUrl,
  faviconUrl,
  setLegacyValue,
  onUpload,
  onDelete,
}: Pick<
  SettingsSectionContentProps,
  "values" | "logoUrl" | "faviconUrl" | "setLegacyValue" | "onUpload" | "onDelete"
>) {
  return (
    <SettingsSection
      icon={Palette}
      title="Appearance"
      description="Control the visual defaults used by the public Store interface."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <ColorField
          label="Primary color"
          help="Saved as a public theme token. Storefront color-token wiring is not active yet."
          value={textValue(values, "theme_primary_color", "#7045d8")}
          fallback="#7045d8"
          onChange={(value) => setLegacyValue("theme_primary_color", value)}
        />
        <ColorField
          label="Secondary color"
          help="Saved as a public theme token. Storefront color-token wiring is not active yet."
          value={textValue(values, "theme_secondary_color", "#5931bc")}
          fallback="#5931bc"
          onChange={(value) => setLegacyValue("theme_secondary_color", value)}
        />
        <Field
          label="Font family"
          placeholder="system-ui, sans-serif"
          help="Saved as a public theme token. Storefront font wiring is not active yet."
          value={textValue(values, "theme_font_family", "system-ui, sans-serif")}
          onChange={(event) => setLegacyValue("theme_font_family", event.target.value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AssetUpload kind="logo" currentUrl={logoUrl} onUpload={onUpload} onDelete={onDelete} />
        <AssetUpload kind="favicon" currentUrl={faviconUrl} onUpload={onUpload} onDelete={onDelete} />
      </div>
    </SettingsSection>
  );
}

function RegistrationSection({
  values,
  typedValues,
  disabled,
  setLegacyValue,
  setApplicationValue,
}: Pick<
  SettingsSectionContentProps,
  "values" | "typedValues" | "disabled" | "setLegacyValue" | "setApplicationValue"
>) {
  return (
    <SettingsSection
      icon={UserRound}
      title="Registration and sessions"
      description="Control account creation and the lifetime of authenticated sessions."
    >
      <div className="grid gap-3">
        <Switch
          label="Allow registration"
          help="Controls whether new users can create Cartridge Store accounts. Enforced by the backend."
          description="Let new users create Cartridge Store accounts."
          checked={values.auth_allow_registration === true}
          disabled={disabled}
          onChange={(checked) => setLegacyValue("auth_allow_registration", checked)}
        />
        <Switch
          label="Enable registration workflow"
          help="Controls the canonical registration policy used by the backend."
          description="Enable the canonical registration policy."
          checked={typedValues["registration.enabled"] === true}
          disabled={disabled}
          onChange={(checked) => setApplicationValue("registration.enabled", checked)}
        />
        <Switch
          label="Require email verification"
          help="Requires a verified email before an account becomes active. Enforced by the backend."
          description="Require a verified email before an account becomes active."
          checked={typedValues["registration.require_email_verification"] === true}
          disabled={disabled}
          onChange={(checked) =>
            setApplicationValue("registration.require_email_verification", checked)
          }
        />
      </div>
      <Field
        label="Session lifetime (seconds)"
        type="number"
        min={60}
        placeholder="86400"
        help="Maximum lifetime of a signed-in session, in seconds. Enforced by the backend."
        value={String(numberValue(typedValues, "session.lifetime_seconds", 86400))}
        onChange={(event) =>
          setApplicationValue("session.lifetime_seconds", Number(event.target.value))
        }
      />
    </SettingsSection>
  );
}

function PublishingSection({
  typedValues,
  disabled,
  setApplicationValue,
}: Pick<SettingsSectionContentProps, "typedValues" | "disabled" | "setApplicationValue">) {
  return (
    <SettingsSection
      icon={Rocket}
      title="Publishing and review"
      description="Control whether cartridges can be submitted and how review decisions are recorded."
    >
      <div className="grid gap-3">
        <Switch
          label="Enable publishing"
          help="Controls whether publishers can submit cartridge bundles. Enforced by the backend."
          description="Allow publishers to submit cartridge bundles for validation."
          checked={typedValues["publishing.enabled"] === true}
          disabled={disabled}
          onChange={(checked) => setApplicationValue("publishing.enabled", checked)}
        />
        <Switch
          label="Require a note when rejecting"
          help="Requires reviewers to explain requested changes when rejecting a submission. Enforced by the backend."
          description="Ask reviewers to explain requested changes."
          checked={typedValues["review.require_note_on_rejection"] === true}
          disabled={disabled}
          onChange={(checked) =>
            setApplicationValue("review.require_note_on_rejection", checked)
          }
        />
      </div>
      <label className="grid gap-1 text-sm font-medium" htmlFor="publishing-max-artifact-size">
        <span className="flex items-center gap-1.5">
          Maximum artifact size
          <HelpTooltip
            label="Maximum artifact size"
            text="Maximum bundle size accepted by backend validation."
          />
        </span>
        <div className="flex">
          <input
            id="publishing-max-artifact-size"
            aria-describedby="publishing-max-artifact-size-help"
            className="min-h-10 min-w-0 flex-1 rounded-l-md border border-r-0 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-normal text-[var(--color-text)]"
            type="number"
            min={0.01}
            step={0.5}
            placeholder="50"
            disabled={disabled}
            value={String(megabytesValue(typedValues, "publishing.max_artifact_bytes", 52428800))}
            onChange={(event) => {
              const megabytes = Number(event.target.value);
              setApplicationValue(
                "publishing.max_artifact_bytes",
                Number.isFinite(megabytes) && megabytes > 0
                  ? Math.round(megabytes * 1024 * 1024)
                  : 0,
              );
            }}
          />
          <span className="grid min-w-14 place-items-center rounded-r-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm font-semibold text-[var(--color-text-muted)]">
            MB
          </span>
        </div>
        <span id="publishing-max-artifact-size-help" className="text-xs font-normal leading-5 text-[var(--color-text-muted)]">
          Maximum size allowed for an uploaded cartridge bundle.
        </span>
      </label>
    </SettingsSection>
  );
}

function TelemetrySection({
  typedValues,
  disabled,
  setApplicationValue,
}: Pick<SettingsSectionContentProps, "typedValues" | "disabled" | "setApplicationValue">) {
  return (
    <SettingsSection
      icon={Activity}
      title="Telemetry"
      description="Choose which optional runtime telemetry and security notifications are active."
    >
      <div className="grid gap-3">
        <Switch
          label="Collect telemetry"
          help="Allows compatible clients to submit runtime metrics and run samples. Enforced by the backend."
          description="Accept runtime metrics and run samples from compatible clients."
          checked={typedValues["telemetry.collection_enabled"] === true}
          disabled={disabled}
          onChange={(checked) => setApplicationValue("telemetry.collection_enabled", checked)}
        />
        <Switch
          label="Notify users about account changes"
          help="Controls security notifications for account changes. The setting is stored, but notification delivery is not currently wired."
          description="Send security notifications when account data changes."
          checked={typedValues["security.notify_user_on_account_change"] === true}
          disabled={disabled}
          onChange={(checked) =>
            setApplicationValue("security.notify_user_on_account_change", checked)
          }
        />
      </div>
    </SettingsSection>
  );
}

function DiscoverySection({
  typedValues,
  disabled,
  mdnsInfo,
  discoveryInfo,
  mdnsRuntimeEnabled,
  setApplicationValue,
}: Pick<
  SettingsSectionContentProps,
  | "typedValues"
  | "disabled"
  | "mdnsInfo"
  | "discoveryInfo"
  | "mdnsRuntimeEnabled"
  | "setApplicationValue"
>) {
  return (
    <SettingsSection
      icon={RadioTower}
      title="Discovery"
      description="Manage local mDNS discovery and inspect the fixed PRG32 discovery contract."
    >
      <div className="rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]/45 p-5">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--color-surface)] text-[var(--color-primary-strong)]">
              <Network aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="technical-label text-[var(--color-primary-strong)]">Local network discovery</p>
              <h3 className="mt-1 text-lg font-bold">Find the Cartridge Store on your network.</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                Save the preference to start or stop the local mDNS advertisement without restarting the backend.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 lg:min-w-64">
            <span
              className={[
                "inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-semibold",
                mdnsRuntimeEnabled
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)]",
              ].join(" ")}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {mdnsRuntimeEnabled ? "Advertised" : "Not advertised"}
            </span>
            <Switch
              label="Enable mDNS discovery"
              help="Advertises this Store on the local network using the fixed PRG32 discovery contract."
              description="Advertise this Store on the local network when saved."
              checked={typedValues["discovery.mdns_enabled"] === true}
              disabled={disabled}
              onChange={(checked) => setApplicationValue("discovery.mdns_enabled", checked)}
            />
          </div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-[var(--color-primary)]/15 pt-4 sm:grid-cols-3">
          <div>
            <dt className="technical-label text-[var(--color-text-muted)]">Service type</dt>
            <dd className="mt-1 font-mono text-sm font-semibold">
              {readOnlyValue(mdnsInfo, "service_type", "_prg32store._tcp")}
            </dd>
          </div>
          <div>
            <dt className="technical-label text-[var(--color-text-muted)]">Discovery ABI</dt>
            <dd className="mt-1 font-mono text-sm font-semibold">
              {readOnlyValue(discoveryInfo, "abi", "prg32-store-discovery-1.0")}
            </dd>
          </div>
          <div>
            <dt className="technical-label text-[var(--color-text-muted)]">Port</dt>
            <dd className="mt-1 font-mono text-sm font-semibold">
              {readOnlyValue(mdnsInfo, "port", "5080")}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-[var(--color-text-muted)]">
          The deployment must allow mDNS before this preference can be enabled. The current runtime state is shown above.
        </p>
      </div>
    </SettingsSection>
  );
}

function EmailSection({
  typedValues,
  disabled,
  setApplicationValue,
  smtpRecipient,
  setSmtpRecipient,
  smtpPassword,
  setSmtpPassword,
  smtpLog,
  onTestConnection,
  onSendTestMessage,
  testConnectionPending,
  sendTestMessagePending,
}: Pick<
  SettingsSectionContentProps,
  | "typedValues"
  | "disabled"
  | "setApplicationValue"
  | "smtpRecipient"
  | "setSmtpRecipient"
  | "smtpPassword"
  | "setSmtpPassword"
  | "smtpLog"
  | "onTestConnection"
  | "onSendTestMessage"
  | "testConnectionPending"
  | "sendTestMessagePending"
>) {
  const securityMode = typedValues["smtp.secure"] === true || typedValues["smtp.encryption"] === "implicit_tls"
    ? "tls"
    : typedValues["smtp.encryption"] === "starttls"
      ? "starttls"
      : "none";

  function setSecurityMode(mode: string) {
    setApplicationValue("smtp.secure", mode === "tls");
    setApplicationValue("smtp.encryption", mode === "tls" ? "implicit_tls" : mode);
  }

  return (
    <SettingsSection
      icon={Mail}
      title="Email delivery"
      description="Configure SMTP delivery for transactional and security messages. Secrets remain write-only."
    >
      <div className="grid gap-3">
        <Switch
          label="Enable SMTP"
          help="Allows transactional and security email to be delivered through the configured SMTP server."
          description="Allow the service to deliver email through the configured SMTP server."
          checked={typedValues["smtp.enabled"] === true}
          disabled={disabled}
          onChange={(checked) => setApplicationValue("smtp.enabled", checked)}
        />
      </div>
      <div className="space-y-4 border-t border-[var(--color-border)] pt-5">
        <div>
          <p className="technical-label text-[var(--color-primary)]">SMTP server</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Choose where the Store connects and how the connection is secured.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="SMTP host" placeholder="mailpit" help="Hostname or IP address of the SMTP server. In local development this is commonly the shared Mailpit hostname." value={textValue(typedValues, "smtp.host")} onChange={(event) => setApplicationValue("smtp.host", event.target.value)} />
          <Field label="SMTP port" type="number" placeholder="1025" help="TCP port exposed by the SMTP server. Mailpit commonly uses 1025 in development." value={String(numberValue(typedValues, "smtp.port", 1025))} onChange={(event) => setApplicationValue("smtp.port", Number(event.target.value))} />
          <SelectField
            label="Connection security"
            name="smtp-security"
            value={securityMode}
            onValueChange={setSecurityMode}
            disabled={disabled}
            description="Choose plain SMTP, STARTTLS, or implicit TLS."
            help="Plain SMTP sends without TLS; STARTTLS upgrades the connection; TLS / SSL starts encrypted immediately."
          >
            <SelectItem value="none">Plain SMTP</SelectItem>
            <SelectItem value="starttls">STARTTLS</SelectItem>
            <SelectItem value="tls">TLS / SSL</SelectItem>
          </SelectField>
        </div>
      </div>
      <div className="space-y-4 border-t border-[var(--color-border)] pt-5">
        <div>
          <p className="technical-label text-[var(--color-primary)]">Authentication</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Keep the SMTP username and password together. Leave authentication off for Mailpit.</p>
        </div>
        <Switch
          label="Enable SMTP authentication"
          help="Authenticates with the configured SMTP username and password. Leave it off for Mailpit."
          description="Authenticate with the configured SMTP username and password."
          checked={typedValues["smtp.auth_enabled"] === true}
          disabled={disabled}
          onChange={(checked) => setApplicationValue("smtp.auth_enabled", checked)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="SMTP username" placeholder="smtp-user" help="Username sent to the SMTP server when authentication is enabled." value={textValue(typedValues, "smtp.username")} onChange={(event) => setApplicationValue("smtp.username", event.target.value)} />
          <Field label="SMTP password" type="password" value={smtpPassword} placeholder="Leave blank to keep the saved password" help="Write-only SMTP credential. Leave blank to keep the existing saved password." autoComplete="new-password" onChange={(event) => setSmtpPassword(event.target.value)} />
        </div>
      </div>
      <div className="space-y-4 border-t border-[var(--color-border)] pt-5">
        <div>
          <p className="technical-label text-[var(--color-primary)]">Sender identity</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Set the name and addresses used by transactional messages.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="From name" placeholder="PRG32 Cartridge Store" help="Display name shown as the sender of transactional messages." value={textValue(typedValues, "smtp.from_name", "PRG32 Cartridge Store")} onChange={(event) => setApplicationValue("smtp.from_name", event.target.value)} />
          <Field label="From email" type="email" placeholder="no-reply@example.test" help="Email address used in the From header of transactional messages." value={textValue(typedValues, "smtp.from_email")} onChange={(event) => setApplicationValue("smtp.from_email", event.target.value)} />
          <Field label="Reply-to" type="email" placeholder="support@example.test" help="Optional address that receives replies to transactional messages." value={textValue(typedValues, "smtp.reply_to")} onChange={(event) => setApplicationValue("smtp.reply_to", event.target.value)} />
        </div>
      </div>
      <div className="grid items-stretch gap-6 border-t border-[var(--color-border)] pt-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="flex h-full flex-col">
          <div>
            <p className="technical-label text-[var(--color-primary)]">Connection check</p>
            <h3 className="mt-1 text-sm font-semibold">Verify the SMTP server</h3>
            <p className="mt-1 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">Check the server handshake without sending an email.</p>
          </div>
          <div className="mt-auto pt-4">
            <Button disabled={testConnectionPending} onClick={onTestConnection}>
              <PlugZap aria-hidden="true" className="size-4" />
              {testConnectionPending ? "Testing…" : "Test SMTP connection"}
            </Button>
          </div>
        </div>
        <div className="flex h-full flex-col">
          <div>
            <p className="technical-label text-[var(--color-primary)]">Message delivery</p>
            <h3 className="mt-1 text-sm font-semibold">Send a test message</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">Choose a recipient to verify the complete delivery path.</p>
          </div>
          <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:items-end">
            <Field className="min-w-0 flex-1" label="Test recipient" type="email" placeholder="admin@example.test" help="Recipient for the manual SMTP test message. It is used only when you click Send test message." value={smtpRecipient} onChange={(event) => setSmtpRecipient(event.target.value)} />
            <Button variant="secondary" className="sm:shrink-0" disabled={!smtpRecipient || sendTestMessagePending} onClick={onSendTestMessage}>
              <Send aria-hidden="true" className="size-4" />
              {sendTestMessagePending ? "Sending…" : "Send test message"}
            </Button>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
        <div className="flex items-center gap-2">
          <Terminal aria-hidden="true" className="size-4 text-[var(--color-primary-strong)]" />
          <h3 className="text-sm font-semibold">Connection log</h3>
        </div>
        <div className="mt-3 min-h-20 rounded-md bg-[var(--color-text)] p-3 font-mono text-xs leading-6 text-white" aria-live="polite">
          {smtpLog.length > 0 ? smtpLog.map((entry, index) => (
            <p
              className={entry.tone === "error" ? "text-red-300" : entry.tone === "success" ? "text-emerald-300" : "text-white"}
              key={`${entry.message}-${index}`}
            >
              {entry.message}
            </p>
          )) : <p className="text-white/60">No connection tests run yet.</p>}
        </div>
      </div>
    </SettingsSection>
  );
}

type EmailTemplatePreview = {
  id: string;
  name: string;
  description: string;
  variables: string[];
  subject: string;
  text: string;
  action?: {
    label: string;
    href: string;
  };
};

function templatePreviews(value: unknown): EmailTemplatePreview[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const item = candidate as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.name !== "string" || typeof item.subject !== "string" || typeof item.text !== "string") return [];
    const action = item.action && typeof item.action === "object" && !Array.isArray(item.action)
      ? item.action as Record<string, unknown>
      : undefined;
    const parsedAction = typeof action?.label === "string" && typeof action.href === "string" && /^https?:\/\//.test(action.href)
      ? { label: action.label, href: action.href }
      : undefined;
    return [{
      id: item.id,
      name: item.name,
      description: typeof item.description === "string" ? item.description : "",
      variables: Array.isArray(item.variables) ? item.variables.filter((variable): variable is string => typeof variable === "string") : [],
      subject: item.subject,
      text: item.text,
      ...(parsedAction === undefined ? {} : { action: parsedAction }),
    }];
  });
}

function EmailTemplatesSection({
  emailTemplates,
  logoUrl,
  typedValues,
  disabled,
  setApplicationValue,
}: Pick<SettingsSectionContentProps, "emailTemplates" | "logoUrl" | "typedValues" | "disabled" | "setApplicationValue">) {
  const templates = templatePreviews(emailTemplates);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const managedLogo = logoUrl || "/prg32_logo_transparent.png";
  const [failedLogo, setFailedLogo] = useState("");
  const previewLogo = failedLogo === managedLogo ? "/prg32_logo_transparent.png" : managedLogo;
  const subjectKey = selected?.id === "smtp_test" ? "email.smtp_test_subject" : "email.approval_subject";
  const bodyKey = selected?.id === "smtp_test" ? "email.smtp_test_body" : "email.approval_body";
  const subjectValue = selected ? textValue(typedValues, subjectKey, selected.subject) : "";
  const bodyValue = selected ? textValue(typedValues, bodyKey, selected.text) : "";
  const previewSubject = selected ? interpolateEmailPreview(subjectValue) : "";
  const previewBody = selected ? previewEmailBody(bodyValue, selected.id) : "";

  return (
    <SettingsSection
      icon={MailOpen}
      title="Email templates"
      description="Choose a message to understand when it is sent, who receives it, and what the final email looks like."
    >
      {templates.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No email templates are available.</p>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="surface-card p-4" aria-label="Email template library">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3">
              <div>
                <p className="technical-label text-[var(--color-primary)]">Library</p>
                <h3 className="mt-1 font-bold">Message types</h3>
              </div>
              <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-1 text-xs font-bold text-[var(--color-primary-strong)]">{templates.length}</span>
            </div>
            <div className="mt-3 space-y-2" role="tablist" aria-label="Email templates">
              {templates.map((template) => {
                const active = template.id === selected?.id;
                const isTest = template.id === "smtp_test";
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedId(template.id)}
                    className={[
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
                      active
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
                        : "border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-muted)]",
                    ].join(" ")}
                  >
                    <span className={["grid size-8 shrink-0 place-items-center rounded-md", active ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-primary-strong)]"].join(" ")}>
                      <MailOpen aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{template.name}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">{isTest ? "Manual delivery check" : "Submission approved"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <p className="text-xs font-semibold">How to read this page</p>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Select a template to inspect its trigger, recipient, subject, and rendered body.</p>
            </div>
          </aside>

          {selected && (
            <div className="min-w-0 space-y-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="technical-label text-[var(--color-primary)]">Selected template</p>
                  <h3 className="mt-1 text-xl font-bold">{selected.name}</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">{selected.description}</p>
                </div>
                <span className="w-fit rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)]">{selected.id === "smtp_test" ? "Manual test" : "Workflow notification"}</span>
              </div>

              <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-labelledby="email-template-editor-heading">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div>
                    <p className="technical-label text-[var(--color-primary)]">Template editor</p>
                    <h4 id="email-template-editor-heading" className="mt-1 font-bold">Edit this message</h4>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">Change only the subject and message body. The secure Store branding and action button stay managed by the platform.</p>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary-strong)]">Editable</span>
                </div>
                <div className="mt-5 grid gap-4">
                  <label className="grid gap-1.5 text-sm font-semibold" htmlFor="email-template-subject">
                    Subject line
                    <input
                      id="email-template-subject"
                      className="min-h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-normal text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                      disabled={disabled}
                      value={subjectValue}
                      onChange={(event) => setApplicationValue(subjectKey, event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-semibold" htmlFor="email-template-body">
                    Message body
                    <textarea
                      id="email-template-body"
                      className="min-h-36 resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-normal leading-6 text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                      disabled={disabled}
                      rows={7}
                      value={bodyValue}
                      onChange={(event) => setApplicationValue(bodyKey, event.target.value)}
                    />
                  </label>
                  <p className="text-xs leading-5 text-[var(--color-text-muted)]">Use the variables shown in Available variables, for example <code className="rounded bg-[var(--color-surface-muted)] px-1 py-0.5">{"{{gameTitle}}"}</code>. HTML is not accepted in the body.</p>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4" aria-labelledby="email-template-variables-heading">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <div>
                        <p id="email-template-variables-heading" className="technical-label text-[var(--color-primary)]">Available variables</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Values filled from the submission, publisher, or Store configuration when the message is sent.</p>
                      </div>
                      <span className="text-xs font-semibold text-[var(--color-text-muted)]">{selected.variables.length} available</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selected.variables.map((variable) => <code key={variable} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-primary-strong)]">{`{{${variable}}}`}</code>)}
                    </div>
                  </div>
                </div>
              </section>

              <article className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 sm:px-5">
                  <div>
                    <p className="technical-label text-[var(--color-primary)]">Inbox preview</p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">This is the message layout the recipient will receive.</p>
                  </div>
                  <Mail aria-hidden="true" className="size-5 text-[var(--color-text-muted)]" />
                </div>
                <div className="bg-white p-5 text-[var(--color-text)] sm:p-7">
                  <div className="mb-5 flex items-center gap-3 border-b border-slate-200 pb-5">
                    <span className="relative grid h-11 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-950">
                      <Image
                        src={previewLogo}
                        alt="PRG32"
                        width={64}
                        height={44}
                        unoptimized
                        onError={() => setFailedLogo(managedLogo)}
                        className="h-11 w-16 object-contain"
                      />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">PRG32 Cartridge Store</p>
                      <p className="mt-0.5 text-xs text-slate-500">Transactional message</p>
                    </div>
                  </div>
                  <dl className="grid gap-2 border-b border-slate-200 pb-5 text-sm sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-x-4">
                    <dt className="font-semibold text-slate-500">From</dt>
                    <dd>PRG32 Cartridge Store</dd>
                    <dt className="font-semibold text-slate-500">To</dt>
                    <dd>{selected.id === "smtp_test" ? "Configured test recipient" : "Ivan · publisher"}</dd>
                    <dt className="font-semibold text-slate-500">Subject</dt>
                    <dd className="font-bold sm:col-span-1">{previewSubject}</dd>
                  </dl>
                  <p className="whitespace-pre-wrap pt-6 text-sm leading-7 text-slate-700">{previewBody}</p>
                  {selected.action && (
                    <div className="pt-7">
                      <a
                        href={selected.action.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 border-2 border-[#171225] bg-[#b8f34a] px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-[#171225] shadow-[4px_4px_0_#171225] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_#171225] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7044dc]"
                      >
                        <span aria-hidden="true">▶</span>
                        {selected.action.label}
                      </a>
                    </div>
                  )}
                </div>
              </article>

              <div>
                <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5" aria-labelledby="template-trigger-heading">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <div className="flex items-baseline gap-3">
                      <p className="technical-label text-[var(--color-primary)]">Trigger</p>
                      <h4 id="template-trigger-heading" className="font-bold">{selected.id === "smtp_test" ? "Sent manually" : "Submission approved"}</h4>
                    </div>
                    <p className="text-sm leading-6 text-[var(--color-text-muted)]">{selected.id === "smtp_test" ? "Sent from Email delivery when you choose a test recipient." : "Sent after an administrator approves a publisher submission."}</p>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

export function SettingsSectionContent(props: SettingsSectionContentProps) {
  switch (props.activeSection) {
    case "general":
      return <GeneralSection {...props} />;
    case "appearance":
      return <AppearanceSection {...props} />;
    case "registration":
      return <RegistrationSection {...props} />;
    case "publishing":
      return <PublishingSection {...props} />;
    case "telemetry":
      return <TelemetrySection {...props} />;
    case "discovery":
      return <DiscoverySection {...props} />;
    case "email":
      return <EmailSection {...props} />;
    case "email-templates":
      return <EmailTemplatesSection {...props} />;
  }
}

function interpolateEmailPreview(value: string): string {
  const sampleValues: Record<string, string> = {
    recipientName: "Ivan",
    gameTitle: "Asteroids",
    gameId: "it.uniparthenope.asteroids",
    version: "1.0.0",
    reviewerName: "Store administrator",
    storeName: "PRG32 Cartridge Store",
    publicOrigin: "https://store.prg32.dream.test",
    publicUrl: "https://store.prg32.dream.test/games/it.uniparthenope.asteroids?version=1.0.0",
  };
  return value.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_, key: string) => sampleValues[key] ?? "");
}

function previewEmailBody(value: string, templateId: string): string {
  const body = interpolateEmailPreview(value);
  if (templateId === "smtp_test") return "Hello,\n\n" + body + "\n\n— PRG32 Cartridge Store";
  return "Hi Ivan,\n\n" + body + "\n\nView it in the public catalog: https://store.prg32.dream.test/games/it.uniparthenope.asteroids?version=1.0.0\nReviewed by: Store administrator\nGame ID: it.uniparthenope.asteroids\n\n— PRG32 Cartridge Store";
}
