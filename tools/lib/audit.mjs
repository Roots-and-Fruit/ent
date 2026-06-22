import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseEnvFile } from "./env.mjs";
import { runWpMcpSmoke } from "./wp-smoke.mjs";

function check(id, profile, status, message, evidence = "") {
  return { id, profile, status, message, evidence };
}

function summarize(checks) {
  return checks.reduce(
    (acc, c) => {
      acc[c.status]++;
      return acc;
    },
    { pass: 0, fail: 0, skip: 0 }
  );
}

function entVersion(entDir) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: entDir, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export async function runAudit(workspaceRoot, options = {}) {
  const { live = true } = options;
  const checks = [];
  const entDir = path.join(workspaceRoot, "ent");
  const envPath = path.join(workspaceRoot, ".env");
  const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");

  // core.node
  try {
    const version = execSync("node --version", { encoding: "utf8" }).trim();
    checks.push(check("core.node", "core", "pass", "Node.js available", version));
  } catch {
    checks.push(check("core.node", "core", "fail", "Node.js not on PATH"));
  }

  // core.workspace_open_mode
  const entKit = path.join(entDir, "tools", "ent.mjs");
  if (fs.existsSync(entKit)) {
    checks.push(
      check("core.workspace_open_mode", "core", "pass", "Workspace contains ent/ kit", entKit)
    );
  } else {
    checks.push(
      check(
        "core.workspace_open_mode",
        "core",
        "fail",
        "Open workspace root that contains ent/, not ent/ alone",
        workspaceRoot
      )
    );
  }

  // core.ent_clean_git
  if (fs.existsSync(path.join(entDir, ".git"))) {
    const status = execSync("git status --porcelain", { cwd: entDir, encoding: "utf8" }).trim();
    if (status) {
      checks.push(check("core.ent_clean_git", "core", "fail", "ent/ has uncommitted changes", status));
    } else {
      checks.push(check("core.ent_clean_git", "core", "pass", "ent/ working tree clean"));
    }
  } else {
    checks.push(check("core.ent_clean_git", "core", "fail", "ent/ is not a git checkout"));
  }

  // core.agent_config
  if (fs.existsSync(mcpPath)) {
    checks.push(check("core.agent_config", "core", "pass", "Cursor MCP config present", mcpPath));
  } else {
    checks.push(check("core.agent_config", "core", "fail", "Run ent sync to create .cursor/mcp.json"));
  }

  const env = parseEnvFile(envPath);

  // wp.env_present
  if (fs.existsSync(envPath)) {
    checks.push(check("wp.env_present", "wordpress_mcp", "pass", "Workspace .env exists"));
  } else {
    checks.push(check("wp.env_present", "wordpress_mcp", "fail", "Create .env from ent/.env.example"));
  }

  // wp.env_complete
  const url = env.WP_MCP_URL?.trim();
  const user = env.WP_MCP_USERNAME?.trim();
  const pass = env.WP_MCP_PASSWORD?.trim();
  if (url && user && pass) {
    checks.push(check("wp.env_complete", "wordpress_mcp", "pass", "WP_MCP_* variables set"));
  } else {
    checks.push(check("wp.env_complete", "wordpress_mcp", "fail", "Set WP_MCP_URL, WP_MCP_USERNAME, WP_MCP_PASSWORD"));
  }

  // wp.mcp_config
  if (fs.existsSync(mcpPath)) {
    const mcpRaw = fs.readFileSync(mcpPath, "utf8");
    if (mcpRaw.includes("ent/tools/run-wordpress-mcp.mjs")) {
      checks.push(check("wp.mcp_config", "wordpress_mcp", "pass", "MCP server points at ent/tools/run-wordpress-mcp.mjs"));
    } else {
      checks.push(check("wp.mcp_config", "wordpress_mcp", "fail", "MCP server path incorrect"));
    }
  } else {
    checks.push(check("wp.mcp_config", "wordpress_mcp", "fail", "Missing .cursor/mcp.json"));
  }

  if (url && user && pass && live) {
    const smoke = await runWpMcpSmoke({ workspaceRoot, url, username: user, password: pass });
    const restPass = smoke.stage !== "rest" && smoke.stage !== "env";
    checks.push(
      check(
        "wp.rest_auth",
        "wordpress_mcp",
        restPass ? "pass" : "fail",
        restPass ? "REST /users/me OK" : smoke.message,
        smoke.stage
      )
    );
    checks.push(
      check(
        "wp.mcp_transport",
        "wordpress_mcp",
        smoke.ok ? "pass" : "fail",
        smoke.ok ? `MCP transport OK (${smoke.toolCount} tools)` : smoke.message,
        smoke.stage
      )
    );
  } else if (url && user && pass) {
    checks.push(
      check("wp.rest_auth", "wordpress_mcp", "skip", "Live REST check deferred", "live_gate_deferred"),
      check("wp.mcp_transport", "wordpress_mcp", "skip", "Live MCP transport deferred", "live_gate_deferred")
    );
  } else {
    checks.push(
      check("wp.rest_auth", "wordpress_mcp", "fail", "Complete .env before live REST check"),
      check("wp.mcp_transport", "wordpress_mcp", "fail", "Complete .env before live MCP check")
    );
  }

  const report = {
    ent_version: entVersion(entDir),
    workspace_root: workspaceRoot,
    checks,
    summary: summarize(checks),
  };

  return report;
}

export function writeAuditReport(workspaceRoot, report) {
  const entDir = path.join(workspaceRoot, ".ent");
  fs.mkdirSync(entDir, { recursive: true });
  const outPath = path.join(entDir, "audit.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return outPath;
}

export function renderOnboardHtml(report) {
  const rows = report.checks
    .map((c) => {
      return `<tr class="status-${c.status}"><td><code>${c.id}</code></td><td>${c.profile}</td><td>${c.status}</td><td>${escapeHtml(c.message)}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ent onboard checklist</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 960px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.5rem 0.75rem; text-align: left; }
    .status-pass td:nth-child(3) { color: #0a0; }
    .status-fail td:nth-child(3) { color: #c00; font-weight: 600; }
    .status-skip td:nth-child(3) { color: #666; }
    summary { margin: 1rem 0; }
  </style>
</head>
<body>
  <h1>Ent onboard checklist</h1>
  <p>Workspace: <code>${escapeHtml(report.workspace_root)}</code></p>
  <p>Ent: <code>${escapeHtml(report.ent_version)}</code></p>
  <summary>Pass ${report.summary.pass} · Fail ${report.summary.fail} · Skip ${report.summary.skip}</summary>
  <table>
    <thead><tr><th>Check</th><th>Profile</th><th>Status</th><th>Message</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p>Re-run: <code>node ent/tools/ent.mjs audit --workspace-root .</code></p>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function writeOnboardHtml(workspaceRoot, report) {
  const outPath = path.join(workspaceRoot, ".ent", "onboard.html");
  fs.writeFileSync(outPath, renderOnboardHtml(report), "utf8");
  return outPath;
}
