import crypto from "node:crypto";

export interface SessionRecord {
  readonly id: string;
  readonly userId: number | null;
  readonly csrfToken: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface SessionCookieOptions {
  readonly name: string;
  readonly secure: boolean;
  readonly sameSite: "lax" | "strict" | "none";
  readonly maxAgeSeconds: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly secret: string, private readonly lifetimeSeconds: number) {}

  issue(userId: number | null, now = Date.now()): { readonly record: SessionRecord; readonly cookieValue: string } {
    const id = crypto.randomBytes(32).toString("base64url");
    const record: SessionRecord = {
      id,
      userId,
      csrfToken: crypto.randomBytes(32).toString("base64url"),
      createdAt: now,
      expiresAt: now + this.lifetimeSeconds * 1000
    };
    this.sessions.set(id, record);
    return { record, cookieValue: this.sign(id) };
  }

  get(cookieValue: string | undefined, now = Date.now()): SessionRecord | null {
    const id = this.verify(cookieValue);
    if (!id) return null;
    const record = this.sessions.get(id);
    if (!record || record.expiresAt <= now) {
      if (record) this.sessions.delete(id);
      return null;
    }
    return record;
  }

  rotate(old: SessionRecord | null, userId: number, now = Date.now()): { readonly record: SessionRecord; readonly cookieValue: string } {
    if (old) this.sessions.delete(old.id);
    return this.issue(userId, now);
  }

  invalidate(record: SessionRecord | null): void {
    if (record) this.sessions.delete(record.id);
  }

  clear(): void {
    this.sessions.clear();
  }

  private sign(id: string): string {
    const payload = `v1.${id}`;
    const signature = crypto.createHmac("sha256", this.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private verify(cookieValue: string | undefined): string | null {
    if (!cookieValue) return null;
    const parts = cookieValue.split(".");
    if (parts.length !== 3 || parts[0] !== "v1" || !parts[1] || !parts[2]) return null;
    const id = parts[1];
    const signature = parts[2];
    const expected = crypto.createHmac("sha256", this.secret).update(`v1.${id}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    return id;
  }
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  for (const item of (header ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator <= 0) continue;
    result.set(item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim()));
  }
  return result;
}

export function serializeSessionCookie(options: SessionCookieOptions, value: string, expires = false): string {
  const attributes = [
    `${options.name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`
  ];
  if (options.secure) attributes.push("Secure");
  if (expires) attributes.push("Max-Age=0");
  else attributes.push(`Max-Age=${options.maxAgeSeconds}`);
  return attributes.join("; ");
}
