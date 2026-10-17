import type { ReadinessGate } from "./inventory-contracts.js";

/** Operational gates used to decide whether Fastify ownership can advance. */
export const READINESS_GATES: readonly ReadinessGate[] = [
  {
    id: "route-ownership",
    classification: "PARTIAL",
    evidence: [
      "source route registration inventory",
      "Fastify composition root",
      "Flask url_map disposable inspection"
    ],
    decision:
      "Keep Flask public owner until each contract family has a verified " +
      "Fastify owner and route switch plan.",
    blockers: [
      "catalog download telemetry",
      "publication/review",
      "firmware writes",
      "WebSocket",
      "mDNS"
    ]
  },
  {
    id: "canonical-storage-integration",
    classification: "PARTIAL",
    evidence: [
      "backend/src/storage-v2/",
      "M5.2d read-only parity",
      "M5.2e disposable backup/restore"
    ],
    decision:
      "Use canonical storage-v2 only after a quiesced source snapshot and " +
      "one-writer operational gate.",
    blockers: [
      "live Flask-to-canonical data reconciliation",
      "object/index ownership",
      "public route activation"
    ]
  },
  {
    id: "authentication-continuity",
    classification: "PARTIAL",
    evidence: [
      "Flask signed session cookie",
      "Fastify prg32_ts_session",
      "isolated auth/federation tests"
    ],
    decision:
      "Use controlled re-login for browser sessions; preserve bearer/API-token " +
      "compatibility; do not translate Flask cookies.",
    blockers: [
      "maintenance-window communication",
      "external identity mapping decision",
      "operational callback verification"
    ]
  },
  {
    id: "publication-review",
    classification: "PARTIAL",
    evidence: [
      "Fastify submission/review services",
      "storage-v2 publication tables",
      "M5.2e recovery checks"
    ],
    decision:
      "Fastify becomes writer only after publication operation recovery and " +
      "review history are verified against the final snapshot.",
    blockers: [
      "live promotion parity",
      "review ownership",
      "crash recovery rehearsal against final data"
    ]
  },
  {
    id: "firmware-writes",
    classification: "PARTIAL",
    evidence: [
      "Fastify score/metrics route modules",
      "M5.2d read-only parity report",
      "Python contract tests"
    ],
    decision:
      "Cut over score and metrics writes separately after firmware-compatible " +
      "live write and reconciliation evidence.",
    blockers: [
      "single writer",
      "telemetry/score reconciliation",
      "firmware endpoint verification"
    ]
  },
  {
    id: "multiplayer",
    classification: "PARTIAL",
    evidence: [
      "Fastify @fastify/websocket route",
      "Flask Flask-Sock route",
      "protocol unit tests"
    ],
    decision:
      "Switch WebSocket ownership only after external Traefik upgrade/runtime " +
      "and reconnect behavior are verified.",
    blockers: [
      "public routing",
      "firmware/live client acceptance",
      "ownership switch without dual relay"
    ]
  },
  {
    id: "mdns",
    classification: "ISOLATED_READY",
    evidence: [
      "cartridge_store/mdns.py",
      "backend/src/discovery/",
      "AGENTS.md canonical constants",
      "backend/tests/discovery.test.ts"
    ],
    decision:
      "Keep the Fastify failure-tolerant mDNS lifecycle disabled by default " +
      "until a controlled runtime network test and ownership switch are approved.",
    blockers: [
      "real LAN advertisement and deregistration",
      "public endpoint and network-interface acceptance"
    ]
  },
  {
    id: "backup-v3",
    classification: "PARTIAL",
    evidence: [
      "M5.2e storage-v2 backup writer/verifier",
      "disposable fault/adversarial suite"
    ],
    decision:
      "Keep v3 developer-only until encryption, key custody, authenticity, " +
      "retention, monitoring and maintenance-window procedures are approved.",
    blockers: [
      "encrypted operational archive policy",
      "key custody/authenticity",
      "retention and restore drill"
    ]
  },
  {
    id: "compose-routing",
    classification: "ISOLATED_READY",
    evidence: ["docker-compose.yml", "M5.2e read-only Compose inventory"],
    decision:
      "Target one Fastify and one Next runtime on external Dream Traefik while " +
      "preserving both hostnames and WebSocket paths.",
    blockers: [
      "do not simplify until application ownership gates pass",
      "no Compose change in M5.2f"
    ]
  },
  {
    id: "flask-retirement",
    classification: "LEGACY_DEPENDENT",
    evidence: ["current Flask route map", "current Compose profiles", "M5.2d/e reports"],
    decision:
      "Retire Flask only after all public routes, writes, mDNS and rollback " +
      "gates are closed.",
    blockers: [
      "all legacy-dependent route families",
      "rollback window",
      "operational approval"
    ]
  }
];

