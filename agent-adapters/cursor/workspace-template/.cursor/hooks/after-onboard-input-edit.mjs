import { hookFallbackDir, hookProjectDir, readHookInput } from "./hook-io.mjs";
import { tryRefreshOnFileEdit } from "./onboard-refresh-hook.mjs";

const input = await readHookInput();
const filePath = String(input.file_path ?? input.path ?? "");
const projectDir = hookProjectDir(input);

if (filePath) {
  await tryRefreshOnFileEdit(projectDir, filePath);
}

const payload = {};
if (/mcp\.json$/i.test(filePath)) {
  payload.agent_message =
    "MCP config changed — onboard dashboard refreshed. For kit template edits, run ent sync.";
}

process.stdout.write(JSON.stringify(payload));
