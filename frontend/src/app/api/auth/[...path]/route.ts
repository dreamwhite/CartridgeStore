const FASTIFY_TARGET = process.env.PRG32_AUTH_FASTIFY_TARGET?.trim().replace(/\/$/u, "");

function upstreamPath(path: readonly string[]): string {
  const suffix = "/" + path.map((part) => encodeURIComponent(part)).join("/");
  return path[0] === "providers" || path[0] === "oidc" || path[0] === "saml"
    ? `/api/auth${suffix}`
    : `/auth${suffix}`;
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  if (!FASTIFY_TARGET) return Response.json({ ok: false, error: "authentication integration is unavailable" }, { status: 404 });
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(upstreamPath(path), `${FASTIFY_TARGET}/`);
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const method = request.method.toUpperCase();
  const upstream = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  const getSetCookies = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const [name, value] of upstream.headers) {
    if (name !== "content-length" && name !== "set-cookie") responseHeaders.append(name, value);
  }
  for (const value of getSetCookies) responseHeaders.append("set-cookie", value);
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
