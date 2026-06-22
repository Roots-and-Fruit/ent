import fs from "node:fs";
import { buildSessionPreload, writeSessionContextFile } from "./preload-lib.mjs";
import { hookFallbackDir, readHookInput } from "./hook-io.mjs";

const input = await readHookInput();
const fallbackDir = hookFallbackDir(input);
const allow = { permission: "allow" };

if (process.env.ENT_SESSION_PRELOAD_DONE === "1") {
  process.stdout.write(JSON.stringify(allow));
  process.exit(0);
}

const preload = buildSessionPreload(fallbackDir, {
  workspaceRoots: input.workspace_roots,
});

if (fs.existsSync(preload.contextFilePath)) {
  process.stdout.write(JSON.stringify(allow));
  process.exit(0);
}

writeSessionContextFile(preload);

process.stdout.write(
  JSON.stringify({
    permission: "allow",
    agent_message: `Ent preload (fallback): start consumer work at \`${preload.consumerRoot ?? preload.projectDir}\`. See \`.ent/session-context.md\`.`,
  })
);
