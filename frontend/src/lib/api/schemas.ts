import { z } from "zod";

export const principalSchema = z
  .object({
    id: z.number().int().nullable(),
    name: z.string(),
    username: z.string(),
    email: z.string(),
    role: z.string(),
    groups: z.array(z.string()),
    authenticated: z.boolean(),
    permissions: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export const apiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z.string(),
    user: principalSchema.optional(),
  })
  .passthrough();

export const csrfResponseSchema = z
  .object({
    ok: z.literal(true),
    csrf_token: z.string().min(32),
  })
  .passthrough();

export const authProvidersResponseSchema = z
  .object({
    ok: z.literal(true),
    providers: z.array(z.object({
      provider_id: z.string().min(1),
      protocol: z.enum(["oidc", "saml"]),
      display_name: z.string().min(1),
      enabled: z.boolean(),
    })),
  })
  .passthrough();

export const authUserResponseSchema = z
  .object({
    ok: z.literal(true),
    user: principalSchema,
  })
  .passthrough();

export const authLogoutResponseSchema = z
  .object({ ok: z.literal(true) })
  .passthrough();

const paginationSchema = z
  .object({
    page: z.number().int(),
    per_page: z.number().int(),
    total: z.number().int().nonnegative(),
    pages: z.number().int().nonnegative(),
    has_next: z.boolean(),
    has_prev: z.boolean(),
    next_page: z.number().int().nullable(),
    prev_page: z.number().int().nullable(),
  })
  .passthrough();

const gameSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    authors: z.array(z.union([z.string(), z.object({ name: z.string().optional() }).passthrough()])),
    tags: z.array(z.string()),
    latest_version: z.string().nullable(),
    selected_version: z.string(),
    versions: z.array(z.string()),
    architectures: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    colophon: z.record(z.string(), z.unknown()).nullable(),
    variants: z.record(z.string(), z.record(z.string(), z.unknown())),
    publisher: z.string(),
    updated_at: z.string().nullable(),
  })
  .passthrough();

export const gamesResponseSchema = z
  .object({
    ok: z.literal(true),
    games: z.array(gameSchema),
    pagination: paginationSchema,
  })
  .passthrough();

export const discoveryDocumentSchema = z
  .object({
    abi: z.literal("prg32-store-discovery-1.0"),
    name: z.string(),
    api: z.string(),
    web: z.string(),
    version: z.string(),
    auth_enabled: z.boolean(),
    roles: z.array(z.string()),
    services: z.record(z.string(), z.string()),
  })
  .passthrough();
