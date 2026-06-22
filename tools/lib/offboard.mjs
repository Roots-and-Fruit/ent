import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env.mjs";
import {
  listEntMcpServerKeys,
  readMcpJson,
  removeEntMcpServers,
  writeMcpJson,
} from "./mcp-config.mjs";
import { portableWorkspaceRoot } from "./paths.mjs";

export const OFFBOARD_MANUAL_STEPS = [
  "Disable the Ent MCP server in Cursor Settings → MCP",
  "Run Developer: Reload Window so Cursor drops the old MCP process",
  "Optionally revoke the WordPress Application Password in wp-admin → Users → Profile",
];

const WP_ENV_KEYS = ["WP_MCP_URL", "WP_MCP_USERNAME", "WP_MCP_PASSWORD"];

export function parseOffboardOptions(args = {}) {
  return {
    dryRun: Boolean(args["dry-run"]),
    disconnectMcp: !args["keep-mcp"],
    clearState: !args["keep-state"],
    clearAudit: Boolean(args["clear-audit"]),
    clearEnv: Boolean(args["clear-env"]),
    removeProjected: Boolean(args["remove-projected"]),
    removeKit: Boolean(args["remove-kit"]),
    profiles: String(args.profiles ?? "wordpress_mcp")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  };
}

function mcpTargets(workspaceRoot) {
  return [
    path.join(workspaceRoot, ".cursor", "mcp.json"),
    path.join(workspaceRoot, ".mcp.json"),
  ];
}

export function planOffboard(workspaceRoot, options) {
  const root = path.resolve(workspaceRoot);
  const actions = [];

  if (options.disconnectMcp && options.profiles.includes("wordpress_mcp")) {
    for (const mcpPath of mcpTargets(root)) {
      const parsed = readMcpJson(mcpPath);
      if (!parsed) {
        continue;
      }
      const keys = listEntMcpServerKeys(parsed);
      if (keys.length === 0) {
        continue;
      }
      actions.push({
        type: "remove_mcp_servers",
        path: path.relative(root, mcpPath).split(path.sep).join("/"),
        servers: keys,
      });
    }
  }

  const statePath = path.join(root, ".ent", "state.json");
  if (options.clearState && fs.existsSync(statePath)) {
    actions.push({ type: "delete_file", path: ".ent/state.json" });
  }

  if (options.clearAudit) {
    for (const rel of [
      ".ent/audit.json",
      ".ent/site-profile.json",
      ".ent/onboard.html",
      ".ent/onboard-log.json",
    ]) {
      if (fs.existsSync(path.join(root, rel))) {
        actions.push({ type: "delete_file", path: rel });
      }
    }
  }

  const envPath = path.join(root, ".env");
  if (options.clearEnv && fs.existsSync(envPath)) {
    const env = parseEnvFile(envPath);
    const keys = WP_ENV_KEYS.filter((key) => env[key]);
    if (keys.length > 0) {
      actions.push({ type: "clear_env_keys", path: ".env", keys });
    }
  }

  if (options.removeProjected) {
    const cursorDir = path.join(root, ".cursor");
    if (fs.existsSync(cursorDir)) {
      actions.push({ type: "delete_tree", path: ".cursor" });
    }
    const claudeMcp = path.join(root, ".mcp.json");
    if (fs.existsSync(claudeMcp)) {
      actions.push({ type: "delete_file", path: ".mcp.json" });
    }
  }

  const entDir = path.join(root, "ent");
  if (options.removeKit && fs.existsSync(entDir)) {
    actions.push({ type: "delete_tree", path: "ent" });
  }

  return {
    workspace_root: portableWorkspaceRoot(),
    dry_run: options.dryRun,
    profiles: options.profiles,
    actions,
    manual_steps: OFFBOARD_MANUAL_STEPS,
  };
}

function clearEnvKeys(envPath) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  const next = lines.filter((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      return true;
    }
    const key = line.slice(0, line.indexOf("=")).trim();
    return !WP_ENV_KEYS.includes(key);
  });
  fs.writeFileSync(envPath, next.join("\n").replace(/\n?$/, "\n"), "utf8");
}

function deleteTree(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

export function runOffboard(workspaceRoot, rawOptions = {}) {
  const options = parseOffboardOptions(rawOptions);
  const root = path.resolve(workspaceRoot);
  const plan = planOffboard(root, options);

  if (options.dryRun) {
    return { ...plan, applied: false };
  }

  for (const action of plan.actions) {
    const target = path.join(root, action.path);
    switch (action.type) {
      case "remove_mcp_servers": {
        const parsed = readMcpJson(target);
        if (!parsed) {
          break;
        }
        const next = removeEntMcpServers(parsed);
        if (Object.keys(next.mcpServers ?? {}).length === 0) {
          deleteTree(target);
        } else {
          writeMcpJson(target, next);
        }
        break;
      }
      case "delete_file":
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
        }
        break;
      case "clear_env_keys":
        clearEnvKeys(target);
        break;
      case "delete_tree":
        deleteTree(target);
        break;
      default:
        throw new Error(`Unknown offboard action: ${action.type}`);
    }
  }

  return { ...plan, applied: true };
}
