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

export const authOperationResponseSchema = z
  .object({ ok: z.literal(true), message: z.string() })
  .passthrough();

export const authTokenSchema = z
  .object({ id: z.number().int().positive(), label: z.string(), created_at: z.string(), last_used: z.string() })
  .passthrough();

export const authTokensResponseSchema = z
  .object({ ok: z.literal(true), tokens: z.array(authTokenSchema) })
  .passthrough();

export const authTokenCreatedResponseSchema = z
  .object({ ok: z.literal(true), id: z.number().int().positive(), label: z.string(), token: z.string().min(1) })
  .passthrough();

export const authTokenUpdatedResponseSchema = z
  .object({ ok: z.literal(true), id: z.number().int().positive(), label: z.string() })
  .passthrough();

export const registrationRequestedResponseSchema = z
  .object({ ok: z.literal(true), email: z.string(), message: z.string() })
  .passthrough();

export const passkeySchema = z.object({
  id: z.string(), display_name: z.string(), device_type: z.string(), backed_up: z.boolean(), transports: z.array(z.string()), created_at: z.string(), last_used_at: z.string().nullable(), revoked: z.boolean()
}).passthrough();
export const passkeysResponseSchema = z.object({ ok: z.literal(true), credentials: z.array(passkeySchema) }).passthrough();
export const passkeyOptionsResponseSchema = z.object({ ok: z.literal(true), options: z.record(z.string(), z.unknown()) }).passthrough();
export const passkeyMutationResponseSchema = z.object({ ok: z.literal(true) }).passthrough();

