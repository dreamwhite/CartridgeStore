import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

import type { BackendConfig } from "../config/env.js";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 256 * 1024;

export class OutboundValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "OutboundValidationError";
  }
}

export interface ValidatedOutboundTarget {
  readonly hostname: string;
  readonly port: number;
  readonly address: string;
  readonly family: 4 | 6;
  readonly allowlisted: boolean;
  readonly lookup: net.LookupFunction;
}

type Lookup = (hostname: string, options: { all: true; verbatim?: boolean }) => Promise<Array<{ address: string; family: number }>>;

function mappedIpv4(address: string): string | null {
  const normalized = address.toLowerCase();
  return normalized.startsWith("::ffff:") && net.isIPv4(normalized.slice(7)) ? normalized.slice(7) : null;
}

function ipv4Forbidden(address: string): boolean {
  const parts = address.split(".").map(Number);
  const first = parts[0] ?? -1;
  const second = parts[1] ?? -1;
  const third = parts[2] ?? -1;
  return first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 0 && third === 0)
    || (first === 192 && second === 0 && third === 2) || (first === 192 && second === 168)
    || (first === 198 && second === 18) || (first === 198 && second === 19)
    || (first === 198 && second === 51 && third === 100) || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

export function isForbiddenAddress(address: string): boolean {
  const mapped = mappedIpv4(address);
  if (mapped) return ipv4Forbidden(mapped);
  if (net.isIPv4(address)) return ipv4Forbidden(address);
  const normalized = address.toLowerCase();
  if (!net.isIPv6(normalized)) return true;
  const first = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  return normalized === "::" || normalized === "::1" || (first >= 0xfc00 && first <= 0xfdff) || (first >= 0xfe80 && first <= 0xfebf)
    || (first >= 0xff00 && first <= 0xffff) || normalized.startsWith("2001:db8:");
}

function allowlisted(hostname: string, config: BackendConfig): boolean {
  return config.setupNetworkTestAllowlist.includes(hostname.toLowerCase());
}

function portValue(port: number | undefined, fallback: number): number {
  const value = port ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) throw new OutboundValidationError("provider_port_invalid", "outbound port is invalid");
  return value;
}

export async function resolveOutboundHost(hostnameValue: string, port: number | undefined, config: BackendConfig, options: { readonly lookup?: Lookup; readonly defaultPort?: number } = {}): Promise<ValidatedOutboundTarget> {
  const hostname = hostnameValue.trim().toLowerCase();
  if (!hostname || hostname.length > 253 || hostname.includes("/") || hostname.includes("\\") || hostname.includes("@")) throw new OutboundValidationError("provider_host_invalid", "outbound host is invalid");
  const resolvedPort = portValue(port, options.defaultPort ?? 443);
  const explicitlyAllowed = allowlisted(hostname, config);
  let addresses: Array<{ address: string; family: number }>;
  try {
    if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIPv4(hostname) ? 4 : 6 }];
    else addresses = await (options.lookup ?? ((value, lookupOptions) => dns.lookup(value, lookupOptions)))(hostname, { all: true, verbatim: true });
  } catch {
    throw new OutboundValidationError("provider_dns_failed", "outbound host could not be resolved");
  }
  const usable = addresses.filter((item) => (item.family === 4 || item.family === 6) && net.isIP(item.address) === item.family);
  if (usable.length === 0) throw new OutboundValidationError("provider_dns_failed", "outbound host could not be resolved");
  if (!explicitlyAllowed && usable.some((item) => isForbiddenAddress(item.address))) throw new OutboundValidationError("provider_private_target_denied", "outbound target is not allowed");
  const selected = usable[0]!;
  const lookup: net.LookupFunction = (_host, lookupOptions, callback) => {
    if (lookupOptions.all) callback(null, [{ address: selected.address, family: selected.family }]);
    else callback(null, selected.address, selected.family);
  };
  return { hostname, port: resolvedPort, address: selected.address, family: selected.family as 4 | 6, allowlisted: explicitlyAllowed, lookup };
}

export async function validateOutboundUrl(urlValue: string, config: BackendConfig, options: { readonly allowedProtocols?: readonly ("http:" | "https:")[]; readonly defaultPort?: number; readonly lookup?: Lookup } = {}): Promise<ValidatedOutboundTarget> {
  let url: URL;
  try { url = new URL(urlValue); } catch { throw new OutboundValidationError("provider_url_invalid", "outbound URL is invalid"); }
  const protocols = options.allowedProtocols ?? ["https:"];
  if (!protocols.includes(url.protocol as "http:" | "https:") || url.username || url.password || url.hash) throw new OutboundValidationError("provider_https_required", "remote provider metadata must use HTTPS");
  const defaultPort = options.defaultPort ?? (url.protocol === "https:" ? 443 : 80);
  return resolveOutboundHost(url.hostname, url.port ? Number(url.port) : defaultPort, config, options);
}

interface BoundedResponse {
  readonly status: number;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: Buffer;
}

function requestOnce(url: URL, target: ValidatedOutboundTarget, timeoutMs: number, maxBytes: number): Promise<BoundedResponse> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise<BoundedResponse>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    const request = client.request({
      hostname: url.hostname,
      port: target.port,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { accept: "application/json, application/xml, text/xml", host: url.host },
      lookup: target.lookup,
      ...(url.protocol === "https:" ? { rejectUnauthorized: true, servername: url.hostname } : {})
    }, (response) => {
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += value.byteLength;
        if (total > maxBytes) {
          response.destroy();
          fail(new OutboundValidationError("provider_metadata_too_large", "provider metadata is too large"));
          return;
        }
        chunks.push(value);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks, total) });
      });
      response.on("error", (error) => fail(error));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("outbound request timed out")));
    request.on("error", (error) => fail(error));
    request.end();
  }).catch((error) => {
    if (error instanceof OutboundValidationError) throw error;
    throw new OutboundValidationError("provider_fetch_failed", "provider metadata is unavailable");
  });
}

export async function fetchBoundedText(urlValue: string, config: BackendConfig, options: { readonly maxBytes?: number; readonly timeoutMs?: number; readonly maxRedirects?: number; readonly allowedProtocols?: readonly ("http:" | "https:")[]; readonly lookup?: Lookup } = {}): Promise<{ readonly url: string; readonly text: string }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? 2;
  let current: URL;
  try { current = new URL(urlValue); } catch { throw new OutboundValidationError("provider_url_invalid", "outbound URL is invalid"); }
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const targetOptions = {
      ...(options.allowedProtocols === undefined ? {} : { allowedProtocols: options.allowedProtocols }),
      ...(options.lookup === undefined ? {} : { lookup: options.lookup })
    };
    const target = await validateOutboundUrl(current.toString(), config, targetOptions);
    const response = await requestOnce(current, target, timeoutMs, maxBytes);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location || redirect === maxRedirects) throw new OutboundValidationError("provider_redirect_invalid", "provider metadata redirect chain is invalid");
      try { current = new URL(location, current); } catch { throw new OutboundValidationError("provider_redirect_invalid", "provider metadata redirect is invalid"); }
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new OutboundValidationError("provider_fetch_failed", "provider metadata is unavailable");
    return { url: current.toString(), text: response.body.toString("utf8") };
  }
  throw new OutboundValidationError("provider_redirect_invalid", "provider metadata redirect chain is invalid");
}
