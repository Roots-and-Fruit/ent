import fs from "node:fs";
import path from "node:path";

const projectDir = process.env.CURSOR_PROJECT_DIR ?? process.cwd();
const entMcpScript = path.join(projectDir, "ent", "tools", "run-wordpress-mcp.mjs");
const entCoreDir = path.join(projectDir, "ent");
const mcpConfigActive = path.join(projectDir, ".cursor", "mcp.json");

let openMode = "unknown";
if (fs.existsSync(entMcpScript)) {
  openMode = "workspace";
} else if (fs.existsSync(path.join(projectDir, "tools", "ent.mjs"))) {
  openMode = "ent-only";
}

process.stdout.write(
  JSON.stringify({
    env: {
      ENT_WORKSPACE_ROOT: projectDir,
      ENT_CORE_DIR: fs.existsSync(entCoreDir) ? entCoreDir : projectDir,
      ENT_WORKSPACE_OPEN_MODE: openMode,
      ENT_MCP_CONFIG_ACTIVE: mcpConfigActive,
    },
  })
);
