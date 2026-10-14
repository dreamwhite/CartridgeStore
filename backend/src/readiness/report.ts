import {
  FLASK_RETIREMENT_MATRIX,
  HANDOVER_PROTOCOL,
  OPERATIONAL_BLOCKERS,
  READINESS_ABI,
  READINESS_GATES,
  ROUTE_INVENTORY,
  VERSION_TUPLE
} from "./inventory.js";

export interface ReadinessReport {
  readonly abi: typeof READINESS_ABI;
  readonly milestone: "M5.2f";
  readonly planningDecision: "GO";
  readonly operationalCutoverDecision: "NO-GO";
  readonly flaskRetirementDecision: "NO-GO";
  readonly evidenceBasis: "source-and-test-inventory";
  readonly versionTuple: typeof VERSION_TUPLE;
  readonly routeInventory: typeof ROUTE_INVENTORY;
  readonly gates: typeof READINESS_GATES;
  readonly handoverProtocol: readonly string[];
  readonly flaskRetirementMatrix: typeof FLASK_RETIREMENT_MATRIX;
  readonly blockers: readonly string[];
  readonly nextMilestone: string;
}

export function buildReadinessReport(): ReadinessReport {
  return {
    abi: READINESS_ABI,
    milestone: "M5.2f",
    planningDecision: "GO",
    operationalCutoverDecision: "NO-GO",
    flaskRetirementDecision: "NO-GO",
    evidenceBasis: "source-and-test-inventory",
    versionTuple: VERSION_TUPLE,
    routeInventory: ROUTE_INVENTORY,
    gates: READINESS_GATES,
    handoverProtocol: HANDOVER_PROTOCOL,
    flaskRetirementMatrix: FLASK_RETIREMENT_MATRIX,
    blockers: OPERATIONAL_BLOCKERS,
    nextMilestone: "M5.2g — operational canonical target integration and pre-cutover rehearsal (separate authorization required)"
  };
}

export function stableReadinessJson(): string {
  return `${JSON.stringify(buildReadinessReport(), null, 2)}\n`;
}
