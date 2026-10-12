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
