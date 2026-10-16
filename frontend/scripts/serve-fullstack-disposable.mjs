import { createRequire } from "node:module";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";

const execPath = process.execPath;
const frontendRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(frontendRoot, "..");
const backendRoot = join(repositoryRoot, "backend");
const backendServer = join(backendRoot, "dist", "server.js");
const contractScript = join(frontendRoot, "scripts", "ui92-contract.mjs");
const authContractScript = join(frontendRoot, "scripts", "ui93-auth-contract.mjs");
const standaloneScript = join(frontendRoot, "scripts", "serve-standalone.mjs");
const authenticatedMode = process.env.PRG32_UI93_AUTHENTICATED === "1";
const securityCompletionMode = process.env.PRG32_UI931_COMPLETION === "1";
const distDir = authenticatedMode ? ".next-ui93" : ".next-ui92";
const buildOutput = join(frontendRoot, distDir);
const configuredEvidenceFile = process.env.PRG32_UI92_EVIDENCE_FILE?.trim();
const authBootstrapToken = process.env.PRG32_UI93_TEST_BOOTSTRAP_TOKEN?.trim() || "ui93-disposable-bootstrap-token-2026";
const authPassword = "ui93-disposable-password-2026";
const authAdminPassword = "ui93-disposable-admin-password-2026";
const authReviewerPassword = "ui93-disposable-reviewer-password-2026";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function within(root, candidate) {
  const value = relative(root, resolve(candidate));
  return value === "" || (!value.startsWith(`..${sep}`) && !value.startsWith(sep) && value !== "..");
}

function waitForExit(child, label) {
  return new Promise((resolveExit, reject) => {
    child.once("error", (error) => reject(new Error(`${label} failed to spawn: ${error.message}`)));
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function runCommand(command, args, options, label) {
  const child = spawn(command, args, { ...options, stdio: "inherit" });
  const result = await waitForExit(child, label);
  if (result.code !== 0) throw new Error(`${label} exited with ${result.code ?? result.signal}`);
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("could not allocate loopback port"));
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function assertPortFree(port, label) {
  await new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`${label} port ${port} is already in use; refusing to attach to an existing service`)));
    server.listen({ host: "127.0.0.1", port }, () => server.close((error) => error ? reject(error) : resolvePort()));
  });
}

function configuredPort(name) {
  const value = process.env[name]?.trim();
  if (!value) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`${name} must be a loopback TCP port between 1024 and 65535`);
  return port;
}

async function waitForHttp(url, child, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "not attempted";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited with ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`${label} did not become ready: ${lastError}`);
}

function cookieValue(headers) {
  const setCookie = headers.get("set-cookie") || "";
  const match = setCookie.match(/prg32_ts_session=([^;]+)/);
  return match?.[1] ? `prg32_ts_session=${match[1]}` : "";
}

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function seedAuthenticatedFixture(baseUrl) {
  const bootstrap = await jsonRequest(baseUrl, "/auth/bootstrap", {
    method: "POST",
    headers: { "x-prg32-bootstrap-token": authBootstrapToken },
    body: JSON.stringify({ username: "ui93-admin", email: "ui93-admin@example.test", password: authAdminPassword, password_confirm: authAdminPassword }),
  });
  if (bootstrap.response.status !== 201) throw new Error(`UI.9.3 disposable bootstrap failed with HTTP ${bootstrap.response.status}`);
  let adminCookie = cookieValue(bootstrap.response.headers);
  const csrf = await jsonRequest(baseUrl, "/auth/csrf", { headers: { cookie: adminCookie } });
  if (csrf.response.status !== 200 || typeof csrf.body.csrf_token !== "string") throw new Error("UI.9.3 disposable admin CSRF bootstrap failed");
  const groups = await jsonRequest(baseUrl, "/api/admin/groups", { headers: { cookie: adminCookie } });
  const editors = Array.isArray(groups.body.groups) ? groups.body.groups.find((group) => group?.name === "editors") : null;
  if (!editors?.id) throw new Error("UI.9.3 disposable editors group was not created");
  const createUser = async (username, email, password, groupIds = []) => {
    const result = await jsonRequest(baseUrl, "/api/admin/users", {
      method: "POST",
      headers: { cookie: adminCookie, "x-csrftoken": csrf.body.csrf_token },
      body: JSON.stringify({ username, email, password, password_confirm: password, role: "user", group_ids: groupIds }),
    });
    if (result.response.status !== 201) throw new Error(`UI.9.3 disposable identity seed failed with HTTP ${result.response.status}`);
  };
  await createUser("ui93-creator", "ui93-creator@example.test", authPassword);
  await createUser("ui93-reviewer", "ui93-reviewer@example.test", authReviewerPassword, [editors.id]);
  await createUser("ui93-user-a", "ui93-user-a@example.test", authPassword);
  await createUser("ui93-user-b", "ui93-user-b@example.test", authPassword);
  await createUser("ui93-rbac", "ui93-rbac@example.test", authPassword);
  if (securityCompletionMode) {
    const policy = await jsonRequest(baseUrl, "/api/admin/settings", {
      method: "PATCH",
      headers: { cookie: adminCookie, "x-csrftoken": csrf.body.csrf_token },
      body: JSON.stringify({ application_settings: { "session.lifetime_seconds": 60 } }),
    });
    if (policy.response.status !== 200) throw new Error(`UI.9.3.1 disposable session policy setup failed with HTTP ${policy.response.status}`);
  }
  return { adminCookie, csrfToken: csrf.body.csrf_token };
}

