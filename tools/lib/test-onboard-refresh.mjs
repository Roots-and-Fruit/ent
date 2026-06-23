import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  computeOnboardInputsFingerprint,
  isOnboardDashboardStale,
  isRefreshDebounced,
  refreshIfStale,
  writeOnboardMeta,
} from "./onboard-refresh.mjs";

export async function runOnboardRefreshTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ent-refresh-test-"));
  fs.mkdirSync(path.join(root, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(root, ".cursor", "mcp.json"), '{"mcpServers":{}}', "utf8");

  const fp1 = computeOnboardInputsFingerprint(root);
  assert.ok(fp1.length === 16);

  fs.writeFileSync(path.join(root, ".cursor", "mcp.json"), '{"mcpServers":{"a":{}}}', "utf8");
  const fp2 = computeOnboardInputsFingerprint(root);
  assert.notEqual(fp1, fp2);

  fs.mkdirSync(path.join(root, ".ent"), { recursive: true });
  fs.writeFileSync(path.join(root, ".ent", "onboard.html"), "<!DOCTYPE html><html></html>", "utf8");
  fs.writeFileSync(path.join(root, ".ent", "audit.json"), '{"summary":{"pass":0,"fail":0,"skip":0}}', "utf8");
  writeOnboardMeta(root, {
    generated_at: new Date(Date.now() - 10_000).toISOString(),
    inputs_fingerprint: fp1,
    reason: "test",
    live: false,
    summary: { pass: 0, fail: 0, skip: 0 },
  });

  assert.equal(isOnboardDashboardStale(root).stale, true);
  assert.equal(isOnboardDashboardStale(root).reason, "inputs-changed");

  writeOnboardMeta(root, {
    generated_at: new Date(Date.now() - 10_000).toISOString(),
    inputs_fingerprint: fp2,
    reason: "test",
    live: false,
    summary: { pass: 0, fail: 0, skip: 0 },
  });
  assert.equal(isOnboardDashboardStale(root).stale, false);

  assert.equal(isRefreshDebounced(root), false);

  writeOnboardMeta(root, {
    generated_at: new Date().toISOString(),
    inputs_fingerprint: fp2,
    reason: "test",
    live: false,
    summary: { pass: 0, fail: 0, skip: 0 },
  });
  assert.equal(isRefreshDebounced(root), true);

  const skipped = await refreshIfStale(root, { reason: "test-fresh" });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.skip_reason, "fresh");
}
