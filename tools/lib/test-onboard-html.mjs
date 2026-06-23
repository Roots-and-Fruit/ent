import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";
import { buildOnboardPageModel, renderOnboardHtml } from "./onboard-html.mjs";
import { probeMcpSupport } from "./mcp-support.mjs";

const ENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runOnboardHtmlTest() {
  const checklist = loadOnboardChecklist();
  assert.ok(checklist.sections.some((s) => s.id === "mcp_support"));
  assert.ok(checklist.sections.some((s) => s.id === "content_models"));

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
  assert.equal(mcp.groups.length, 3);
  assert.ok(mcp.groups.some((g) => g.label === "WordPress MCP"));
  assert.ok(mcp.groups.some((g) => g.label.includes("Blocks MCP")));
  assert.ok(mcp.groups.some((g) => g.agentPrompt));

  const groups = probeMcpSupport("/tmp/workspace", baseReport, { rest: { namespaces: [] } });
  assert.equal(groups.length, 3);

  const designDoc = path.join(ENT_ROOT, "agent-adapters", "shared", "onboard", "DESIGN.md");
  assert.ok(readFileSync(designDoc, "utf8").includes("ent-"));

  const model = {
    report: baseReport,
    siteTitle: "Test Site",
    mcpServerName: "test",
    abilities,
    sections,
    ready: true,
  };
  const css = readFileSync(path.join(ENT_ROOT, "agent-adapters", "shared", "onboard", "onboard.css"), "utf8");
  const html = renderOnboardHtml(model, { cssInline: css, footerHtml: '<span class="ent-footer__credit">test</span>' });

  assert.ok(!/<[a-z][^>]*\sstyle="/i.test(html), "onboard.html must not use inline style attributes");
  assert.ok(html.includes('class="ent-page"'), "onboard.html must use ent-page layout");
  assert.ok(html.includes('class="ent-mcp"'), "onboard.html must use ent-mcp groups");
  assert.ok(!html.includes('class="page"'), "legacy page class must not appear");
  assert.ok(!html.includes('class="hero-card"'), "legacy hero-card class must not appear");
}
