import { disposeDifferentialFixtures, runDifferentialGate } from "./harness.js";

try {
  const report = runDifferentialGate();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  disposeDifferentialFixtures();
  process.exitCode = 0;
} catch (error) {
  disposeDifferentialFixtures();
  process.stderr.write(`${JSON.stringify({ ok: false, code: "storage_api_differential_failed", message: error instanceof Error ? error.message : "differential gate failed" })}\n`);
  process.exitCode = 2;
}
