import fs from "node:fs";
import path from "node:path";

export const DEV_ROOTS_MANIFEST = "ent-dev-roots.json";

export function writeDevRootsManifest(kitRoot, consumerRoot) {
  const manifest = {
    version: 1,
    layout: "multi-root-dev",
    kitRoot: path.resolve(kitRoot),
    consumerRoot: path.resolve(consumerRoot),
    workStart: {
      consumer: "Audit, onboard, MCP, content, .env — run CLI with --workspace-root pointing here.",
      kit: "Manifest, CLI, adapters — edit and commit here, then sync to consumer.",
    },
  };
  for (const root of [kitRoot, consumerRoot]) {
    const dest = path.join(root, ".cursor", DEV_ROOTS_MANIFEST);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }
  return manifest;
}
