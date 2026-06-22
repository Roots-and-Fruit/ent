import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  canResolveWpMcpLauncher,
  resolveBundledWpMcpEntry,
  WP_MCP_REMOTE_PKG,
} from "./mcp-config.mjs";

export function entDeclaresWpMcpRemote(entDir) {
  const pkgPath = path.join(entDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return false;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return Boolean(pkg.dependencies?.[WP_MCP_REMOTE_PKG]);
}

export function ensureEntDependencies(entDir) {
  const root = path.resolve(entDir);
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Missing ent package.json: ${pkgPath}`);
  }

  if (canResolveWpMcpLauncher(root)) {
    return { installed: false, entry: resolveBundledWpMcpEntry(root) };
  }

  if (!entDeclaresWpMcpRemote(root)) {
    return {
      installed: false,
      entry: null,
      skipped: true,
      reason: `ent/package.json missing ${WP_MCP_REMOTE_PKG} — git pull ent`,
    };
  }

  execSync("npm install --omit=dev", { cwd: root, stdio: "pipe", encoding: "utf8" });
  const entry = resolveBundledWpMcpEntry(root);
  if (!entry) {
    throw new Error(
      `npm install in ent/ did not install ${WP_MCP_REMOTE_PKG} — check network and package-lock.json`
    );
  }

  return { installed: true, entry };
}
