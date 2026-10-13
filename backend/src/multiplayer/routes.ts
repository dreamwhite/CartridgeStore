import websocket from "@fastify/websocket";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RawData, WebSocket } from "ws";

import type { MultiplayerHub } from "./hub.js";

interface MultiplayerQuery {
  readonly token?: string;
}

export interface MultiplayerRouteOptions {
  readonly hub: MultiplayerHub;
}

export function registerMultiplayerRoutes(app: FastifyInstance, options: MultiplayerRouteOptions): void {
  app.register((scope) => {
    scope.register(websocket, { options: { maxPayload: 64 * 1024 } });
    scope.register((routes) => {
      const sockets = new Set<WebSocket>();
      routes.addHook("onClose", () => {
        for (const socket of sockets) socket.close(1001, "server shutting down");
        sockets.clear();
        options.hub.close();
      });

      routes.get("/api/multiplayer/status", (_request, reply) => {
        return reply.send({ ok: true, multiplayer: options.hub.status() });
      });

      routes.route<{ Querystring: MultiplayerQuery }>({
        method: "GET",
        url: "/api/multiplayer",
        handler: (request, reply) => {
          const scheme = request.protocol === "https" ? "wss" : "ws";
          return reply.send({
            ok: true,
            service: "PRG32 multiplayer relay",
            websocket: `${scheme}://${request.headers.host ?? "localhost"}/api/multiplayer`,
            auth_enabled: options.hub.authenticationEnabled,
            protocol: {
              join: { type: "join", signature: "game-v1", player_id: 1 },
              state: { type: "state", x: 0, y: 0, frame: 0 },
              leave: { type: "leave" }
            }
          });
        },
        wsHandler: (socket, request) => {
          sockets.add(socket);
          const connectionToken = tokenFromRequest(request);
          const peer = options.hub.connect(
            (message) => {
              if (socket.readyState !== socket.OPEN) throw new Error("socket is not open");
              socket.send(JSON.stringify(message));
            },
            connectionToken
          );
          socket.on("message", (payload) => {
            options.hub.receive(peer, rawDataText(payload));
          });
          const cleanup = () => {
            sockets.delete(socket);
            options.hub.leave(peer);
          };
          socket.on("close", cleanup);
          socket.on("error", cleanup);
        }
      });
    });
  });
}

function tokenFromRequest(request: FastifyRequest<{ Querystring: MultiplayerQuery }>): string {
  const authorization = request.headers.authorization;
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.query.token?.trim() ?? "";
}

function rawDataText(payload: RawData): string {
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) return Buffer.concat(payload).toString("utf8");
  if (payload instanceof ArrayBuffer) return Buffer.from(payload).toString("utf8");
  return payload.toString("utf8");
}