export const workflowSubmissionSchema = z
  .object({
    id: z.number().int().positive(),
    game_id: z.string(),
    version: z.string(),
    status: z.string(),
    submitted_by_user_id: z.number().int().nullable(),
    submitted_by: z.string(),
    reviewed_by_user_id: z.number().int().nullable(),
    reviewed_by: z.string().nullable(),
    pending_dir: z.string().nullable(),
    metadata_json: z.string(),
    architectures_json: z.string(),
    created_at: z.string(),
    reviewed_at: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    architectures: z.array(z.record(z.string(), z.unknown())),
    revision_of_submission_id: z.number().int().nullable().optional(),
    revision_number: z.number().int().optional(),
    review_history: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

export const publisherDraftSchema = z.object({
  id: z.string(), status: z.enum(["draft", "submitting", "submitted", "abandoned"]), metadata: z.record(z.string(), z.unknown()), has_artifact: z.boolean(), source_submission_id: z.number().int().nullable(), submitted_submission_id: z.number().int().nullable(), created_at: z.string(), updated_at: z.string(), submitted_at: z.string().nullable(),
}).passthrough();
export const draftResponseSchema = z.object({ ok: z.literal(true), draft: publisherDraftSchema }).passthrough();
export const draftListResponseSchema = z.object({ ok: z.literal(true), drafts: z.array(publisherDraftSchema) }).passthrough();

export const workflowSubmissionListResponseSchema = z
  .object({ ok: z.literal(true), submissions: z.array(workflowSubmissionSchema) })
  .passthrough();

export const workflowSubmissionResponseSchema = z
  .object({ ok: z.literal(true), submission: workflowSubmissionSchema })
  .passthrough();

export const workflowSubmissionResultSchema = z
  .object({
    status: z.literal("pending"),
    ok: z.literal(true),
    review_required: z.literal(true),
    submission_id: z.number().int().positive(),
    // Legacy submission responses used a numeric database id while the
    // canonical storage-v2 workflow returns the stable cartridge id.
    id: z.union([z.string().min(1), z.number().int().positive()]),
    version: z.string(),
    submitted: z.array(z.object({ architecture: z.string(), file: z.string() }).passthrough()),
  })
  .passthrough();

export const ownedSubmissionSummarySchema = z
  .object({
    id: z.number().int().positive(),
    game_id: z.string(),
    title: z.string(),
    version: z.string(),
    status: z.string(),
    created_at: z.string(),
    reviewed_at: z.string().nullable(),
  })
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

export const ownedSubmissionListResponseSchema = z
  .object({
    ok: z.literal(true),
    submissions: z.array(ownedSubmissionSummarySchema),
    pagination: paginationSchema,
  })
  .passthrough();

export const gameSchema = z
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

export const gameResponseSchema = z
  .object({
    ok: z.literal(true),
    game: gameSchema,
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

export const downloadSeriesPointSchema = z
  .object({ date: z.string(), downloads: z.number().int().nonnegative() })
  .passthrough();

export const downloadStatsSchema = z
  .object({
    series: z.array(downloadSeriesPointSchema),
    total: z.number().int().nonnegative(),
    top_games: z.array(z.object({
      id: z.string(),
      title: z.string(),
      downloads: z.number().int().nonnegative(),
      last_published: z.unknown(),
    }).passthrough()),
  })
  .passthrough();

export const gameDownloadStatsSchema = z
  .object({
    id: z.string(),
    total: z.number().int().nonnegative(),
    architectures: z.array(z.object({ architecture: z.string(), downloads: z.number().int().nonnegative() }).passthrough()),
    series: z.array(downloadSeriesPointSchema),
  })
  .passthrough();

export const scoreRecordSchema = z
  .object({
    game: z.string(),
    player: z.string(),
    score: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
    submitted_by: z.string(),
  })
  .passthrough();

export const scoresSchema = z.array(scoreRecordSchema);

export const scoreStatsSchema = z
  .object({ scores: z.array(scoreRecordSchema) })
  .passthrough();

export const runStatsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    finished: z.number().int().nonnegative(),
    active_last_7_days: z.number().int().nonnegative(),
  })
  .passthrough();

export const metricsRunSchema = z
  .object({
    run_id: z.string(),
    board_id: z.string(),
    target: z.string(),
    display_backend: z.string(),
    firmware_version: z.string(),
    firmware_git_sha: z.string(),
    game_name: z.string(),
    sample_period_frames: z.number().int().nonnegative(),
    started_at: z.number().int().nonnegative(),
    finished_at: z.number().int().nonnegative().nullable(),
    dropped_samples: z.number().int().nonnegative(),
    created_at: z.number().int().nonnegative(),
    submitted_by: z.string(),
    user_id: z.number().int().nullable(),
    sample_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const metricsSummarySchema = z
  .object({
    sample_count: z.number().int().nonnegative(),
    frame_us_avg: z.number().nonnegative(),
    frame_us_median: z.number().nonnegative(),
    frame_us_p95: z.number().nonnegative(),
    frame_us_max: z.number().nonnegative(),
    update_us_avg: z.number().nonnegative(),
    draw_us_avg: z.number().nonnegative(),
    present_us_avg: z.number().nonnegative(),
    fps_avg: z.number().nonnegative(),
    deadline_missed: z.number().int().nonnegative(),
  })
  .passthrough();

export const metricsRunDetailSchema = z
  .object({ ok: z.literal(true), run: metricsRunSchema, summary: metricsSummarySchema })
  .passthrough();

export const userProfileResponseSchema = z
  .object({ ok: z.literal(true), user: z.object({ username: z.string(), role: z.string(), created_at: z.string() }).passthrough(), run_count: z.number().int().nonnegative(), can_view_runs: z.boolean() })
  .passthrough();

export const userRunsResponseSchema = z
  .object({ ok: z.literal(true), user: z.object({ username: z.string() }).passthrough(), runs: z.array(metricsRunSchema.extend({ mean_frame_us: z.number(), p95_frame_us: z.number() })), pagination: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int(), pages: z.number().int(), has_next: z.boolean(), has_prev: z.boolean() }).passthrough() })
  .passthrough();

export const userRunResponseSchema = z
  .object({ ok: z.literal(true), user: z.object({ username: z.string() }).passthrough(), run: metricsRunSchema, summary: metricsSummarySchema })
  .passthrough();
