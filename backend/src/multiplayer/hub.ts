import { ANONYMOUS, principalToJson, roleAtLeast, type Principal } from "../auth/principal.js";

export const MULTIPLAYER_SIGNATURE_RE = /^[A-Za-z0-9_.:-]{1,47}$/;

export interface MultiplayerPeer {
  readonly sendJson: (message: Record<string, unknown>) => void;
  readonly connectionToken: string;
  principal: Principal;
  signature: string;
  flags: number;
  playerId: number;
  state: Record<string, unknown> | null;
}

export interface MultiplayerHubOptions {
  readonly maxPeers: number;
  readonly authenticationEnabled: boolean;
  readonly authenticate: (token: string) => Principal;
}

export class MultiplayerHub {
  readonly maxPeers: number;
  readonly authenticationEnabled: boolean;
  private readonly authenticateToken: (token: string) => Principal;
  private readonly groups = new Map<string, Set<MultiplayerPeer>>();
  private nextPlayerId = 1;

  constructor(options: MultiplayerHubOptions) {
    this.maxPeers = Math.max(1, options.maxPeers);
    this.authenticationEnabled = options.authenticationEnabled;
    this.authenticateToken = options.authenticate;
  }

  connect(sendJson: (message: Record<string, unknown>) => void, connectionToken = ""): MultiplayerPeer {
    return {
      sendJson,
      connectionToken,
      principal: this.authenticateToken(connectionToken),
      signature: "",
      flags: 0,
      playerId: 0,
      state: null
    };
  }

  receive(peer: MultiplayerPeer, raw: string | Record<string, unknown>): void {
    let message: Record<string, unknown>;
    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed)) throw new Error("invalid json");
        message = parsed;
      } catch {
        peer.sendJson({ type: "error", error: "invalid json" });
        return;
      }
    } else {
      message = raw;
    }

    switch (message.type) {
      case "join":
        this.join(peer, message);
        break;
      case "state":
        this.updateState(peer, message);
        break;
      case "leave":
        this.leave(peer);
        break;
      default:
        peer.sendJson({ type: "error", error: "unknown message type" });
    }
  }

  join(peer: MultiplayerPeer, message: Record<string, unknown>): void {
    const principal = this.authorize(peer, message);
    if (principal === null) {
      peer.sendJson({
        type: "error",
        error: "player role required",
        user: principalToJson(peer.principal)
      });
      return;
    }

    const signature = stringValue(message.signature).trim();
    if (!MULTIPLAYER_SIGNATURE_RE.test(signature)) {
      peer.sendJson({ type: "error", error: "invalid signature" });
      return;
    }

    this.leaveLocked(peer);
    const group = this.groups.get(signature) ?? new Set<MultiplayerPeer>();
    if (group.size >= this.maxPeers) {
      peer.sendJson({ type: "error", error: "game room is full" });
      return;
    }

    const playerId = this.choosePlayerId(group, message.player_id);
    peer.principal = principal;
    peer.signature = signature;
    peer.flags = uint32(message.flags);
    peer.playerId = playerId;
    peer.state = null;
    group.add(peer);
    this.groups.set(signature, group);

    peer.sendJson({ type: "welcome", player_id: playerId });
    for (const other of group) {
      if (other !== peer && other.state !== null) {
        peer.sendJson(peerMessage(other.playerId, other.state));
      }
    }
  }

  updateState(peer: MultiplayerPeer, message: Record<string, unknown>): void {
    if (!peer.signature) {
      peer.sendJson({ type: "error", error: "join first" });
      return;
    }
    const state: Record<string, unknown> = {
      x: message.x,
      y: message.y,
      sprite: message.sprite,
      flags: message.flags,
      input: message.input,
      frame: message.frame
    };
    peer.state = state;
    this.broadcast(peer.signature, peerMessage(peer.playerId, state), peer);
  }

  leave(peer: MultiplayerPeer): void {
    this.leaveLocked(peer);
  }

  status(): { readonly rooms: Record<string, number>; readonly room_count: number; readonly max_peers: number; readonly auth_enabled: boolean } {
    const rooms: Record<string, number> = {};
    for (const [signature, group] of [...this.groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      rooms[signature] = group.size;
    }
    return {
      rooms,
      room_count: Object.keys(rooms).length,
      max_peers: this.maxPeers,
      auth_enabled: this.authenticationEnabled
    };
  }

  close(): void {
    for (const group of this.groups.values()) {
      for (const peer of group) {
        peer.signature = "";
        peer.flags = 0;
        peer.playerId = 0;
        peer.state = null;
      }
    }
    this.groups.clear();
  }

  private authorize(peer: MultiplayerPeer, message: Record<string, unknown>): Principal | null {
    if (!this.authenticationEnabled) return ANONYMOUS;
    const token = stringValue(message.token || message.auth_token || peer.connectionToken).trim();
    const principal = this.authenticateToken(token);
    peer.principal = principal;
    return principal.authenticated && roleAtLeast(principal.role, "player") ? principal : null;
  }

  private leaveLocked(peer: MultiplayerPeer): void {
    if (!peer.signature) return;
    const signature = peer.signature;
    const playerId = peer.playerId;
    const group = this.groups.get(signature);
    group?.delete(peer);
    if (group?.size === 0) this.groups.delete(signature);
    peer.signature = "";
    peer.flags = 0;
    peer.playerId = 0;
    peer.state = null;
    this.broadcast(signature, { type: "leave", player_id: playerId }, peer);
  }

  private broadcast(signature: string, message: Record<string, unknown>, exceptPeer: MultiplayerPeer): void {
    const group = this.groups.get(signature);
    if (!group) return;
    const stale: MultiplayerPeer[] = [];
    for (const peer of group) {
      if (peer === exceptPeer) continue;
      try {
        peer.sendJson(message);
      } catch {
        stale.push(peer);
      }
    }
    for (const peer of stale) {
      group.delete(peer);
      peer.signature = "";
      peer.flags = 0;
      peer.playerId = 0;
      peer.state = null;
    }
    if (group.size === 0) this.groups.delete(signature);
  }

  private choosePlayerId(group: Set<MultiplayerPeer>, requested: unknown): number {
    const used = new Set([...group].map((peer) => peer.playerId).filter(Boolean));
    const requestedId = integer(requested);
    if (requestedId > 0 && !used.has(requestedId)) return requestedId;
    while (used.has(this.nextPlayerId) || this.nextPlayerId === 0) {
      this.nextPlayerId = (this.nextPlayerId + 1) >>> 0;
    }
    const playerId = this.nextPlayerId;
    this.nextPlayerId = (this.nextPlayerId + 1) >>> 0;
    return playerId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function integer(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function uint32(value: unknown): number {
  return integer(value) >>> 0;
}

function clamp(value: unknown, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, integer(value)));
}

function peerMessage(playerId: number, state: Record<string, unknown>): Record<string, unknown> {
  return {
    type: "peer",
    player_id: playerId,
    x: clamp(state.x, -32768, 32767),
    y: clamp(state.y, -32768, 32767),
    sprite: clamp(state.sprite, 0, 65535),
    flags: clamp(state.flags, 0, 65535),
    input: clamp(state.input, 0, 0xffffffff),
    frame: clamp(state.frame, 0, 0xffffffff)
  };
}
