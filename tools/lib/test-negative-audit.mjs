import fs from "node:fs";
import path from "node:path";
import { runAudit, writeAuditReport, writeOnboardHtml } from "./audit.mjs";
import { syncWorkspace } from "./sync.mjs";

function stripVolatile(report) {
  return report.checks.map((c) => ({
    id: c.id,
    profile: c.profile,
    status: c.status,
  }));
}

export async function runNegativeAuditTest(entRoot, workspaceRoot) {
  syncWorkspace(entRoot, workspaceRoot, "cursor");

  const envPath = path.join(workspaceRoot, ".env");
  if (fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
  }

  const report = await runAudit(workspaceRoot, { live: false });
  writeAuditReport(workspaceRoot, report);
  await writeOnboardHtml(workspaceRoot, report);

  const goldenPath = path.join(entRoot, "test", "golden", "audit-post-sync-no-env.json");
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));

  const actual = stripVolatile(report);
  const expected = golden.checks;

  if (actual.length !== expected.length) {
    throw new Error(`Check count mismatch: expected ${expected.length}, got ${actual.length}`);
  }

  for (let i = 0; i < expected.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (a.id !== e.id || a.profile !== e.profile || a.status !== e.status) {
      throw new Error(
        `Golden mismatch at ${e.id}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`
      );
    }
  }

  if (report.summary.fail < 1) {
    throw new Error("Pre-onboard fixture must have at least one fail");
  }

  const html = fs.readFileSync(path.join(workspaceRoot, ".ent", "onboard.html"), "utf8");
  const auditMatch = html.match(/<script type="application\/json" id="ent-audit-data">([\s\S]*?)<\/script>/);
  if (!auditMatch) {
    throw new Error("onboard.html missing ent-audit-data script");
  }
  const auditData = JSON.parse(auditMatch[1]);
  for (const c of report.checks.filter((x) => x.status === "fail")) {
    const row = auditData.checks.find((entry) => entry.id === c.id);
    if (!row || row.status !== "fail") {
      throw new Error(`onboard.html audit data missing fail id ${c.id}`);
    }
  }
  if (!html.includes("Registered MCP abilities") && !html.includes("MCP abilities")) {
    throw new Error("onboard.html missing ability sections");
  }
}
