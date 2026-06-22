import assert from "node:assert/strict";
import path from "node:path";
import { getEntRoot } from "./manifest.mjs";
import {
  canResolveWpMcpLauncher,
  deriveMcpServerNameFromUrl,
  resolveBundledWpMcpEntry,
  resolveWpMcpLauncher,
  slugifyMcpServerName,
} from "./mcp-config.mjs";
import { ensureEntDependencies } from "./deps.mjs";

export function runMcpConfigTest() {
  assert.equal(slugifyMcpServerName("WP Product Talk"), "wp-product-talk");
  assert.equal(deriveMcpServerNameFromUrl("https://wpproducttalk.com/wp-json/mcp/x"), "wpproducttalk-com");

  const entDir = getEntRoot();
  ensureEntDependencies(entDir);

  const entry = resolveBundledWpMcpEntry(entDir);
  assert.ok(entry, "bundled MCP entry must exist after ensureEntDependencies");
  assert.ok(entry.replace(/\\/g, "/").endsWith("@automattic/mcp-wordpress-remote/dist/proxy.js"));

  const launcher = resolveWpMcpLauncher(entDir);
  assert.ok(launcher);
  assert.equal(launcher.strategy, "bundled");
  assert.equal(launcher.command, process.execPath);
  assert.deepEqual(launcher.args, [entry]);
  assert.equal(canResolveWpMcpLauncher(entDir), true);
}
