import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";

import { safeGameId, safeVersion } from "../catalog/catalog.js";
import {
  fail,
  object,
  parseArchitectures,
  parseObjectJson,
  isoNow,
  statusForFindings,
} from "./publication-codecs.js";
import {
  assertInside,
  assertNoSymlinkComponents,
  assertSafeRelative,
  fileExists,
  listDirectories,
  sha256File,
} from "./publication-files.js";
import type {
  PublicationOperation,
  ReconciliationClassification,
  ReconciliationFinding,
  ReconciliationReport,
} from "./publication-contracts.js";

const JOURNAL_ROOT = "publication-operations";
const STAGING_ROOT = "publication-staging";
const PENDING_ROOT = "pending";
const CARTRIDGE_ROOT = "cartridges";
const MAX_SCAN_ENTRIES = 4096;

interface SubmissionRow {
  readonly id: number;
  readonly game_id: string;
  readonly version: string;
  readonly status: string;
  readonly pending_dir: string;
  readonly metadata_json: string;
  readonly architectures_json: string;
}

interface StoredArchitecture {
  readonly architecture?: unknown;
  readonly stored?: unknown;
  readonly file?: unknown;
}

interface ReconciliationOptions {
  readonly root: string;
  readonly database: Database.Database;
  readonly loadIndex: () => Record<string, unknown>;
  readonly readOperation: (operationId: string) => PublicationOperation;
}

