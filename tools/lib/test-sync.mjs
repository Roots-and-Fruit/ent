import fs from "node:fs";
import path from "node:path";
import { normalizeJson } from "./sync.mjs";

export function runSyncTest(entRoot, workspaceRoot) {
  const workspaceMcp = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (!fs.existsSync(workspaceMcp)) {
    throw new Error(`Missing ${workspaceMcp} — run ent sync first`);
  }

  const workspaceRaw = normalizeJson(fs.readFileSync(workspaceMcp, "utf8"));
  const parsed = JSON.parse(workspaceRaw);
  const serverNames = Object.keys(parsed.mcpServers ?? {});
  if (serverNames.length !== 1) {
    throw new Error("mcp.json must define exactly one MCP server");
  }

  const hooksPath = path.join(workspaceRoot, ".cursor", "hooks.json");
  const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));

  const preloadRule = path.join(workspaceRoot, ".cursor", "rules", "00-ent-preload.mdc");
  if (!fs.existsSync(preloadRule)) {
    throw new Error("Missing 00-ent-preload.mdc after sync");
  }

  const devRoots = path.join(workspaceRoot, ".cursor", "ent-dev-roots.json");
  if (!fs.existsSync(devRoots)) {
    throw new Error("Missing ent-dev-roots.json after sync — re-run sync from kit to consumer");
  }
  const rootsManifest = JSON.parse(fs.readFileSync(devRoots, "utf8"));
  if (!rootsManifest.consumerRoot || !rootsManifest.kitRoot) {
    throw new Error("ent-dev-roots.json missing kitRoot or consumerRoot");
  }

  const kitDevRule = path.join(entRoot, "agent-adapters", "cursor", "kit-dev", "rules", "00-ent-kit-dev.mdc");
  if (!fs.existsSync(kitDevRule)) {
    throw new Error("Missing kit-dev preload pointer rule");
  }

  for (const obsolete of ["00-ent-boot.mdc", "01-ent-layout.mdc", "02-ent-agent-preload.mdc"]) {
    if (fs.existsSync(path.join(workspaceRoot, ".cursor", "rules", obsolete))) {
      throw new Error(`Obsolete rule still present after sync: ${obsolete}`);
    }
  }

  const claudeTemplates = path.join(entRoot, "agent-adapters", "claude-code", "templates", "mcp.json");
  if (!fs.existsSync(claudeTemplates)) {
    throw new Error("Missing Claude Code mcp.json template");
  }

  const skillPath = path.join(workspaceRoot, ".cursor", "skills", "ent-onboard", "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    throw new Error("Missing ent-onboard skill after sync");
  }

  const offboardSkill = path.join(workspaceRoot, ".cursor", "skills", "ent-offboard", "SKILL.md");
  if (!fs.existsSync(offboardSkill)) {
    throw new Error("Missing ent-offboard skill after sync");
  }

  if (!hooks.hooks?.sessionStart?.length) {
    throw new Error("hooks.json must register sessionStart");
  }
  if (!hooks.hooks?.beforeSubmitPrompt?.length) {
    throw new Error("hooks.json must register beforeSubmitPrompt preload fallback");
  }

  for (const script of ["hook-io.mjs", "preload-lib.mjs", "session-boot.mjs", "session-preload-fallback.mjs"]) {
    const hookScript = path.join(workspaceRoot, ".cursor", "hooks", script);
    if (!fs.existsSync(hookScript)) {
      throw new Error(`Missing hook script after sync: ${script}`);
    }
  }

  const staticPreload = path.join(
    entRoot,
    "agent-adapters",
    "shared",
    "preload",
    "ent-session-context.md"
  );
  if (!fs.existsSync(staticPreload)) {
    throw new Error("Missing shared preload source ent-session-context.md");
  }

  const mcpContent = fs.readFileSync(workspaceMcp, "utf8");
  if (!mcpContent.includes("ent/tools/run-wordpress-mcp.mjs")) {
    throw new Error("mcp.json must reference ent/tools/run-wordpress-mcp.mjs");
  }
}
