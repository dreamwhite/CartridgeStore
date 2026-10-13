import crypto from "node:crypto";

import type { NormalizedResponse } from "./types.js";

const COMPARED_HEADERS = ["content-type", "content-disposition", "content-length", "cache-control", "etag"] as const;

export function normalizeResponse(status: number, headers: Headers | Record<string, string>, body: Uint8Array): NormalizedResponse {
  const selected: Record<string, string> = {};
  for (const name of COMPARED_HEADERS) {
    const value = headers instanceof Headers ? headers.get(name) : headers[name] ?? headers[name.toLowerCase()];
    if (value !== null && value !== undefined) selected[name] = value;
  }
  const bytes = Buffer.from(body);
  let json: unknown = null;
  const contentType = selected["content-type"] ?? "";
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(bytes.toString("utf8"));
    } catch {
      json = null;
    }
  }
  return {
    status,
    headers: selected,
    json,
    bodySha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    bodyBytes: bytes.byteLength,
    bodyBase64: bytes.toString("base64")
  };
}

export function jsonEqual(left: NormalizedResponse, right: NormalizedResponse): boolean {
  return JSON.stringify(stable(left.json)) === JSON.stringify(stable(right.json));
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

export function headersEqual(left: NormalizedResponse, right: NormalizedResponse): boolean {
  const normalized = (value: NormalizedResponse): Readonly<Record<string, string>> => {
    const headers = { ...value.headers };
    // JSON key ordering is not an API contract. Flask and the projection may
    // serialize the same object with different whitespace/order, so the
    // corresponding byte length is intentionally normalized for JSON only.
    if ((headers["content-type"] ?? "").includes("application/json")) delete headers["content-length"];
    // Flask's send_file ETag embeds disposable filesystem mtime/inode data;
    // it is not a firmware/API identifier and is intentionally nondeterministic
    // across the two isolated roots.
    delete headers.etag;
    return headers;
  };
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

export function bodyEqual(left: NormalizedResponse, right: NormalizedResponse): boolean {
  return left.bodySha256 === right.bodySha256 && left.bodyBytes === right.bodyBytes;
}