/** Scans publication state without mutating the catalog or its database. */
export function reconcilePublication(
  options: ReconciliationOptions,
): ReconciliationReport {
  const { root, database } = options;
  const findings: ReconciliationFinding[] = [];
  const add = (finding: ReconciliationFinding) => findings.push(finding);
  let rows: SubmissionRow[] = [];
  try {
    rows = database
      .prepare(
        "SELECT id, game_id, version, status, pending_dir, " +
          "metadata_json, architectures_json FROM cartridge_submissions " +
          "ORDER BY id",
      )
      .all() as SubmissionRow[];
  } catch {
    add({
      code: "SUBMISSION_TABLE_UNAVAILABLE",
      classification: "CORRUPT",
      message: "cartridge_submissions cannot be inspected",
    });
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const pendingKeys = new Set(
    rows
      .filter((row) => row.status === "pending")
      .map((row) => `${row.game_id}/${row.version}`),
  );
  const verifiedExpectations: Array<{
    readonly row: SubmissionRow;
    readonly gameId: string;
    readonly version: string;
    readonly architecture: string;
  }> = [];
  const safeDirectoryExists = (relative: string): boolean => {
    try {
      const candidate = assertInside(
        root,
        path.join(root, assertSafeRelative(relative, "pending directory")),
        "pending directory",
      );
      assertNoSymlinkComponents(root, candidate);
      return fs.existsSync(candidate) && fs.lstatSync(candidate).isDirectory();
    } catch (error) {
      add({
        code: "UNSAFE_PUBLICATION_PATH",
        classification: "CORRUPT",
        message: error instanceof Error
          ? error.message
          : "publication path is unsafe",
        path: relative,
      });
      return false;
    }
  };
  const safeFileExists = (relative: string): boolean => {
    try {
      return Boolean(relative) && fileExists(root, relative);
    } catch (error) {
      add({
        code: "UNSAFE_PUBLICATION_PATH",
        classification: "CORRUPT",
        message: error instanceof Error
          ? error.message
          : "publication path is unsafe",
        path: relative,
      });
      return false;
    }
  };
  for (const row of rows) {
    const pendingDirectory = row.pending_dir || `${PENDING_ROOT}/${row.id}`;
    const hasPendingDirectory = safeDirectoryExists(pendingDirectory);
    if (row.status === "pending" && !hasPendingDirectory) {
      add({
        code: "PENDING_ROW_WITHOUT_DIRECTORY",
        classification: "RECOVERABLE",
        message: "pending database row has no pending directory",
        submissionId: row.id,
        path: pendingDirectory,
      });
    }
    if (row.status !== "pending" && hasPendingDirectory) {
      add({
        code: "VERIFIED_SUBMISSION_WITH_PENDING_ARTIFACTS",
        classification: "RECOVERABLE",
        message: "non-pending submission still has pending artifacts",
        submissionId: row.id,
        path: pendingDirectory,
      });
    }
    if (row.status === "pending") {
      let architectures: StoredArchitecture[] = [];
      try {
        architectures = parseArchitectures(row.architectures_json);
      } catch (error) {
        add({
          code: "SUBMISSION_METADATA_CORRUPT",
          classification: "CORRUPT",
          message: error instanceof Error
            ? error.message
            : "submission architectures are malformed",
          submissionId: row.id,
        });
      }
      for (const item of architectures) {
        const stored = typeof item.stored === "string" ? item.stored : "";
        if (!stored || !safeFileExists(stored)) {
          add({
            code: "MISSING_PENDING_VARIANT",
            classification: "RECOVERABLE",
            message: "pending row references a missing architecture file",
            submissionId: row.id,
            path: stored,
          });
        }
      }
    }
    if (row.status === "verified") {
      let gameId = row.game_id;
      let version = row.version;
      try {
        const metadata = parseObjectJson(row.metadata_json, "submission metadata");
        gameId = safeGameId(
          typeof metadata.id === "string" ? metadata.id : row.game_id,
        );
        version = safeVersion(
          typeof metadata.version === "string"
            ? metadata.version
            : row.version,
        );
      } catch (error) {
        add({
          code: "SUBMISSION_METADATA_CORRUPT",
          classification: "CORRUPT",
          message: error instanceof Error
            ? error.message
            : "submission metadata is malformed",
          submissionId: row.id,
        });
      }
      try {
        for (const item of parseArchitectures(row.architectures_json)) {
          if (typeof item.architecture === "string" && item.architecture) {
            verifiedExpectations.push({
              row,
              gameId,
              version,
              architecture: item.architecture,
            });
          }
        }
      } catch (error) {
        add({
          code: "SUBMISSION_METADATA_CORRUPT",
          classification: "CORRUPT",
          message: error instanceof Error
            ? error.message
            : "submission architectures are malformed",
          submissionId: row.id,
        });
      }
    }
  }
  let pendingDirectories: string[] = [];
  try {
    pendingDirectories = listDirectories(root, PENDING_ROOT);
  } catch (error) {
    add({
      code: "PENDING_SCAN_FAILED",
      classification: "CORRUPT",
      message: error instanceof Error
        ? error.message
        : "pending directory cannot be scanned",
    });
  }
  for (const directory of pendingDirectories) {
    const id = Number(directory);
    if (!Number.isSafeInteger(id) || !rowById.has(id)) {
      add({
        code: "ORPHAN_PENDING_DIRECTORY",
        classification: "AMBIGUOUS",
        message: "pending directory has no database row",
        path: `${PENDING_ROOT}/${directory}`,
      });
    }
  }
  const loaded = (() => {
    try {
      return options.loadIndex();
    } catch (error) {
      add({
        code: "INDEX_CORRUPT",
        classification: "CORRUPT",
        message: error instanceof Error
          ? error.message
          : "catalog index is corrupt",
        path: "index.json",
      });
      return null;
    }
  })();
  const indexedFiles = new Set<string>();
  const indexedKeys = new Set<string>();
  if (loaded) {
    try {
      const games = object(loaded.games, "catalog index games is malformed");
      for (const [gameId, game] of Object.entries(games)) {
        const gameRecord = object(game, "catalog game is malformed");
        const versions = object(
          gameRecord.versions,
          "catalog versions are malformed",
        );
        for (const [versionId, version] of Object.entries(versions)) {
          indexedKeys.add(`${gameId}/${versionId}`);
          const versionRecord = object(version, "catalog version is malformed");
          const architectures = object(
            versionRecord.architectures,
            "catalog architectures are malformed",
          );
          for (const variant of Object.values(architectures)) {
            const record = object(variant, "catalog variant is malformed");
            const filename = typeof record.filename === "string"
              ? record.filename
              : "";
            if (!filename || !safeFileExists(filename)) {
              add({
                code: "INDEX_ENTRY_MISSING_FILE",
                classification: "CORRUPT",
                message: "index entry points to a missing file",
                path: filename,
              });
            } else {
              indexedFiles.add(filename);
              if (
                typeof record.sha256 === "string" &&
                sha256File(
                  assertInside(
                    root,
                    path.join(root, filename),
                    "catalog file",
                  ),
                ) !== record.sha256
              ) {
                add({
                  code: "PUBLISHED_HASH_MISMATCH",
                  classification: "CORRUPT",
                  message: "published file hash differs from index",
                  path: filename,
                });
              }
            }
          }
        }
      }
      for (const expectation of verifiedExpectations) {
        const target = [
          CARTRIDGE_ROOT,
          expectation.gameId,
          expectation.version,
          `${expectation.architecture}.prg32`,
        ].join("/");
        if (!indexedFiles.has(target)) {
          add({
            code: "SUBMISSION_MARKED_VERIFIED_WITHOUT_PUBLICATION",
            classification: "AMBIGUOUS",
            message: "verified submission architecture is absent from the catalog index",
            submissionId: expectation.row.id,
            path: target,
          });
        }
        if (!safeFileExists(target)) {
          add({
            code: "MISSING_ARCHITECTURE_VARIANT",
            classification: "CORRUPT",
            message: "verified submission architecture file is missing",
            submissionId: expectation.row.id,
            path: target,
          });
        }
      }
      for (const key of pendingKeys) {
        if (indexedKeys.has(key)) {
          add({
            code: "PUBLISHED_ARTIFACT_PENDING_SUBMISSION",
            classification: "RECOVERABLE",
            message: "catalog index contains an artifact whose submission is still pending",
            path: key,
          });
        }
      }
      const cartridges = assertInside(
        root,
        path.join(root, CARTRIDGE_ROOT),
        "cartridge directory",
      );
      if (fs.existsSync(cartridges)) {
        const walk = (directory: string, relative: string, depth: number): void => {
          if (depth > 4) return;
          const entries = fs.readdirSync(directory, { withFileTypes: true });
          if (entries.length > MAX_SCAN_ENTRIES) {
            fail(
              "cartridge scan exceeds the reconciliation limit",
              "scan_limit",
            );
          }
          for (const entry of entries) {
            if (entry.isSymbolicLink()) {
              add({
                code: "UNSAFE_CARTRIDGE_OBJECT",
                classification: "CORRUPT",
                message: "published catalog contains a symlink",
                path: `${relative}/${entry.name}`,
              });
            } else if (entry.isDirectory()) {
              walk(
                path.join(directory, entry.name),
                `${relative}/${entry.name}`,
                depth + 1,
              );
            } else if (entry.isFile() && entry.name.endsWith(".prg32")) {
              const publishedPath = `${relative}/${entry.name}`;
              if (!indexedFiles.has(publishedPath)) {
                add({
                  code: "PUBLISHED_FILE_MISSING_FROM_INDEX",
                  classification: "AMBIGUOUS",
                  message: "published cartridge is not referenced by index",
                  path: publishedPath,
                });
              }
            }
          }
        };
        walk(cartridges, CARTRIDGE_ROOT, 0);
      }
    } catch (error) {
      add({
        code: "INDEX_SCHEMA_CORRUPT",
        classification: "CORRUPT",
        message: error instanceof Error
          ? error.message
          : "catalog index structure is malformed",
        path: "index.json",
      });
    }
  }
  const operations: PublicationOperation[] = [];
  try {
    for (const operationId of listDirectories(root, JOURNAL_ROOT)) {
      try {
        operations.push(options.readOperation(operationId));
      } catch (error) {
        add({
          code: "JOURNAL_CORRUPT",
          classification: "CORRUPT",
          message: error instanceof Error
            ? error.message
            : "publication journal is corrupt",
          operationId,
        });
      }
    }
  } catch (error) {
    add({
      code: "JOURNAL_SCAN_FAILED",
      classification: "CORRUPT",
      message: error instanceof Error
        ? error.message
        : "publication journal cannot be scanned",
    });
  }
  const intentionallyDeletedTargets = new Set(
    operations
      .filter(
        (operation) =>
          operation.operationKind === "catalog" &&
          operation.catalogAction === "delete" &&
          operation.state === "COMPLETED",
      )
      .flatMap((operation) =>
        operation.variants.map((variant) => variant.targetRelative),
      ),
  );
  for (let index = findings.length - 1; index >= 0; index -= 1) {
    const finding = findings[index];
    if (
      finding &&
      (finding.code === "SUBMISSION_MARKED_VERIFIED_WITHOUT_PUBLICATION" ||
        finding.code === "MISSING_ARCHITECTURE_VARIANT") &&
      finding.path &&
      intentionallyDeletedTargets.has(finding.path)
    ) {
      findings.splice(index, 1);
    }
  }
  const targetOwners = new Map<string, PublicationOperation[]>();
  for (const operation of operations) {
    if (![
      "COMPLETED",
      "COMPENSATED",
      "FAILED",
    ].includes(operation.state)) {
      const recovery: Exclude<ReconciliationClassification, "CONSISTENT"> =
        operation.state === "RECOVERY_REQUIRED" ||
        operation.state === "COMPENSATING"
          ? "AMBIGUOUS"
          : "RECOVERABLE";
      add({
        code: operation.state === "COMPENSATING"
          ? "INTERRUPTED_COMPENSATION"
          : "INCOMPLETE_PUBLICATION",
        classification: recovery,
        message: `publication operation is ${operation.state}`,
        operationId: operation.operationId,
        submissionId: operation.submissionId,
      });
    }
    for (const variant of operation.variants) {
      const owners = targetOwners.get(variant.targetRelative) ?? [];
      owners.push(operation);
      targetOwners.set(variant.targetRelative, owners);
    }
    if (
      operation.state === "VERIFIED" &&
      !safeFileExists(operation.indexStagedRelative)
    ) {
      add({
        code: "VERIFIED_OPERATION_MISSING_INDEX_STAGE",
        classification: "AMBIGUOUS",
        message: "verified operation has no staged index",
        operationId: operation.operationId,
      });
    }
  }
  for (const [target, owners] of targetOwners) {
    if (
      owners.length > 1 &&
      owners.some(
        (operation) =>
          !["COMPLETED", "COMPENSATED", "FAILED"].includes(
            operation.state,
          ),
      )
    ) {
      add({
        code: "CONFLICTING_PUBLICATION_RECORDS",
        classification: "AMBIGUOUS",
        message: "multiple operations target the same published artifact",
        path: target,
        details: {
          operation_ids: owners.map((operation) => operation.operationId),
        },
      });
    }
  }
  const recoverablePublicationKeys = new Set(
    operations
      .filter(
        (operation) =>
          !["COMPLETED", "COMPENSATED", "FAILED"].includes(operation.state),
      )
      .map((operation) => `${operation.gameId}/${operation.version}`),
  );
  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    if (
      finding?.code === "PUBLISHED_ARTIFACT_PENDING_SUBMISSION" &&
      finding.path &&
      !recoverablePublicationKeys.has(finding.path)
    ) {
      findings[index] = {
        ...finding,
        classification: "AMBIGUOUS",
        message:
          "catalog index contains an artifact whose pending submission " +
          "has no recoverable publication operation",
      };
    }
  }
  for (const temporaryRoot of [STAGING_ROOT, JOURNAL_ROOT]) {
    try {
      const directory = assertInside(
        root,
        path.join(root, temporaryRoot),
        "temporary scan",
      );
      if (fs.existsSync(directory)) {
        const scan = (current: string, relative: string): void => {
          for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const next = path.join(current, entry.name);
            const nextRelative = `${relative}/${entry.name}`;
            if (entry.isSymbolicLink()) {
              add({
                code: "UNSAFE_PUBLICATION_OBJECT",
                classification: "CORRUPT",
                message: "publication workspace contains a symlink",
                path: nextRelative,
              });
            } else if (entry.isDirectory()) {
              scan(next, nextRelative);
            } else if (entry.name.includes(".tmp-")) {
              add({
                code: "STALE_TEMPORARY_FILE",
                classification: "RECOVERABLE",
                message: "temporary publication file remains",
                path: nextRelative,
              });
            }
          }
        };
        scan(directory, temporaryRoot);
      }
    } catch (error) {
      add({
        code: "TEMPORARY_SCAN_FAILED",
        classification: "CORRUPT",
        message: error instanceof Error
          ? error.message
          : "publication temporary area cannot be scanned",
        path: temporaryRoot,
      });
    }
  }
  return {
    status: statusForFindings(findings),
    checkedAt: isoNow(),
    root,
    findings,
    counts: Object.fromEntries(
      findings.reduce(
        (map, finding) =>
          map.set(finding.code, (map.get(finding.code) ?? 0) + 1),
        new Map<string, number>(),
      ),
    ),
  };
}
