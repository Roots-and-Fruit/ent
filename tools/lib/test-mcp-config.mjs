import assert from "node:assert/strict";
import fs from "node:fs";
import {
  bundledNpxCli,
  canResolveNpx,
  deriveMcpServerNameFromUrl,
  findOnPath,
  resolveNpxInvocation,
  slugifyMcpServerName,
} from "./mcp-config.mjs";

export function runMcpConfigTest() {
  assert.equal(slugifyMcpServerName("WP Product Talk"), "wp-product-talk");
  assert.equal(deriveMcpServerNameFromUrl("https://wpproducttalk.com/wp-json/mcp/x"), "wpproducttalk-com");

  const invocation = resolveNpxInvocation("@automattic/mcp-wordpress-remote@latest");
  assert.ok(invocation.command);
  assert.deepEqual(invocation.args.slice(0, 2), ["-y", "@automattic/mcp-wordpress-remote@latest"]);

  const pathNpx = findOnPath("npx");
  const bundledNpx = fs.existsSync(bundledNpxCli());
  if (pathNpx) {
    assert.equal(invocation.strategy, "path");
  } else if (bundledNpx) {
    assert.equal(invocation.strategy, "bundled-npm");
  }

  assert.equal(canResolveNpx(), Boolean(pathNpx || bundledNpx));
}
