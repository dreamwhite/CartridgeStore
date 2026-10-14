import { safeReturnPath } from "../auth/return-path";

export type NextSearchParams = Record<string, string | string[] | undefined>;

export function compatibilityDestination(path: string, params: NextSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const value of values) query.append(key, key === "return_to" ? safeReturnPath(value) : value);
  }
  const suffix = query.toString();
  return `${path}${suffix ? `?${suffix}` : ""}`;
}
