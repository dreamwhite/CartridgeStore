export type Principal = {
  id: number | null;
  name: string;
  username: string;
  email: string;
  role: string;
  groups: string[];
  authenticated: boolean;
  permissions?: string[];
};

export type ApiError = {
  ok: false;
  error: string;
  code?: string;
  user?: Principal;
};

export type CsrfResponse = {
  ok: true;
  csrf_token: string;
};

export type AuthProvider = {
  provider_id: string;
  protocol: "oidc" | "saml";
  display_name: string;
  enabled: boolean;
};

export type AuthProvidersResponse = {
  ok: true;
  providers: AuthProvider[];
};

export type AuthUserResponse = {
  ok: true;
  user: Principal;
};

export type AuthLogoutResponse = {
  ok: true;
};

export type WorkflowSubmission = {
  id: number;
  game_id: string;
  version: string;
  status: string;
  submitted_by_user_id: number | null;
  submitted_by: string;
  reviewed_by_user_id: number | null;
  reviewed_by: string | null;
  pending_dir: string | null;
  metadata_json: string;
  architectures_json: string;
  created_at: string;
  reviewed_at: string | null;
  metadata: Record<string, unknown>;
  architectures: Array<Record<string, unknown>>;
};

export type WorkflowSubmissionListResponse = { ok: true; submissions: WorkflowSubmission[] };
export type WorkflowSubmissionResponse = { ok: true; submission: WorkflowSubmission };
export type WorkflowSubmissionResult = {
  status: "pending";
  ok: true;
  review_required: true;
  submission_id: number;
  id: number;
  version: string;
  submitted: Array<{ architecture: string; file: string }>;
};

export type OwnedSubmissionSummary = {
  id: number;
  game_id: string;
  title: string;
  version: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
};

export type OwnedSubmissionListResponse = {
  ok: true;
  submissions: OwnedSubmissionSummary[];
  pagination: Pagination;
};

export type Pagination = {
  page: number;
  per_page: number;
  total: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
  next_page: number | null;
  prev_page: number | null;
};

export type Game = {
  id: string;
  title: string;
  summary: string;
  authors: Array<{ name?: string } | string>;
  tags: string[];
  latest_version: string | null;
  selected_version: string;
  versions: string[];
  architectures: string[];
  metadata: Record<string, unknown> | null;
  colophon: Record<string, unknown> | null;
  variants: Record<string, Record<string, unknown>>;
  publisher: string;
  updated_at: string | null;
};

export type GamesResponse = {
  ok: true;
  games: Game[];
  pagination: Pagination;
};

export type DiscoveryDocument = {
  abi: "prg32-store-discovery-1.0";
  name: string;
  api: string;
  web: string;
  version: string;
  auth_enabled: boolean;
  roles: string[];
  services: Record<string, string>;
};

export type DownloadSeriesPoint = {
  date: string;
  downloads: number;
};

export type DownloadedGame = {
  id: string;
  title: string;
  downloads: number;
  last_published: unknown;
};

export type DownloadStats = {
  series: DownloadSeriesPoint[];
  total: number;
  top_games: DownloadedGame[];
};

export type GameDownloadStats = {
  id: string;
  total: number;
  architectures: Array<{ architecture: string; downloads: number }>;
  series: DownloadSeriesPoint[];
};

export type ScoreRecord = {
  game: string;
  player: string;
  score: number;
  created_at: number;
  submitted_by: string;
};

export type ScoreStats = { scores: ScoreRecord[] };

export type RunStats = {
  total: number;
  finished: number;
  active_last_7_days: number;
};

export type MetricsRun = {
  run_id: string;
  board_id: string;
  target: string;
  display_backend: string;
  firmware_version: string;
  firmware_git_sha: string;
  game_name: string;
  sample_period_frames: number;
  started_at: number;
  finished_at: number | null;
  dropped_samples: number;
  created_at: number;
  submitted_by: string;
  user_id: number | null;
  sample_count?: number;
};

export type MetricsSummary = {
  sample_count: number;
  frame_us_avg: number;
  frame_us_median: number;
  frame_us_p95: number;
  frame_us_max: number;
  update_us_avg: number;
  draw_us_avg: number;
  present_us_avg: number;
  fps_avg: number;
  deadline_missed: number;
};

export type MetricsRunDetail = {
  ok: true;
  run: MetricsRun;
  summary: MetricsSummary;
};
