import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runWpGet } from "./wp-command.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ent-wp-command-"));
}

export async function runWpCommandTest() {
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".ent"), { recursive: true });

  let threw = false;
  try {
    await runWpGet(root, { path: "/wp/v2/posts" });
  } catch (err) {
    threw = true;
    if (!/WP_MCP_URL/.test(err.message)) {
      throw new Error(`expected env error, got: ${err.message}`);
    }
  }
  if (!threw) {
    throw new Error("runWpGet should fail without .env");
  }
}
