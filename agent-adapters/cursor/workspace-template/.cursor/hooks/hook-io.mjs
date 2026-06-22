import { discoverWorkspaceRoots, resolvePreloadRoot } from "./preload-lib.mjs";

export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function readHookInput() {
  const raw = await readStdin();
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function hookFallbackDir(input) {
  return process.env.CURSOR_PROJECT_DIR ?? process.cwd();
}

export function hookProjectDir(input) {
  const fallback = hookFallbackDir(input);
  const discovered = discoverWorkspaceRoots(fallback, input.workspace_roots ?? []);
  return resolvePreloadRoot(discovered);
}
