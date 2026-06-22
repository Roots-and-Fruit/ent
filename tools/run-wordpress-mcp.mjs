import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { loadWpMcpEnv, workspaceFromScriptMeta } from "./lib/env.mjs";

const workspaceRoot = workspaceFromScriptMeta(import.meta.url);
const { envPath, url, username, password } = loadWpMcpEnv(workspaceRoot);

const missing = [];
if (!url) missing.push("WP_MCP_URL");
if (!username) missing.push("WP_MCP_USERNAME");
if (!password) missing.push("WP_MCP_PASSWORD");

if (missing.length > 0) {
  console.error(`Missing WordPress MCP env vars: ${missing.join(", ")}`);
  console.error(`Expected in ${envPath} or process environment.`);
  process.exit(1);
}

const childEnv = {
  ...process.env,
  WP_API_URL: url,
  WP_API_USERNAME: username,
  WP_API_PASSWORD: password,
  OAUTH_ENABLED: process.env.OAUTH_ENABLED ?? "false",
  ENT_WORKSPACE_ROOT: workspaceRoot,
};

const packageSpec = "@automattic/mcp-wordpress-remote@latest";
let spawnCommand;
let spawnArgs;

if (process.platform === "win32") {
  const nodeExe = process.execPath;
  const npxCli = path.join(path.dirname(nodeExe), "node_modules", "npm", "bin", "npx-cli.js");
  spawnCommand = nodeExe;
  spawnArgs = [npxCli, "-y", packageSpec];
} else {
  spawnCommand = "npx";
  spawnArgs = ["-y", packageSpec];
}

const child = spawn(spawnCommand, spawnArgs, {
  cwd: workspaceRoot,
  env: childEnv,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
