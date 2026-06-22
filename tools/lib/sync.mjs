import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { writeDevRootsManifest } from "./dev-roots.mjs";
import { deriveMcpServerNameFromUrl, writeWorkspaceMcpJson } from "./mcp-config.mjs";
import { parseEnvFile } from "./env.mjs";
import { ensureEntDependencies } from "./deps.mjs";

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

export function pruneObsoleteCursorRules(rulesDir) {
  const obsolete = ["00-ent-boot.mdc", "01-ent-layout.mdc", "02-ent-agent-preload.mdc", "00-ent-dev-multroot.mdc"];
  if (!fs.existsSync(rulesDir)) {
    return;
  }
  for (const name of obsolete) {
    const rulePath = path.join(rulesDir, name);
    if (fs.existsSync(rulePath)) {
      fs.unlinkSync(rulePath);
    }
  }
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

export function syncKitDevCursor(entRoot) {
  const templateCursor = path.join(
    entRoot,
    "agent-adapters",
    "cursor",
    "workspace-template",
    ".cursor"
  );
  const kitDevRules = path.join(entRoot, "agent-adapters", "cursor", "kit-dev", "rules");
  const destCursor = path.join(entRoot, ".cursor");
  const destRules = path.join(destCursor, "rules");

  fs.mkdirSync(destRules, { recursive: true });
  pruneObsoleteCursorRules(destRules);
  if (fs.existsSync(kitDevRules)) {
    copyDir(kitDevRules, destRules);
  }
  copyDir(path.join(templateCursor, "hooks"), path.join(destCursor, "hooks"));
  copyFile(path.join(templateCursor, "hooks.json"), path.join(destCursor, "hooks.json"));
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

  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  writeWorkspaceMcpJson(
    workspaceRoot,
    deriveMcpServerNameFromUrl(env.WP_MCP_URL?.trim())
  );

  const sharedSkills = path.join(entRoot, "agent-adapters", "shared", "skills");
  const destSkills = path.join(destCursor, "skills");
  if (fs.existsSync(sharedSkills)) {
    copyDir(sharedSkills, destSkills);
  }

  pruneObsoleteCursorRules(path.join(destCursor, "rules"));

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
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  writeWorkspaceMcpJson(
    workspaceRoot,
    deriveMcpServerNameFromUrl(env.WP_MCP_URL?.trim()),
    { workspaceVar: "${CLAUDE_PROJECT_DIR:-.}", outputBasename: ".mcp.json" }
  );

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
    if (path.resolve(workspaceRoot) !== path.resolve(entRoot)) {
      syncKitDevCursor(entRoot);
      writeDevRootsManifest(entRoot, workspaceRoot);
    }
  }
  if (agent === "claude-code" || agent === "all") {
    syncClaudeCode(entRoot, workspaceRoot);
  }

  ensureEntDependencies(entInWorkspace);
}

export function assertEntPristine(entDir) {
  const status = execSync("git status --porcelain", { cwd: entDir, encoding: "utf8" }).trim();
  if (status) {
    throw new Error(`ent/ working tree not clean:\n${status}`);
  }
}
