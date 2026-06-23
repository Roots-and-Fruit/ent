import { buildSessionPreload, writeSessionContextFile } from "./preload-lib.mjs";
import { hookFallbackDir, hookProjectDir, readHookInput } from "./hook-io.mjs";
import { tryRefreshIfStale } from "./onboard-refresh-hook.mjs";

const input = await readHookInput();
const fallbackDir = hookFallbackDir(input);
const projectDir = hookProjectDir(input);
const preload = buildSessionPreload(fallbackDir, {
  workspaceRoots: input.workspace_roots,
});
writeSessionContextFile(preload);

// 2-lite: refresh onboard.html only when inputs are stale (no preload/token changes).
await tryRefreshIfStale(projectDir, "session-boot");

process.stdout.write(
  JSON.stringify({
    env: preload.env,
    additional_context: preload.additionalContext,
  })
);
