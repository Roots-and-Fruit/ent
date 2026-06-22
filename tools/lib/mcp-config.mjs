import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseEnvFile } from "./env.mjs";

const DEFAULT_SERVER_NAME = "wordpress";
export const WP_MCP_REMOTE_PKG = "@automattic/mcp-wordpress-remote";

export function slugifyMcpServerName(name) {
  return (
    String(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || ""
  );
}

export function deriveMcpServerNameFromUrl(url) {
  if (!url?.trim()) {
    return DEFAULT_SERVER_NAME;
  }
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./i, "");
    return slugifyMcpServerName(host.replace(/\./g, "-")) || DEFAULT_SERVER_NAME;
  } catch {
    return DEFAULT_SERVER_NAME;
  }
}

export async function deriveMcpServerName(workspaceRoot) {
  const envPath = path.join(workspaceRoot, ".env");
  const env = parseEnvFile(envPath);
  const url = env.WP_MCP_URL?.trim();
  if (!url) {
    return DEFAULT_SERVER_NAME;
  }

  const siteRoot = url.replace(/\/wp-json\/.*$/, "");
  try {
    const res = await fetch(`${siteRoot}/wp-json`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      const slug = slugifyMcpServerName(data?.name ?? "");
      if (slug) {
        return slug;
      }
    }
  } catch {
    // Fall back to hostname slug when site index is unreachable.
  }

  return deriveMcpServerNameFromUrl(url);
}

export function buildMcpJson(serverName, { workspaceVar = "${workspaceFolder}" } = {}) {
  const config = {
    mcpServers: {
      [serverName]: {
        command: "node",
        args: [`${workspaceVar}/ent/tools/run-wordpress-mcp.mjs`],
        env: {
          OAUTH_ENABLED: "false",
        },
      },
    },
  };
  return JSON.stringify(config, null, 2) + "\n";
}

export function readMcpServerName(mcpPath) {
  if (!fs.existsSync(mcpPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    const names = Object.keys(parsed?.mcpServers ?? {});
    return names.length === 1 ? names[0] : null;
  } catch {
    return null;
  }
}

const ENT_MCP_RUNNER = "ent/tools/run-wordpress-mcp.mjs";

export function isEntMcpServerConfig(config) {
  const args = config?.args ?? [];
  return args.some((arg) => String(arg).includes(ENT_MCP_RUNNER));
}

export function listEntMcpServerKeys(parsed) {
  const keys = [];
  for (const [name, config] of Object.entries(parsed?.mcpServers ?? {})) {
    if (isEntMcpServerConfig(config)) {
      keys.push(name);
    }
  }
  return keys;
}

export function removeEntMcpServers(parsed) {
  const next = { ...parsed, mcpServers: { ...parsed.mcpServers } };
  for (const name of listEntMcpServerKeys(next)) {
    delete next.mcpServers[name];
  }
  return next;
}

export function readMcpJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function writeMcpJson(filePath, parsed) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
}

export function resolveBundledWpMcpEntry(entDir) {
  const entry = path.join(
    entDir,
    "node_modules",
    "@automattic",
    "mcp-wordpress-remote",
    "dist",
    "proxy.js"
  );
  return fs.existsSync(entry) ? entry : null;
}

export function resolveWpMcpLauncher(entDir) {
  const entry = resolveBundledWpMcpEntry(entDir);
  if (!entry) {
    return null;
  }
  return {
    command: process.execPath,
    args: [entry],
    shell: false,
    strategy: "bundled",
  };
}

export function canResolveWpMcpLauncher(entDir) {
  return resolveBundledWpMcpEntry(entDir) !== null;
}

export function writeWorkspaceMcpJson(workspaceRoot, serverName, options = {}) {
  const { workspaceVar = "${workspaceFolder}", outputBasename = "mcp.json" } = options;
  const resolvedName = serverName?.trim() || DEFAULT_SERVER_NAME;
  const parentDir = outputBasename === ".mcp.json" ? workspaceRoot : path.join(workspaceRoot, ".cursor");
  const mcpPath = path.join(parentDir, outputBasename);
  fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
  fs.writeFileSync(mcpPath, buildMcpJson(resolvedName, { workspaceVar }), "utf8");
  return { path: mcpPath, serverName: resolvedName };
}

export async function refreshWorkspaceMcpJson(workspaceRoot, options = {}) {
  const serverName = await deriveMcpServerName(workspaceRoot);
  return writeWorkspaceMcpJson(workspaceRoot, serverName, options);
}
