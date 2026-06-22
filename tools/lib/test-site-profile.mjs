import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  envFingerprint,
  profileHasAbilityPattern,
  readSiteProfile,
  writeSiteProfile,
} from "./site-profile.mjs";
import { formatRoutingSummary, formatSiteProfileBlock } from "./site-routing.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ent-site-profile-"));
}

export async function runSiteProfileTest(entRoot, workspaceRoot) {
  const root = workspaceRoot ?? tempDir();
  const entDir = path.join(root, ".ent");
  fs.mkdirSync(entDir, { recursive: true });

  const profile = {
    probed_at: new Date().toISOString(),
    env_fingerprint: "abc123",
    site: { name: "Test Site", url: "https://example.com", host: "example.com" },
    mcp: {
      endpoint: "https://example.com/wp-json/mcp/mcp-adapter-default-server",
      endpoint_host: "example.com",
      server_name: "example-com",
      adapter_ok: true,
      tool_count: 2,
      tools: ["discover-abilities", "execute-ability"],
    },
    abilities: [{ name: "get-posts", label: "Get posts", description: "Read posts" }],
    checks: { identity_ok: true, rest_ok: true, mcp_ok: true },
  };

  writeSiteProfile(root, profile);
  const roundTrip = readSiteProfile(root);
  if (roundTrip?.site?.host !== "example.com") {
    throw new Error("readSiteProfile round-trip failed");
  }

  const block = formatSiteProfileBlock(profile);
  if (!block.includes("example.com") || !block.includes("Identity OK:** yes")) {
    throw new Error("formatSiteProfileBlock missing expected fields");
  }

  const routing = formatRoutingSummary();
  if (!routing.includes("execute-ability")) {
    throw new Error("formatRoutingSummary missing routing rules");
  }

  if (!profileHasAbilityPattern(profile, ["post"])) {
    throw new Error("profileHasAbilityPattern should match get-posts");
  }

  const fp = envFingerprint({ WP_MCP_URL: "https://a.com/mcp", WP_MCP_USERNAME: "u" });
  if (fp.length !== 16) {
    throw new Error("envFingerprint should be 16 hex chars");
  }

  const routingDoc = path.join(entRoot, "agent-adapters", "shared", "site-routing.md");
  if (!fs.existsSync(routingDoc)) {
    throw new Error("Missing site-routing.md policy doc");
  }
}
