export interface DifferentialRequest {
  readonly method: "GET";
  readonly path: string;
}

export interface NormalizedResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly json: unknown;
  readonly bodySha256: string;
  readonly bodyBytes: number;
  readonly bodyBase64: string;
}

export type DifferenceClassification =
  | "PARITY"
  | "INTENTIONAL_SECURITY_DEVIATION"
  | "KNOWN_LEGACY_QUIRK"
  | "TARGET_DEFECT"
  | "MIGRATION_DATA_LOSS"
  | "NOT_VERIFIED";

export interface DifferentialResult {
  readonly contractId: string;
  readonly legacyEndpoint: string;
  readonly targetProjection: string;
  readonly fixtureCase: string;
  readonly evidenceSource: "flask-test-client" | "storage-v2-read-only";
  readonly expectedStatus: number;
  readonly actualStatus: number;
  readonly jsonEqual: boolean;
  readonly headersEqual: boolean;
  readonly binaryEqual: boolean;
  readonly firmwareRelevant: boolean;
  readonly classification: DifferenceClassification;
  readonly blocking: boolean;
  readonly legacy: NormalizedResponse;
  readonly target: NormalizedResponse;
}

export interface DifferentialReport {
  readonly abi: "prg32-storage-api-differential-1.0";
  readonly generatedAt: string;
  readonly results: readonly DifferentialResult[];
  readonly summary: Readonly<Record<string, number>>;
  readonly sourceUnchanged: boolean;
  readonly targetReadOnly: true;
}
