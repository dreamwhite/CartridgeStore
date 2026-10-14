import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import WebSocket from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/env.js";

const children: ChildProcessWithoutNullStreams[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill("SIGTERM");
});

describe("M5.2g.4 Flask/Fastify multiplayer differential", () => {
  it("matches the anonymous loopback protocol for join, state, leave and malformed input", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "prg32-mp-differential-"));
    const flask = await startFlask(root);
    const fastify = buildApp({ config: loadConfig({ PRG32_BACKEND_DB: "/does/not/exist/store.sqlite" }), logger: false });
    await fastify.listen({ host: "127.0.0.1", port: 0 });
    const address = fastify.server.address();
    if (!address || typeof address === "string") throw new Error("Fastify test server did not expose a TCP address");
    const fastifyPort = address.port;
    const scenarios = await runScenario(flask, fastifyPort);
    expect(scenarios.flask).toEqual(scenarios.fastify);
    await fastify.close();
    fs.rmSync(root, { recursive: true, force: true });
  }, 30_000);
});

async function startFlask(dataRoot: string): Promise<number> {
  const script = [
    "import sys",
    "from cartridge_store import create_app",
    "from werkzeug.serving import make_server",
    "app = create_app({'TESTING': True, 'DATA_DIR': sys.argv[1]})",
    "server = make_server('127.0.0.1', 0, app, threaded=True)",
    "print(server.server_port, flush=True)",
    "server.serve_forever()"
  ].join("; ");
  const child = spawn(path.join(process.cwd(), "../.venv313/bin/python"), ["-c", script, dataRoot], { cwd: path.resolve(process.cwd(), "..") });
  children.push(child);
  return new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      const port = Number(output.trim().split(/\s+/u)[0]);
      if (Number.isSafeInteger(port) && port > 0) {
        child.stdout.off("data", onData);
        resolve(port);
      }
    };
    child.stdout.on("data", onData);
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`Flask differential process exited before readiness: ${code ?? "unknown"}`)));
  });
}

async function runScenario(flaskPort: number, fastifyPort: number): Promise<{ flask: unknown[]; fastify: unknown[] }> {
  const flaskClients = await connectPair(flaskPort);
  const fastifyClients = await connectPair(fastifyPort);
  try {
    return {
      flask: await scenario(flaskClients[0], flaskClients[1]),
      fastify: await scenario(fastifyClients[0], fastifyClients[1])
    };
  } finally {
    for (const socket of [...flaskClients, ...fastifyClients]) socket.close();
  }
}

async function connectPair(port: number): Promise<[WebSocket, WebSocket]> {
  const first = new WebSocket(`ws://127.0.0.1:${port}/api/multiplayer`);
  const second = new WebSocket(`ws://127.0.0.1:${port}/api/multiplayer`);
  await Promise.all([opened(first), opened(second)]);
  return [first, second];
}

async function scenario(first: WebSocket, second: WebSocket): Promise<unknown[]> {
  const events: unknown[] = [];
  first.send(JSON.stringify({ type: "join", signature: "differential-room", player_id: 7 }));
  events.push(await next(first));
  second.send(JSON.stringify({ type: "join", signature: "differential-room", player_id: 8 }));
  events.push(await next(second));
  first.send(JSON.stringify({ type: "state", x: 10, y: 20, frame: 7 }));
  events.push(await next(second));
  second.send("not-json");
  events.push(await next(second));
  second.send(JSON.stringify({ type: "leave" }));
  events.push(await next(first));
  return events;
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function next(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (payload) => {
      try { resolve(JSON.parse(rawText(payload)) as Record<string, unknown>); }
      catch (error) { reject(error instanceof Error ? error : new Error("invalid WebSocket JSON")); }
    });
    socket.once("error", reject);
  });
}

function rawText(payload: WebSocket.RawData): string {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) return Buffer.concat(payload).toString("utf8");
  if (payload instanceof ArrayBuffer) return Buffer.from(payload).toString("utf8");
  return Buffer.from(payload).toString("utf8");
}
