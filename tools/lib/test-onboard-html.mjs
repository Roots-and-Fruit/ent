import assert from "node:assert/strict";
import { deriveCapabilities } from "./onboard-html.mjs";

export function runOnboardHtmlTest() {
  const baseReport = {
    ent_version: "test",
    workspace_root: ".",
    summary: { pass: 10, fail: 0, skip: 0 },
    checks: [
      { id: "wp.rest_auth", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.mcp_transport", profile: "wordpress_mcp", status: "pass", message: "ok" },
    ],
  };

  const withEdit = deriveCapabilities(baseReport, [
    { name: "plugin/create-post", label: "Create Post", description: "Create a post" },
  ]);
  assert.equal(withEdit.content.read, true);
  assert.equal(withEdit.content.edit, true);

  const disconnected = deriveCapabilities(
    { ...baseReport, checks: [{ id: "wp.rest_auth", status: "fail", message: "x" }] },
    []
  );
  assert.equal(disconnected.content.read, false);
}
