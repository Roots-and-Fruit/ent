import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const index = line.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }
  return env;
}

export function resolveWorkspaceRoot(fromDir) {
  if (process.env.ENT_WORKSPACE_ROOT?.trim()) {
    return path.resolve(process.env.ENT_WORKSPACE_ROOT.trim());
  }
  // ent/tools/*.mjs → workspace is two levels up
  return path.resolve(fromDir, "..", "..");
}

export function loadWpMcpEnv(workspaceRoot) {
  const envPath = path.join(workspaceRoot, ".env");
  const fileEnv = parseEnvFile(envPath);
  const url = fileEnv.WP_MCP_URL ?? process.env.WP_MCP_URL ?? process.env.WP_API_URL;
  const username = fileEnv.WP_MCP_USERNAME ?? process.env.WP_MCP_USERNAME ?? process.env.WP_API_USERNAME;
  const password = fileEnv.WP_MCP_PASSWORD ?? process.env.WP_MCP_PASSWORD ?? process.env.WP_API_PASSWORD;
  return { envPath, url: url?.trim(), username: username?.trim(), password: password?.trim() };
}

export function workspaceFromScriptMeta(metaUrl) {
  const scriptDir = path.dirname(fileURLToPath(metaUrl));
  return resolveWorkspaceRoot(scriptDir);
}
