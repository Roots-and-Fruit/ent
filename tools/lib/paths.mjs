import path from "node:path";

/** Workspace-relative path for reports (posix slashes). */
export function relToWorkspace(workspaceRoot, targetPath) {
  if (!targetPath) {
    return "";
  }
  const base = path.resolve(workspaceRoot);
  const resolved = path.resolve(base, targetPath);
  const rel = path.relative(base, resolved);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return rel.split(path.sep).join("/");
  }
  return rel.split(path.sep).join("/") || ".";
}

/** Audit/onboard display root — always the consumer workspace, not a host path. */
export function portableWorkspaceRoot() {
  return ".";
}
