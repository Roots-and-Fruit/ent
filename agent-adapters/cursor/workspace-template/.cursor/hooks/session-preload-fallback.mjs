import { buildSessionPreload, writeSessionContextFile } from "./preload-lib.mjs";
import { hookFallbackDir, readHookInput } from "./hook-io.mjs";

const input = await readHookInput();
const allow = { continue: true };

if (process.env.ENT_SESSION_PRELOAD_DONE === "1") {
  process.stdout.write(JSON.stringify(allow));
  process.exit(0);
}

const fallbackDir = hookFallbackDir(input);
const preload = buildSessionPreload(fallbackDir, {
  workspaceRoots: input.workspace_roots,
});
writeSessionContextFile(preload);

process.stdout.write(JSON.stringify(allow));
