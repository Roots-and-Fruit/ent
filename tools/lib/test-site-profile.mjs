import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  envFingerprint,
  isAbilityAllowed,
  profileHasAbilityPattern,
  readSiteProfile,
  writeSiteProfile,
} from "./site-profile.mjs";
import { formatRoutingSummary, formatSiteProfileBlock } from "./site-routing.mjs";
import { loadExtensions } from "./extensions.mjs";
import { loadSiteSpecifications } from "./site-specifications.mjs";
import { countAbilitySummary } from "./ability-smoke.mjs";

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
    abilities: [
      { name: "get-posts", label: "Get posts", description: "Read posts", executable: true },
      {
        name: "seo/get-score",
        label: "SEO",
        description: "SEO score",
        executable: false,
        error_code: "permission_denied",
      },
    ],
    abilities_summary: { discovered: 2, executable: 1, blocked: 1, unknown: 0 },
    rest: {
      post_meta_keys_sample: ["_yoast_wpseo_focuskw"],
      meta_prefixes: ["_yoast_"],
      namespaces: ["yoast/v1"],
      namespace_probes: [],
      post_types: [{ slug: "podcast", rest_base: "podcast", published_total: 137 }],
    },
    checks: { identity_ok: true, rest_ok: true, mcp_ok: true, abilities_usable: false },
  };

  writeSiteProfile(root, profile);
  const roundTrip = readSiteProfile(root);
  if (roundTrip?.site?.host !== "example.com") {
    throw new Error("readSiteProfile round-trip failed");
  }

  const block = formatSiteProfileBlock(profile);
  if (!block.includes("example.com") || !block.includes("1 executable")) {
    throw new Error("formatSiteProfileBlock missing expected fields");
  }
  if (!block.includes("podcast=137")) {
    throw new Error("formatSiteProfileBlock should include REST post type totals");
  }

  const routing = formatRoutingSummary();
  if (!routing.includes("executable")) {
    throw new Error("formatRoutingSummary missing routing rules");
  }

  if (!profileHasAbilityPattern(profile, ["post"])) {
    throw new Error("profileHasAbilityPattern should match get-posts");
  }

  if (!isAbilityAllowed(profile, "get-posts")) {
    throw new Error("isAbilityAllowed should allow executable ability");
  }

  if (isAbilityAllowed(profile, "seo/get-score")) {
    throw new Error("isAbilityAllowed should block non-executable ability");
  }

  const fp = envFingerprint({ WP_MCP_URL: "https://a.com/mcp", WP_MCP_USERNAME: "u" });
  if (fp.length !== 16) {
    throw new Error("envFingerprint should be 16 hex chars");
  }

  const summary = countAbilitySummary(profile.abilities);
  if (summary.executable !== 1 || summary.blocked !== 1) {
    throw new Error("countAbilitySummary mismatch");
  }

  const routingDoc = path.join(entRoot, "agent-adapters", "shared", "site-routing.md");
  if (!fs.existsSync(routingDoc)) {
    throw new Error("Missing site-routing.md policy doc");
  }

  const extensionsExample = path.join(entRoot, "content", "extensions.yaml.example");
  if (!fs.existsSync(extensionsExample)) {
    throw new Error("Missing content/extensions.yaml.example");
  }

  const siteSpecExample = path.join(entRoot, "content", "site-specifications.yaml.example");
  if (!fs.existsSync(siteSpecExample)) {
    throw new Error("Missing content/site-specifications.yaml.example");
  }

  const loaded = loadExtensions(root);
  if (loaded.extensions.length !== 0) {
    throw new Error("expected no extensions in empty workspace");
  }

  const specs = loadSiteSpecifications(root);
  if (specs.path != null) {
    throw new Error("expected no site specifications in empty workspace");
  }
}
