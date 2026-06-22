import fs from "node:fs";
import path from "node:path";
import { scaffoldWorkspace, gitStatusPorcelain } from "./scaffold.mjs";

export function runScaffoldTest(entRoot, workspaceRoot) {
  const entDir = path.join(workspaceRoot, "ent");
  if (!fs.existsSync(path.join(entDir, ".git"))) {
    throw new Error("Fixture ent/ must be a git clone for pristine check");
  }

  const entBefore = gitStatusPorcelain(entDir);
  scaffoldWorkspace(entRoot, workspaceRoot);

  for (const rel of ["content", ".ent", ".env"]) {
    if (!fs.existsSync(path.join(workspaceRoot, rel))) {
      throw new Error(`scaffold missing ${rel}`);
    }
  }

  if (!fs.existsSync(path.join(workspaceRoot, ".cursor", "skills", "ent-onboard", "SKILL.md"))) {
    throw new Error("ent-onboard skill missing after scaffold sync");
  }

  if (!fs.existsSync(path.join(workspaceRoot, ".cursor", "skills", "ent-offboard", "SKILL.md"))) {
    throw new Error("ent-offboard skill missing after scaffold sync");
  }

  const entAfter = gitStatusPorcelain(entDir);
  if (entBefore !== entAfter) {
    throw new Error("scaffold modified ent/ working tree");
  }

  const envPath = path.join(workspaceRoot, ".env");
  fs.writeFileSync(envPath, "WP_MCP_URL=keep-me\nWP_MCP_USERNAME=u\nWP_MCP_PASSWORD=p\n", "utf8");
  const before = fs.readFileSync(envPath, "utf8");
  scaffoldWorkspace(entRoot, workspaceRoot);
  const after = fs.readFileSync(envPath, "utf8");
  if (before !== after) {
    throw new Error("scaffold overwrote existing .env");
  }
}