/** Matrix of legacy components and the evidence required before retirement. */
export const FLASK_RETIREMENT_MATRIX = [
  {
    component: "cartridge_store/app.py",
    action: "REMOVE",
    dependency:
      "all HTML/catalog/admin/backup route ownership moved and rollback " +
      "window closed"
  },
  {
    component: "cartridge_store/auth/",
    action: "ARCHIVE",
    dependency: "local and generic federation identity continuity accepted"
  },
  {
    component: "cartridge_store/metrics.py",
    action: "REMOVE",
    dependency: "Fastify firmware metrics writes reconciled"
  },
  {
    component: "cartridge_store/scores.py",
    action: "REMOVE",
    dependency: "Fastify score writes reconciled"
  },
  {
    component: "cartridge_store/multiplayer.py",
    action: "REMOVE",
    dependency:
      "Fastify WebSocket public ownership and mDNS/runtime acceptance"
  },
  {
    component: "cartridge_store/mdns.py",
    action: "ARCHIVE",
    dependency: "Fastify mDNS lifecycle verified"
  },
  {
    component: "templates/ and static/",
    action: "ARCHIVE",
    dependency: "Next.js storefront and admin UI parity accepted"
  },
  {
    component: "Dockerfile and prod cartridge-store service",
    action: "REMOVE",
    dependency: "Fastify/Next production topology and rollback window"
  },
  {
    component: "legacy SQLite/filesystem data",
    action: "RETAIN",
    dependency:
      "retained through rollback window and source integrity recheck"
  },
  {
    component: "external Traefik and generic provider",
    action: "RETAIN",
    dependency:
      "external infrastructure remains managed outside this repository"
  },
  {
    component: "legacy backup/restore behavior",
    action: "UNDECIDED",
    dependency:
      "operational backup-v3 encryption/authenticity and restore runbook"
  }
] as const;

/** Ordered handover procedure for a future ownership switch. */
export const HANDOVER_PROTOCOL = [
  "freeze public writes and establish a maintenance window",
  "verify the unchanged Flask source snapshot and complete legacy inventory",
  "create and independently verify canonical migration target",
  "create and verify backup-v3 before any ownership switch",
  "start exactly one canonical writer on the verified target",
  "verify read, publication, auth, telemetry, score, WebSocket and mDNS gates",
  "switch routing and record canonical ownership",
  "monitor the rollback window without starting a second writer",
  "on abort, stop/quiesce canonical writer before restoring legacy ownership",
  "reconcile post-switch writes before any post-cutover rollback decision"
] as const;

/** Summary of blockers that prevent declaring migration complete. */
export const OPERATIONAL_BLOCKERS = [
  "Fastify is not the proven operational owner of every public route family.",
  "Flask and Fastify session cookies are incompatible; controlled browser re-login is required.",
  "Publication/review and catalog download telemetry still have legacy operational side effects.",
  "Firmware score/metrics writes have not completed an operational single-writer gate.",
  "Fastify WebSocket and mDNS implementations are isolated/not verified " +
    "through external runtime routing.",
  "Backup-v3 has no approved operational encryption, authenticity, key " +
    "custody or retention policy.",
  "Compose simplification is a future action and remains intentionally unimplemented."
] as const;
