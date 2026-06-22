import assert from "node:assert/strict";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";

export function runOnboardHtmlTest() {
  const checklist = loadOnboardChecklist();
  assert.ok(checklist.sections.some((s) => s.id === "wordpress_mcp"));
  assert.ok(checklist.sections.some((s) => s.id === "registered_abilities"));

  const baseReport = {
    ent_version: "test",
    workspace_root: ".",
    summary: { pass: 12, fail: 0, skip: 0 },
    checks: [
      { id: "wp.env_present", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.env_complete", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.mcp_config", profile: "wordpress_mcp", status: "pass", message: 'MCP server "test" ok' },
      { id: "wp.mcp_launcher", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.rest_auth", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.mcp_transport", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.site_identity", profile: "wordpress_mcp", status: "pass", message: "ok" },
      { id: "wp.abilities_usable", profile: "wordpress_mcp", status: "pass", message: "ok" },
    ],
  };

  const abilities = [
    {
      name: "plugin/create-post",
      label: "Create Post",
      description: "Create a post",
      executable: true,
    },
    {
      name: "plugin/blocked",
      label: "Blocked",
      description: "Blocked ability",
      executable: false,
      error: "permission_denied",
    },
  ];

  const sections = resolveChecklistSections(checklist, baseReport, abilities, "/tmp/workspace");

  const wpSection = sections.find((s) => s.id === "wordpress_mcp");
  assert.equal(wpSection.items.length, 8);
  assert.ok(wpSection.items.every((item) => item.checked));

  const registered = sections.find((s) => s.id === "registered_abilities");
  const create = registered.items.find((i) => i.meta?.ability_name === "plugin/create-post");
  const blocked = registered.items.find((i) => i.meta?.ability_name === "plugin/blocked");
  assert.equal(create.checked, true);
  assert.equal(blocked.checked, false);
  assert.ok(blocked.hint.includes("permission") || blocked.hint.length > 0);
}
