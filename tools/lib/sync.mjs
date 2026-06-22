import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export function normalizeJson(text) {
  return JSON.stringify(JSON.parse(text), null, 2);
}

export function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function copyDir(src, dest, options = {}) {
  const { skipDirs = new Set() } = options;
  if (!fs.existsSync(src)) {
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) {
      continue;
    }
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to, options);
    } else {
      copyFile(from, to);
    }
  }
}

export function writeBootRule(entRoot, workspaceRoot) {
  const bootSource = path.join(entRoot, "ENT-BOOT.md");
  const bootBody = fs.readFileSync(bootSource, "utf8").trimEnd();
  const rulePath = path.join(workspaceRoot, ".cursor", "rules", "00-ent-boot.mdc");
  const ruleContent = `---
description: Ent workspace boot — layout, onboard, verification
alwaysApply: true
---

${bootBody}
`;
  fs.mkdirSync(path.dirname(rulePath), { recursive: true });
  fs.writeFileSync(rulePath, ruleContent, "utf8");
}

export function mergeAgentsMd(workspaceRoot, templatePath) {
  const dest = path.join(workspaceRoot, "AGENTS.md");
  const template = fs.readFileSync(templatePath, "utf8");
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, template, "utf8");
    return;
  }
  const existing = fs.readFileSync(dest, "utf8");
  const begin = "<!-- ent:begin -->";
  const end = "<!-- ent:end -->";
  const blockMatch = template.match(new RegExp(`${begin}[\\s\\S]*?${end}`));
  if (!blockMatch) {
    return;
  }
  const block = blockMatch[0];
  if (existing.includes(begin) && existing.includes(end)) {
    const merged = existing.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block);
    fs.writeFileSync(dest, merged, "utf8");
  } else {
    fs.writeFileSync(dest, `${existing.trimEnd()}\n\n${block}\n`, "utf8");
  }
}

export function syncCursor(entRoot, workspaceRoot) {
  const templateCursor = path.join(
    entRoot,
    "agent-adapters",
    "cursor",
    "workspace-template",
    ".cursor"
  );
  const destCursor = path.join(workspaceRoot, ".cursor");
  copyDir(templateCursor, destCursor, { skipDirs: new Set(["skills"]) });

  const sharedSkills = path.join(entRoot, "agent-adapters", "shared", "skills");
  const destSkills = path.join(destCursor, "skills");
  if (fs.existsSync(sharedSkills)) {
    copyDir(sharedSkills, destSkills);
  }

  writeBootRule(entRoot, workspaceRoot);

  const agentsTemplate = path.join(
    entRoot,
    "agent-adapters",
    "cursor",
    "workspace-template",
    "AGENTS.md"
  );
  if (fs.existsSync(agentsTemplate)) {
    mergeAgentsMd(workspaceRoot, agentsTemplate);
  }
}

export function syncClaudeCode(entRoot, workspaceRoot) {
  const templateDir = path.join(entRoot, "agent-adapters", "claude-code", "templates");
  const mcpSrc = path.join(templateDir, "mcp.json");
  const mcpDest = path.join(workspaceRoot, ".mcp.json");
  if (fs.existsSync(mcpSrc)) {
    copyFile(mcpSrc, mcpDest);
  }

  const fragmentPath = path.join(templateDir, "CLAUDE.md.fragment");
  const claudeMd = path.join(workspaceRoot, "CLAUDE.md");
  if (!fs.existsSync(fragmentPath)) {
    return;
  }
  const fragment = fs.readFileSync(fragmentPath, "utf8");
  if (!fs.existsSync(claudeMd)) {
    fs.writeFileSync(claudeMd, fragment.trim() + "\n", "utf8");
    return;
  }
  const existing = fs.readFileSync(claudeMd, "utf8");
  const begin = "<!-- ent:begin -->";
  const end = "<!-- ent:end -->";
  if (existing.includes(begin) && existing.includes(end)) {
    const blockMatch = fragment.match(new RegExp(`${begin}[\\s\\S]*?${end}`));
    if (blockMatch) {
      fs.writeFileSync(
        claudeMd,
        existing.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), blockMatch[0]),
        "utf8"
      );
    }
  } else {
    fs.writeFileSync(claudeMd, `${existing.trimEnd()}\n\n${fragment.trim()}\n`, "utf8");
  }
}

export function syncWorkspace(entRoot, workspaceRoot, agent = "cursor") {
  const entInWorkspace = path.join(workspaceRoot, "ent");
  if (!fs.existsSync(path.join(entInWorkspace, "tools", "ent.mjs"))) {
    throw new Error(`Workspace missing ent kit: ${entInWorkspace}`);
  }

  if (agent === "cursor" || agent === "all") {
    syncCursor(entRoot, workspaceRoot);
  }
  if (agent === "claude-code" || agent === "all") {
    syncClaudeCode(entRoot, workspaceRoot);
  }
}

export function assertEntPristine(entDir) {
  const status = execSync("git status --porcelain", { cwd: entDir, encoding: "utf8" }).trim();
  if (status) {
    throw new Error(`ent/ working tree not clean:\n${status}`);
  }
}
