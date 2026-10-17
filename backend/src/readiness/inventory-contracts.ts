/** ABI for the operational handover readiness report. */
export const READINESS_ABI =
  "prg32-operational-handover-readiness-1.0" as const;

/** Version tuple used by readiness evidence. */
export const VERSION_TUPLE = {
  schema: 2,
  storageLayout: 2,
  publicationJournal: 1,
  backupFormat: 3,
} as const;

/** Classification of a route or readiness gate. */
export type ReadinessClassification =
  | "READY"
  | "ISOLATED_READY"
  | "PARTIAL"
  | "LEGACY_DEPENDENT"
  | "MISSING"
  | "NOT_VERIFIED";

/** Current or candidate owner of a public route. */
export type RouteOwner = "flask" | "fastify" | "next" | "external" | "none";

/** Evidence and ownership contract for one route family. */
export interface RouteInventoryEntry {
  readonly id: string;
  readonly family: string;
  readonly methods: readonly string[];
  readonly paths: readonly string[];
  readonly currentOwner: RouteOwner;
  readonly candidateOwner: RouteOwner;
  readonly classification: ReadinessClassification;
  readonly flaskSource?: string;
  readonly fastifySource?: string;
  readonly auth: string;
  readonly persistence: string;
  readonly sideEffects: string;
  readonly firmwareRelevant: boolean;
  readonly frontendRelevant: boolean;
  readonly tests: readonly string[];
  readonly blockers: readonly string[];
}

/** Evidence and decision contract for one operational readiness gate. */
export interface ReadinessGate {
  readonly id: string;
  readonly classification: ReadinessClassification;
  readonly evidence: readonly string[];
  readonly decision: string;
  readonly blockers: readonly string[];
}
