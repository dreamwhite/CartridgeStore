import { safeReturnPath } from "../auth/return-path";

export type CompatibilityDisposition = "next" | "redirect" | "legacy";

export type CompatibilityRoute = {
  source: string;
  target: string | null;
  disposition: CompatibilityDisposition;
  reason: string;
};

const STATIC_ROUTES: Record<string, CompatibilityRoute> = {
  "/": { source: "/", target: "/", disposition: "next", reason: "catalog" },
  "/scores": { source: "/scores", target: "/scores", disposition: "next", reason: "scoreboard" },
  "/stats": { source: "/stats", target: "/stats", disposition: "next", reason: "public statistics" },
  "/publish": { source: "/publish", target: "/publish", disposition: "next", reason: "publishing workflow" },
  "/review": { source: "/review", target: "/review", disposition: "next", reason: "review workflow" },
  "/workspace": { source: "/workspace", target: "/workspace", disposition: "next", reason: "developer workspace" },
  "/admin": { source: "/admin", target: "/admin", disposition: "next", reason: "administration workspace" },
  "/login": { source: "/login", target: "/login", disposition: "next", reason: "local and federated sign-in" },
  "/register": { source: "/register", target: "/register", disposition: "next", reason: "registration request" },
  "/register/complete": { source: "/register/complete", target: "/register/complete", disposition: "next", reason: "registration completion" },
  "/account": { source: "/account", target: "/account", disposition: "next", reason: "account and token management" },
  "/runs": { source: "/runs", target: "/runs", disposition: "next", reason: "private metrics runs" },
  "/setup": { source: "/setup", target: "/admin?section=settings", disposition: "redirect", reason: "settings are managed in the Fastify-backed admin workspace" },
  "/auth/login": { source: "/auth/login", target: "/login", disposition: "redirect", reason: "legacy auth URL" },
  "/auth/register": { source: "/auth/register", target: "/register", disposition: "redirect", reason: "legacy auth URL" },
  "/auth/register/complete": { source: "/auth/register/complete", target: "/register/complete", disposition: "redirect", reason: "legacy auth URL" },
  "/auth/tokens": { source: "/auth/tokens", target: "/account", disposition: "redirect", reason: "legacy token URL" },
};

function withSearch(target: string, source: URL): string {
  const query = source.searchParams.toString();
  return `${target.split("?", 1)[0]}${query ? `?${query}` : target.includes("?") ? target.slice(target.indexOf("?")) : ""}`;
}

/** Return a same-origin Next.js destination for a legacy browser URL. */
export function resolveCompatibilityRoute(input: string | URL): CompatibilityRoute {
  const source = typeof input === "string" ? new URL(input, "https://prg32-store.invalid") : input;
  const staticRoute = STATIC_ROUTES[source.pathname];
  if (staticRoute) return staticRoute.target ? { ...staticRoute, target: withSearch(staticRoute.target, source) } : staticRoute;
  if (/^\/games\/[^/]+$/u.test(source.pathname)) return { source: source.pathname, target: withSearch(source.pathname, source), disposition: "next", reason: "catalog detail" };
  if (/^\/runs\/[^/]+$/u.test(source.pathname)) return { source: source.pathname, target: withSearch(source.pathname, source), disposition: "next", reason: "metrics run detail" };
  if (/^\/admin\/federation(?:\/.*)?$/u.test(source.pathname)) return { source: source.pathname, target: withSearch(source.pathname, source), disposition: "next", reason: "federation administration" };
  if (/^\/editor\/submissions(?:\/.*)?$/u.test(source.pathname)) return { source: source.pathname, target: withSearch("/review", source), disposition: "redirect", reason: "review UI owns submission navigation" };
  if (/^\/users\/[^/]+(?:\/runs(?:\/[^/]+)?)?$/u.test(source.pathname)) return { source: source.pathname, target: withSearch(source.pathname, source), disposition: "next", reason: "profile and owner/admin metrics pages" };
  return { source: source.pathname, target: null, disposition: "legacy", reason: "no safe Next.js equivalent registered" };
}

/** Validate an application-level return path before using it in a redirect. */
export function compatibilityReturnPath(value: string | null | undefined): string {
  return safeReturnPath(value);
}
