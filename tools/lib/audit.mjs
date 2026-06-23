import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseEnvFile } from "./env.mjs";
import {
  canResolveWpMcpLauncher,
  readMcpServerName,
  refreshWorkspaceMcpJson,
} from "./mcp-config.mjs";
import { portableWorkspaceRoot, relToWorkspace } from "./paths.mjs";
import { runWpMcpSmoke } from "./wp-smoke.mjs";
import { writeOnboardHtml } from "./onboard-html.mjs";
import { buildSiteProfile, writeSiteProfile } from "./site-profile.mjs";
import { evaluateCompanionEngineCheck, isAbilitySmokeBlocked } from "./ability-smoke.mjs";

export { writeOnboardHtml };

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
  const root = path.resolve(workspaceRoot);
  const entDir = path.join(root, "ent");
  const envPath = path.join(root, ".env");
  const mcpPath = path.join(root, ".cursor", "mcp.json");

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
      check(
        "core.workspace_open_mode",
        "core",
        "pass",
        "Workspace contains ent/ kit",
        relToWorkspace(root, entKit)
      )
    );
  } else {
    checks.push(
      check(
        "core.workspace_open_mode",
        "core",
        "fail",
        "Open workspace root that contains ent/, not ent/ alone",
        "."
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
    checks.push(
      check(
        "core.agent_config",
        "core",
        "pass",
        "Cursor MCP config present",
        relToWorkspace(root, mcpPath)
      )
    );
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
  let expectedMcpName = "wordpress";
  if (url) {
    const refreshed = await refreshWorkspaceMcpJson(root);
    expectedMcpName = refreshed.serverName;
  }

  if (fs.existsSync(mcpPath)) {
    const mcpRaw = fs.readFileSync(mcpPath, "utf8");
    const actualMcpName = readMcpServerName(mcpPath);
    if (!mcpRaw.includes("ent/tools/run-wordpress-mcp.mjs")) {
      checks.push(check("wp.mcp_config", "wordpress_mcp", "fail", "MCP server path incorrect"));
    } else if (url && actualMcpName !== expectedMcpName) {
      checks.push(
        check(
          "wp.mcp_config",
          "wordpress_mcp",
          "fail",
          `MCP server name should be "${expectedMcpName}"`,
          actualMcpName ?? ""
        )
      );
    } else {
      const label = actualMcpName ?? expectedMcpName;
      checks.push(
        check(
          "wp.mcp_config",
          "wordpress_mcp",
          "pass",
          `MCP server "${label}" points at ent/tools/run-wordpress-mcp.mjs`
        )
      );
    }
  } else {
    checks.push(check("wp.mcp_config", "wordpress_mcp", "fail", "Missing .cursor/mcp.json"));
  }

  if (url && user && pass) {
    const entDir = path.join(root, "ent");
    if (canResolveWpMcpLauncher(entDir)) {
      checks.push(
        check(
          "wp.mcp_launcher",
          "wordpress_mcp",
          "pass",
          "Bundled @automattic/mcp-wordpress-remote in ent/node_modules"
        )
      );
    } else {
      checks.push(
        check(
          "wp.mcp_launcher",
          "wordpress_mcp",
          "fail",
          "Run scaffold or npm install --omit=dev in ent/ to install bundled MCP"
        )
      );
    }
  } else {
    checks.push(
      check("wp.mcp_launcher", "wordpress_mcp", "fail", "Complete .env before MCP launcher check")
    );
  }

  const mcpServerName = fs.existsSync(mcpPath) ? readMcpServerName(mcpPath) : null;

  if (url && user && pass && live) {
    const smoke = await runWpMcpSmoke({ workspaceRoot: root, url, username: user, password: pass });
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

    const siteProfile = await buildSiteProfile(root, {
      url,
      username: user,
      password: pass,
      mcpServerName,
      mcpSmoke: smoke,
    });
    writeSiteProfile(root, siteProfile);
    const identityOk = siteProfile.checks.identity_ok;
    checks.push(
      check(
        "wp.site_identity",
        "wordpress_mcp",
        identityOk ? "pass" : "fail",
        identityOk
          ? `WP_MCP_URL matches site host (${siteProfile.site.host})`
          : `WP_MCP_URL host (${siteProfile.mcp.endpoint_host}) does not match site (${siteProfile.site.host ?? "unknown"})`,
        siteProfile.site.host ?? ""
      )
    );

    const blocked = (siteProfile.abilities ?? []).filter((a) => isAbilitySmokeBlocked(a));
    const abilitiesUsable = siteProfile.checks.abilities_usable !== false;
    checks.push(
      check(
        "wp.abilities_usable",
        "wordpress_mcp",
        abilitiesUsable ? "pass" : "fail",
        abilitiesUsable
          ? siteProfile.abilities_summary?.discovered
            ? `${siteProfile.abilities_summary.executable} executable, ${siteProfile.abilities_summary.needs_input ?? 0} need input, ${siteProfile.abilities_summary.blocked} blocked`
            : "No public abilities registered"
          : `${blocked.length} ability(ies) blocked for MCP user`,
        blocked.map((a) => a.name).join(", ")
      )
    );

    const companion = evaluateCompanionEngineCheck(siteProfile.abilities ?? []);
    checks.push(
      check(
        "wp.companion_engine",
        "wordpress_mcp",
        companion.status,
        companion.message,
        companion.detail
      )
    );
  } else if (url && user && pass) {
    checks.push(
      check("wp.rest_auth", "wordpress_mcp", "skip", "Live REST check deferred", "live_gate_deferred"),
      check("wp.mcp_transport", "wordpress_mcp", "skip", "Live MCP transport deferred", "live_gate_deferred"),
      check("wp.site_identity", "wordpress_mcp", "skip", "Live site identity check deferred", "live_gate_deferred"),
      check("wp.abilities_usable", "wordpress_mcp", "skip", "Live ability execute check deferred", "live_gate_deferred"),
      check("wp.companion_engine", "wordpress_mcp", "skip", "Live companion engine check deferred", "live_gate_deferred")
    );
  } else {
    checks.push(
      check("wp.rest_auth", "wordpress_mcp", "fail", "Complete .env before live REST check"),
      check("wp.mcp_transport", "wordpress_mcp", "fail", "Complete .env before live MCP check"),
      check("wp.site_identity", "wordpress_mcp", "fail", "Complete .env before site identity check"),
      check("wp.abilities_usable", "wordpress_mcp", "fail", "Complete .env before ability execute check"),
      check("wp.companion_engine", "wordpress_mcp", "fail", "Complete .env before companion engine check")
    );
  }

  const report = {
    ent_version: entVersion(entDir),
    workspace_root: portableWorkspaceRoot(),
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

export function writeStateJson(workspaceRoot, report) {
  const entDir = path.join(workspaceRoot, "ent");
  const statePath = path.join(workspaceRoot, ".ent", "state.json");
  const state = {
    onboarded: true,
    ent_commit: report.ent_version,
    agents: ["cursor"],
    profiles: ["wordpress_mcp"],
    onboarded_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  return statePath;
}
