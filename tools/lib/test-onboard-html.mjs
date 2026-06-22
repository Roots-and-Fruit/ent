import assert from "node:assert/strict";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";
import { probeMcpSupport } from "./mcp-support.mjs";

export function runOnboardHtmlTest() {
  const checklist = loadOnboardChecklist();
  assert.ok(checklist.sections.some((s) => s.id === "mcp_support"));
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
  ];

  const sections = resolveChecklistSections(checklist, baseReport, abilities, "/tmp/workspace", {
    rest: { namespaces: [] },
  });

  const mcp = sections.find((s) => s.id === "mcp_support");
  assert.ok(mcp.items.some((i) => i.kind === "group_header" && i.label === "WordPress MCP"));
  assert.ok(mcp.items.some((i) => i.kind === "group_header" && i.label.includes("Blocks MCP")));
  assert.ok(mcp.items.some((i) => i.kind === "agent_prompt"));

  const groups = probeMcpSupport("/tmp/workspace", baseReport, { rest: { namespaces: [] } });
  assert.equal(groups.length, 3);
}
