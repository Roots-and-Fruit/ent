import {
  abilityRequiresSmokeInput,
  buildSmokeProbeInput,
  countAbilitySummary,
  evaluateCompanionEngineCheck,
  isAbilitySmokeBlocked,
  isEnginePingAbility,
  reclassifySmokeOutcome,
} from "./ability-smoke.mjs";

export function runAbilitySmokeTest() {
  const parametric = { name: "vendor/get-item", input_schema: { required: ["post_id"] } };
  if (!abilityRequiresSmokeInput(parametric)) {
    throw new Error("abilityRequiresSmokeInput should detect required post_id");
  }

  const ping = { name: "vendor/ping" };
  if (!isEnginePingAbility(ping)) {
    throw new Error("isEnginePingAbility should match */ping");
  }

  const probe = buildSmokeProbeInput(parametric, { samplePostId: 42 });
  if (probe.post_id !== 42) {
    throw new Error("buildSmokeProbeInput should include samplePostId");
  }

  const reclassified = reclassifySmokeOutcome(
    { executable: false, error_code: "permission_denied", error: "Permission denied" },
    parametric
  );
  if (reclassified.executable !== null || reclassified.error_code !== "needs_input") {
    throw new Error("permission_denied on parametric ability should become needs_input");
  }

  const pingDenied = reclassifySmokeOutcome(
    { executable: false, error_code: "permission_denied", error: "Permission denied" },
    ping
  );
  if (pingDenied.executable !== false) {
    throw new Error("engine ping permission_denied should stay blocked");
  }

  const blockedAbility = { executable: false, error_code: "permission_denied" };
  const needsInputAbility = { executable: null, error_code: "needs_input" };
  if (!isAbilitySmokeBlocked(blockedAbility) || isAbilitySmokeBlocked(needsInputAbility)) {
    throw new Error("isAbilitySmokeBlocked should block only confirmed denials");
  }

  const summary = countAbilitySummary([
    { executable: true },
    { executable: null, error_code: "needs_input" },
    { executable: false, error_code: "permission_denied" },
  ]);
  if (summary.executable !== 1 || summary.needs_input !== 1 || summary.blocked !== 1) {
    throw new Error("countAbilitySummary mismatch");
  }

  const pass = evaluateCompanionEngineCheck([{ name: "vendor/ping", executable: true }]);
  if (pass.status !== "pass") {
    throw new Error("evaluateCompanionEngineCheck should pass when ping executable");
  }

  const skip = evaluateCompanionEngineCheck([{ name: "vendor/other", executable: false }]);
  if (skip.status !== "skip") {
    throw new Error("evaluateCompanionEngineCheck should skip when no ping ability");
  }
}
