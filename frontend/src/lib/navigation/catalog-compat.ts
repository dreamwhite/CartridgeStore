export type PageSearchParams = Record<string, string | string[] | undefined>;

const CATALOG_QUERY_KEYS = ["q", "architecture", "sort", "page"] as const;

export function exploreRedirectPath(searchParams: PageSearchParams): string | null {
  const query = new URLSearchParams();

  for (const key of CATALOG_QUERY_KEYS) {
    const value = searchParams[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }

  const serialized = query.toString();
  return serialized ? `/explore?${serialized}` : null;
}
