import fs from "node:fs";
import path from "node:path";
import { runOnboard } from "./onboard.mjs";
import { syncWorkspace } from "./sync.mjs";

export async function runOnboardLogTest(entRoot, workspaceRoot) {
  syncWorkspace(entRoot, workspaceRoot, "cursor");

  const result = await runOnboard(entRoot, workspaceRoot, { log: true, live: false });
  const logPath = path.join(workspaceRoot, ".ent", "onboard-log.json");
  if (!result.logPath || !fs.existsSync(logPath)) {
    throw new Error("onboard --log did not write .ent/onboard-log.json");
  }

  const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
  for (const key of [
    "started_at",
    "finished_at",
    "workspace_root",
    "environment",
    "steps",
    "checks",
    "warnings",
    "redactions",
  ]) {
    if (!(key in log)) {
      throw new Error(`onboard-log.json missing key: ${key}`);
    }
  }

  const stepNames = log.steps.map((s) => s.name);
  for (const name of ["scaffold", "audit"]) {
    if (!stepNames.includes(name)) {
      throw new Error(`onboard-log.json missing step: ${name}`);
    }
  }

  if (!log.redactions.includes("WP_MCP_PASSWORD")) {
    throw new Error("onboard-log.json must list WP_MCP_PASSWORD under redactions");
  }

  const raw = fs.readFileSync(logPath, "utf8");
  if (/WP_MCP_PASSWORD\s*=\s*[^\n#]+/.test(raw)) {
    throw new Error("onboard-log.json must not contain WP_MCP_PASSWORD values");
  }
}
