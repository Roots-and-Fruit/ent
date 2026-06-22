import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { scaffoldWorkspace } from "./scaffold.mjs";
import { runAudit, writeAuditReport, writeOnboardHtml, writeStateJson } from "./audit.mjs";
import { canResolveWpMcpLauncher, readMcpServerName } from "./mcp-config.mjs";
import { parseEnvFile } from "./env.mjs";
import { portableWorkspaceRoot } from "./paths.mjs";

export const ONBOARD_WARNINGS = [
  "Reload Cursor window (Developer: Reload Window) before MCP config is active",
  "Enable the MCP server in Cursor Settings → MCP",
  "Audit verifies remote WordPress MCP transport, not the local Cursor stdio process",
];

export const ONBOARD_SUCCESS_MESSAGE = [
  "Onboarding complete — your workspace is connected to Ent.",
  "Open .ent/onboard.html in your browser to review MCP Support, abilities, and optional add-ons.",
  "In Cursor: Developer → Reload Window, then enable your site MCP server under Settings → MCP.",
];

export function probeOnboardEnvironment(workspaceRoot) {
  let node = "unknown";
  try {
    node = execSync("node --version", { encoding: "utf8" }).trim();
  } catch {
    // PATH node unavailable
  }

  const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");
  const entDir = path.join(workspaceRoot, "ent");
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  let wpHost = null;
  if (env.WP_MCP_URL?.trim()) {
    try {
      wpHost = new URL(env.WP_MCP_URL.trim()).hostname;
    } catch {
      wpHost = null;
    }
  }

  return {
    platform: process.platform,
    node,
    mcp_launcher_resolvable: canResolveWpMcpLauncher(entDir),
    mcp_launcher_strategy: canResolveWpMcpLauncher(entDir) ? "bundled" : "missing",
    mcp_server_name: readMcpServerName(mcpPath),
    wp_mcp_host: wpHost,
    wp_mcp_username: env.WP_MCP_USERNAME?.trim() || null,
  };
}

async function runStep(name, fn, steps, verbose) {
  const started = Date.now();
  let exitCode = 0;
  let message;
  let summary;
  try {
    const result = await fn();
    exitCode = result?.exitCode ?? 0;
    message = result?.message;
    summary = result?.summary;
  } catch (err) {
    exitCode = 1;
    message = err.message ?? String(err);
  }
  const entry = { name, exit_code: exitCode, duration_ms: Date.now() - started };
  if (message) {
    entry.message = message;
  }
  if (summary) {
    entry.summary = summary;
  }
  steps.push(entry);
  if (verbose) {
    console.log(`  ${name}: exit=${exitCode} (${entry.duration_ms}ms)`);
  }
  return exitCode;
}

export function writeOnboardLog(workspaceRoot, logBody) {
  const outPath = path.join(workspaceRoot, ".ent", "onboard-log.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(logBody, null, 2) + "\n", "utf8");
  return outPath;
}

export async function runOnboard(entRoot, workspaceRoot, options = {}) {
  const { log = false, verbose = false, live = true } = options;
  const root = path.resolve(workspaceRoot);
  const startedAt = new Date().toISOString();
  const steps = [];
  let report;
  let statePath = null;
  let htmlPath = null;

  if (verbose) {
    console.log("onboard: scaffold");
  }
  await runStep(
    "scaffold",
    async () => {
      scaffoldWorkspace(entRoot, root);
      return { exitCode: 0, message: "workspace scaffolded and synced" };
    },
    steps,
    verbose
  );

  if (verbose) {
    console.log("onboard: audit");
  }
  const auditExit = await runStep(
    "audit",
    async () => {
      report = await runAudit(root, { live });
      const auditPath = writeAuditReport(root, report);
      if (report.summary.fail === 0 && report.summary.skip === 0) {
        statePath = writeStateJson(root, report);
      }
      return {
        exitCode: report.summary.fail > 0 || report.summary.skip > 0 ? 1 : 0,
        summary: report.summary,
        message: auditPath,
      };
    },
    steps,
    verbose
  );

  if (verbose) {
    console.log("onboard: render-onboard");
  }
  await runStep(
    "render-onboard",
    async () => {
      if (!report) {
        return { exitCode: 1, message: "audit did not run" };
      }
      htmlPath = await writeOnboardHtml(root, report);
      return { exitCode: 0, message: htmlPath };
    },
    steps,
    verbose
  );

  const finishedAt = new Date().toISOString();
  const environment = probeOnboardEnvironment(root);
  const logBody = {
    started_at: startedAt,
    finished_at: finishedAt,
    workspace_root: portableWorkspaceRoot(),
    ent_commit: report?.ent_version ?? "unknown",
    environment,
    steps,
    checks: report?.checks ?? [],
    summary: report?.summary ?? { pass: 0, fail: 0, skip: 0 },
    artifacts: {
      audit_json: ".ent/audit.json",
      onboard_html: htmlPath ? ".ent/onboard.html" : null,
      state_json: statePath ? ".ent/state.json" : null,
    },
    warnings: ONBOARD_WARNINGS,
    redactions: ["WP_MCP_PASSWORD"],
  };

  let logPath = null;
  if (log) {
    logPath = writeOnboardLog(root, logBody);
  }

  return {
    exitCode: auditExit,
    report,
    statePath,
    htmlPath,
    logPath,
    logBody,
  };
}