const originalTmp = tmpdir();
const runtimeRoot = await mkdtemp(join(originalTmp, authenticatedMode ? "prg32-ui93-runtime-" : "prg32-ui92-runtime-"));
process.env.TMPDIR = runtimeRoot;

let backend;
let frontend;
let shuttingDown = false;
let buildCreated = false;

async function cleanup(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [frontend, backend]) {
    if (child && child.exitCode === null) child.kill("SIGTERM");
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  if (buildCreated) await rm(buildOutput, { recursive: true, force: true });
  await rm(runtimeRoot, { recursive: true, force: true });
  process.exit(exitCode);
}

process.once("SIGINT", () => void cleanup(130));
process.once("SIGTERM", () => void cleanup(143));

try {
  if (await exists(buildOutput)) throw new Error(`${distDir} already exists; refusing to overwrite a non-harness build`);
  if (!(await exists(backendServer))) throw new Error("backend/dist/server.js is missing; build the frozen backend first");

  const harness = await import(join(backendRoot, "dist", "storage-v2", "differential", "harness.js"));
  const { createDisposableCanonicalReadFixture, disposeDifferentialFixtures } = harness;
  const fixture = createDisposableCanonicalReadFixture();
  const roots = [fixture.sourceRoot, fixture.targetRoot];
  if (!roots.every((root) => within(runtimeRoot, root))) throw new Error("fixture path escaped the disposable runtime root");
  if (!(await exists(fixture.sourceRoot)) || !(await exists(fixture.targetRoot))) throw new Error("fixture roots were not created");

  const backendPort = configuredPort("PRG32_UI92_BACKEND_PORT") ?? await freePort();
  const frontendPort = configuredPort("PRG32_UI92_FRONTEND_PORT") ?? await freePort();
  await assertPortFree(backendPort, "Fastify");
  await assertPortFree(frontendPort, "Next standalone");
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;
  const targetDatabasePath = join(fixture.targetRoot, "store.sqlite");
  const databasePath = authenticatedMode ? targetDatabasePath : join(fixture.sourceRoot, "cartridge_store.sqlite");
  const env = {
    ...process.env,
    NODE_ENV: "test",
    PRG32_BACKEND_HOST: "127.0.0.1",
    PRG32_BACKEND_PORT: String(backendPort),
    PRG32_BACKEND_DB: databasePath,
    PRG32_BACKEND_STORE_DATA: authenticatedMode ? fixture.targetRoot : fixture.sourceRoot,
    PRG32_BACKEND_CATALOG_READ_MODE: "canonical-disposable",
    PRG32_BACKEND_CANONICAL_STORAGE_ROOT: fixture.targetRoot,
    PRG32_BACKEND_CANONICAL_READ_AUTHORIZATION: "M5.2G1-DISPOSABLE-CANONICAL-READ",
    PRG32_BACKEND_MDNS_ENABLED: "false",
    PRG32_BACKEND_LOG_LEVEL: "warn",
    PRG32_BACKEND_SESSION_SECURE: "false",
    ...(authenticatedMode ? {
      PRG32_BACKEND_AUTH_WRITE_ENABLED: "true",
      PRG32_BACKEND_AUTH_WRITE_MODE: "test",
      PRG32_BACKEND_AUTH_WRITE_DB: targetDatabasePath,
      PRG32_BACKEND_AUTH_DISPOSABLE_ROOT: fixture.targetRoot,
      PRG32_BACKEND_BOOTSTRAP_TOKEN: authBootstrapToken,
      PRG32_BACKEND_SESSION_SECRET: "ui93-disposable-session-secret-2026-please-use-only-tests",
      PRG32_BACKEND_EMAIL_TRANSPORT: "memory",
      PRG32_BACKEND_AUTH_RATE_LIMIT_MAX: "100",
      PRG32_BACKEND_SESSION_LIFETIME_SECONDS: securityCompletionMode ? "60" : "28800",
      PRG32_BACKEND_WEBAUTHN_ENABLED: securityCompletionMode ? "true" : "false",
      ...(securityCompletionMode ? {
        PRG32_BACKEND_WEBAUTHN_RP_ID: "localhost",
        PRG32_BACKEND_WEBAUTHN_ORIGINS: `http://localhost:${frontendPort}`,
      } : {}),
      PRG32_BACKEND_CANONICAL_WORKFLOW_MODE: "disposable",
      PRG32_BACKEND_CANONICAL_WRITE_AUTHORIZATION: "M5.2G2-DISPOSABLE-CANONICAL-WRITE",
      PRG32_BACKEND_CANDIDATE_MODE: "two-service-disposable",
      PRG32_BACKEND_CANDIDATE_AUTHORIZATION: "M5.2G9-DISPOSABLE-TWO-SERVICE-CANDIDATE",
    } : {}),
    ...(authenticatedMode ? {
      PRG32_AUTH_INTEGRATION_ENABLED: "true",
      PRG32_AUTH_FASTIFY_TARGET: backendUrl,
      PRG32_ADMIN_FASTIFY_TARGET: backendUrl,
      PRG32_WORKFLOW_FASTIFY_TARGET: backendUrl,
      PRG32_UI93_AUTHENTICATED: "1",
    } : {}),
  };

  backend = spawn(execPath, [backendServer], { cwd: repositoryRoot, env, stdio: "inherit" });
  await waitForHttp(`${backendUrl}/ready`, backend, "Fastify");
  const ready = await (await fetch(`${backendUrl}/ready`)).json();
  if (ready.ok !== true) throw new Error("Fastify readiness response was not ready");

  const requireBackend = createRequire(join(backendRoot, "package.json"));
  const Database = requireBackend("better-sqlite3");
  const sqlite = new Database(targetDatabasePath, { readonly: true, fileMustExist: true });
  const expected = sqlite.prepare(
    "SELECT o.sha256, o.size_bytes FROM storage_objects o JOIN artifacts a ON a.object_id = o.object_id JOIN releases r ON r.release_id = a.release_id WHERE r.cartridge_id = ? AND r.version = ? AND a.architecture = ?"
  ).get("org.example.alpha", "2.0.0", "qemu");
  sqlite.close();
  if (!expected || typeof expected.sha256 !== "string") throw new Error("expected disposable artifact hash was not found");

  if (authenticatedMode) {
    await seedAuthenticatedFixture(backendUrl);
    console.log(`UI.9.3 disposable identities seeded through Fastify at ${backendUrl}; credentials remain harness-local`);
    await runCommand(execPath, [authContractScript], {
      cwd: repositoryRoot,
      env: { ...env, PRG32_UI93_BACKEND_URL: backendUrl, PRG32_UI93_TEST_BOOTSTRAP_TOKEN: authBootstrapToken },
    }, "UI.9.3 authenticated API contract verification");
  }

  const contractEnv = {
    ...env,
    PRG32_UI92_BACKEND_URL: backendUrl,
    PRG32_UI92_EXPECTED_DOWNLOAD_SHA256: expected.sha256,
    PRG32_UI92_EXPECTED_DOWNLOAD_BYTES: String(expected.size_bytes),
  };
  if (!authenticatedMode) await runCommand(execPath, ["--experimental-strip-types", contractScript], { cwd: repositoryRoot, env: contractEnv }, "UI.9.2 HTTP/Zod contract verification");

  await runCommand("pnpm", ["run", "build"], {
    cwd: frontendRoot,
    env: { ...env, PRG32_API_UPSTREAM: backendUrl, PRG32_NEXT_DIST_DIR: distDir },
  }, authenticatedMode ? "UI.9.3 disposable Next build" : "UI.9.2 disposable Next build");
  buildCreated = true;

  frontend = spawn(execPath, [standaloneScript], {
    cwd: frontendRoot,
    env: { ...env, PRG32_STANDALONE_DIST_DIR: distDir, PRG32_STANDALONE_PORT: String(frontendPort) },
    stdio: "inherit",
  });
  await waitForHttp(frontendUrl, frontend, "Next standalone");

  if (configuredEvidenceFile) {
    await writeFile(configuredEvidenceFile, JSON.stringify({
      backend_port: backendPort,
      frontend_port: frontendPort,
      catalog_database: "disposable canonical snapshot",
      expected_download_sha256: expected.sha256,
      expected_download_bytes: Number(expected.size_bytes),
      fixture_roots_relative: roots.map((root) => relative(runtimeRoot, root)),
    }) + "\n", { mode: 0o600 });
  }
  console.log(`${authenticatedMode ? (securityCompletionMode ? "UI.9.3.1 authenticated security" : "UI.9.3 authenticated") : "UI.9.2"} disposable full-stack runtime ready at ${frontendUrl}; Fastify is ${backendUrl}; all writable roots are harness-owned`);

  const frontendResult = await waitForExit(frontend, "Next standalone");
  if (!shuttingDown && frontendResult.code !== 0) throw new Error(`Next standalone exited with ${frontendResult.code ?? frontendResult.signal}`);
  disposeDifferentialFixtures();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await cleanup(1);
}
