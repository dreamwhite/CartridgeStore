import crypto from "node:crypto";

import type Database from "better-sqlite3";

import { hasAccountStateColumn } from "./account-state.js";

export interface TokenOwner {
  readonly id: number;
  readonly username: string;
  readonly email: string;
  readonly role: string;
  readonly groups: readonly string[];
}

export interface ApiTokenLookup {
  readonly tokenHash: string;
  readonly owner: TokenOwner;
  readonly label: string | null;
  readonly createdAt: string;
  readonly lastUsed: string | null;
}

export interface LegacyConfiguredUser {
  readonly name: string;
  readonly role: string;
  readonly token: string;
}

export function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function lookupApiToken(sqlite: Database.Database, token: string): ApiTokenLookup | null {
  const tokenHash = hashApiToken(token);
  const disabledColumn = hasAccountStateColumn(sqlite) ? ", users.disabled_at" : "";
  const row = sqlite.prepare(
    "SELECT api_tokens.token_hash, api_tokens.label, api_tokens.created_at, api_tokens.last_used," +
    " users.id, users.username, users.email, users.role" + disabledColumn +
    " FROM api_tokens JOIN users ON users.id = api_tokens.user_id" +
    " WHERE api_tokens.token_hash = ?"
  ).get(tokenHash) as
    | {
        token_hash: string;
        label: string | null;
        created_at: string;
        last_used: string | null;
        id: number;
        username: string;
        email: string;
        role: string;
        disabled_at?: string | null;
      }
    | undefined;
  if (!row || (row.disabled_at !== undefined && row.disabled_at !== null)) return null;
  const groups = sqlite
    .prepare(
      "SELECT groups.name FROM user_groups " +
      "JOIN groups ON groups.id = user_groups.group_id " +
      "WHERE user_groups.user_id = ? ORDER BY groups.name"
    )
    .all(row.id) as Array<{ name: string }>;
  return {
    tokenHash: row.token_hash,
    owner: {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role,
      groups: groups.map((group) => group.name)
    },
    label: row.label,
    createdAt: row.created_at,
    lastUsed: row.last_used
  };
}

function normalizeRole(value: unknown): string {
  const role = scalarString(value, "").trim().toLowerCase();
  if (!["reader", "user", "player", "publisher", "admin"].includes(role)) {
    throw new Error("unsupported configured role: " + role);
  }
  return role;
}

function scalarString(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : fallback;
}

export function parseLegacyConfiguredUsers(raw: unknown): LegacyConfiguredUser[] {
  if (raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null).map((item) => ({
      name: scalarString(item.name ?? item.user ?? item.role, "user").trim() || "user",
      role: normalizeRole(item.role ?? "reader"),
      token: scalarString(item.token, "").trim()
    }));
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([token, value]) => {
      if (typeof value === "object" && value !== null) {
        const item = value as Record<string, unknown>;
        return {
          name: scalarString(item.name ?? item.user ?? item.role, "user").trim() || "user",
          role: normalizeRole(item.role ?? "reader"),
          token: scalarString(item.token, token).trim() || token
        };
      }
      return { name: scalarString(value, "user").trim() || "user", role: normalizeRole(value), token };
    });
  }
  throw new Error("legacy user configuration must be a JSON array or object");
}

export function lookupLegacyConfiguredUser(users: readonly LegacyConfiguredUser[], token: string): LegacyConfiguredUser | null {
  return users.find((user) => user.token === token) ?? null;
}
