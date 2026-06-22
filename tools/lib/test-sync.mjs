import fs from "node:fs";
import path from "node:path";
import { normalizeJson } from "./sync.mjs";

export function runSyncTest(entRoot, workspaceRoot) {
  const templateMcp = path.join(
    entRoot,
    "agent-adapters",
    "cursor",
    "workspace-template",
    ".cursor",
    "mcp.json"
  );
  const workspaceMcp = path.join(workspaceRoot, ".cursor", "mcp.json");
  if (!fs.existsSync(workspaceMcp)) {
    throw new Error(`Missing ${workspaceMcp} — run ent sync first`);
  }

  const templateRaw = normalizeJson(fs.readFileSync(templateMcp, "utf8"));
  const workspaceRaw = normalizeJson(fs.readFileSync(workspaceMcp, "utf8"));
  if (templateRaw !== workspaceRaw) {
    throw new Error("mcp.json mismatch between template and workspace .cursor/");
  }

  const hooksPath = path.join(workspaceRoot, ".cursor", "hooks.json");
  JSON.parse(fs.readFileSync(hooksPath, "utf8"));

  const bootPath = path.join(workspaceRoot, ".cursor", "rules", "00-ent-boot.mdc");
  const boot = fs.readFileSync(bootPath, "utf8");
  const entBoot = fs.readFileSync(path.join(entRoot, "ENT-BOOT.md"), "utf8").trim();
  if (!boot.includes(entBoot.slice(0, 40))) {
    throw new Error("00-ent-boot.mdc does not include ENT-BOOT.md content");
  }

  const claudeTemplates = path.join(entRoot, "agent-adapters", "claude-code", "templates", "mcp.json");
  if (!fs.existsSync(claudeTemplates)) {
    throw new Error("Missing Claude Code mcp.json template");
  }

  const skillPath = path.join(workspaceRoot, ".cursor", "skills", "ent-onboard", "SKILL.md");
  if (!fs.existsSync(skillPath)) {
    throw new Error("Missing ent-onboard skill after sync");
  }

  const mcpContent = fs.readFileSync(workspaceMcp, "utf8");
  if (!mcpContent.includes("ent/tools/run-wordpress-mcp.mjs")) {
    throw new Error("mcp.json must reference ent/tools/run-wordpress-mcp.mjs");
  }
}
