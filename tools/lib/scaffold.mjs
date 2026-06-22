import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { syncWorkspace } from "./sync.mjs";

export function scaffoldWorkspace(entRoot, workspaceRoot) {
  const contentDir = path.join(workspaceRoot, "content");
  const entStateDir = path.join(workspaceRoot, ".ent");
  const envDest = path.join(workspaceRoot, ".env");
  const envExample = path.join(entRoot, ".env.example");

  fs.mkdirSync(contentDir, { recursive: true });
  fs.mkdirSync(entStateDir, { recursive: true });

  if (!fs.existsSync(envDest) && fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envDest);
  }

  syncWorkspace(entRoot, workspaceRoot, "cursor");
}

export function gitStatusPorcelain(cwd) {
  return execSync("git status --porcelain", { cwd, encoding: "utf8" }).trim();
}
