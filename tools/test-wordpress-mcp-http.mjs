#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { parseEnvFile, loadWpMcpEnv } from "./lib/env.mjs";
import { runWpMcpSmoke } from "./lib/wp-smoke.mjs";

const { values } = parseArgs({
  options: {
    "env-file": { type: "string" },
    "workspace-root": { type: "string" },
  },
});

const workspaceRoot = values["workspace-root"]
  ? path.resolve(values["workspace-root"])
  : values["env-file"]
    ? path.resolve(path.dirname(values["env-file"]))
    : workspaceFromScriptMeta(import.meta.url);

let url, username, password;
if (values["env-file"]) {
  const env = parseEnvFile(path.resolve(values["env-file"]));
  url = env.WP_MCP_URL?.trim();
  username = env.WP_MCP_USERNAME?.trim();
  password = env.WP_MCP_PASSWORD?.trim();
} else {
  ({ url, username, password } = loadWpMcpEnv(workspaceRoot));
}

console.log("=== Ent WordPress MCP smoke ===");
const result = await runWpMcpSmoke({ workspaceRoot, url, username, password });

if (!result.ok) {
  console.error(`FAIL  ${result.stage}: ${result.message}`);
  process.exit(1);
}

console.log(`OK  REST auth, MCP initialize, tools/list (${result.toolCount} tools)`);
process.exit(0);
