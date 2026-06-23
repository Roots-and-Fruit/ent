import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Silent onboard refresh for Cursor hooks — no stdout, no preload/token changes.
 */
export async function tryRefreshOnboardDashboard(projectDir, options = {}) {
  const root = path.resolve(projectDir);
  const refreshPath = path.join(root, "ent", "tools", "lib", "onboard-refresh.mjs");
  if (!fs.existsSync(refreshPath)) {
    return null;
  }

  try {
    const mod = await import(pathToFileURL(refreshPath).href);
    return await mod.refreshOnboardDashboard(root, options);
  } catch {
    return null;
  }
}

export async function tryRefreshIfStale(projectDir, reason) {
  return tryRefreshOnboardDashboard(projectDir, { reason, force: false });
}

export async function tryRefreshOnFileEdit(projectDir, filePath) {
  const refreshPath = path.join(projectDir, "ent", "tools", "lib", "onboard-refresh.mjs");
  if (!fs.existsSync(refreshPath)) {
    return null;
  }

  try {
    const mod = await import(pathToFileURL(refreshPath).href);
    if (!mod.isWatchedOnboardInput(projectDir, filePath)) {
      return null;
    }
    return await mod.refreshOnboardDashboard(projectDir, {
      reason: "file-edit",
      force: true,
    });
  } catch {
    return null;
  }
}
