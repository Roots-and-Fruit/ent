import assert from "node:assert/strict";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";

export function runOnboardHtmlTest() {
  const checklist = loadOnboardChecklist();
  assert.ok(checklist.sections.some((s) => s.id === "wordpress_mcp"));
  assert.ok(checklist.sections.some((s) => s.id === "content"));

  const baseReport = {
    ent_version: "test",
    workspace_root: ".",
    summary: { pass: 10, fail: 0, skip: 0 },
    checks: [
      { id: "wp.env_present", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.env_complete", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.mcp_config", profile: "wordpress_mcp", status: "pass", message: 'MCP server "test" ok' },
      { id: "wp.mcp_launcher", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.rest_auth", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.mcp_transport", profile: "wordpress_mcp", status: "pass", message: "ok" },
    ],
  };

  const sections = resolveChecklistSections(checklist, baseReport, [
    { name: "plugin/create-post", label: "Create Post", description: "Create a post" },
  ]);

  const wpSection = sections.find((s) => s.id === "wordpress_mcp");
  assert.equal(wpSection.items.length, 6);
  assert.ok(wpSection.items.every((item) => item.checked));

  const content = sections.find((s) => s.id === "content");
  const read = content.items.find((i) => i.id === "read");
  const edit = content.items.find((i) => i.id === "edit");
  assert.equal(read.checked, true);
  assert.equal(edit.checked, true);

  const disconnected = resolveChecklistSections(
    checklist,
    { ...baseReport, checks: [{ id: "wp.rest_auth", profile: "wordpress_mcp", status: "fail", message: "x" }] },
    []
  );
  const readOff = disconnected.find((s) => s.id === "content").items.find((i) => i.id === "read");
  assert.equal(readOff.checked, false);
}
