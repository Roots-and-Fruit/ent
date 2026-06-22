import fs from "node:fs";
import path from "node:path";
import { writeWorkspaceMcpJson } from "./mcp-config.mjs";
import { planOffboard, runOffboard } from "./offboard.mjs";
import { syncWorkspace } from "./sync.mjs";
import { writeStateJson } from "./audit.mjs";

export function runOffboardTest(entRoot, workspaceRoot) {
  syncWorkspace(entRoot, workspaceRoot, "cursor");
  writeWorkspaceMcpJson(workspaceRoot, "test-site-mcp");

  writeStateJson(workspaceRoot, {
    ent_version: "test",
    workspace_root: ".",
    checks: [],
    summary: { pass: 1, fail: 0, skip: 0 },
  });

  const dryPlan = planOffboard(workspaceRoot, {
    dryRun: true,
    disconnectMcp: true,
    clearState: true,
    profiles: ["wordpress_mcp"],
  });
  if (!dryPlan.actions.some((a) => a.type === "remove_mcp_servers")) {
    throw new Error("offboard dry-run plan missing remove_mcp_servers");
  }
  if (!dryPlan.actions.some((a) => a.path === ".ent/state.json")) {
    throw new Error("offboard dry-run plan missing state.json delete");
  }

  const dryResult = runOffboard(workspaceRoot, { "dry-run": true });
  if (dryResult.applied) {
    throw new Error("dry-run offboard must not apply changes");
  }
  if (!fs.existsSync(path.join(workspaceRoot, ".ent", "state.json"))) {
    throw new Error("dry-run offboard deleted state.json");
  }

  const result = runOffboard(workspaceRoot, {});
  if (!result.applied) {
    throw new Error("offboard did not apply changes");
  }

  const mcpPath = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (fs.existsSync(mcpPath)) {
    const raw = fs.readFileSync(mcpPath, "utf8");
    if (raw.includes("run-wordpress-mcp.mjs")) {
      throw new Error("offboard left Ent MCP server in mcp.json");
    }
  }

  if (fs.existsSync(path.join(workspaceRoot, ".ent", "state.json"))) {
    throw new Error("offboard did not clear state.json");
  }

  if (!Array.isArray(result.manual_steps) || result.manual_steps.length < 1) {
    throw new Error("offboard result missing manual_steps");
  }

  syncWorkspace(entRoot, workspaceRoot, "cursor");
}
