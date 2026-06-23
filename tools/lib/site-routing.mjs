import fs from "node:fs";
import path from "node:path";
import { getEntRoot } from "./manifest.mjs";
import {
  abilityHaystack,
  isAbilityAllowed,
  listExecutableAbilityNames,
  profileHasAbilityPattern,
} from "./site-profile.mjs";
import { formatExtensionHints } from "./extensions.mjs";
import { formatSiteSpecificationsHints, loadSiteSpecifications } from "./site-specifications.mjs";

const STATIC_REL = path.join("agent-adapters", "shared", "site-routing.md");

export function loadSiteRouting(entRoot = getEntRoot()) {
  const routingPath = path.join(entRoot, ...STATIC_REL.split("/"));
  if (!fs.existsSync(routingPath)) {
    return "";
  }
  return fs.readFileSync(routingPath, "utf8").trim();
}

export function formatSiteProfileBlock(profile) {
  if (!profile) {
    return [
      "## Site profile",
      "",
      "- No `.ent/site-profile.json` — run `node ent/tools/ent.mjs audit --workspace-root .` after configuring `.env`.",
    ].join("\n");
  }

  const summary = profile.abilities_summary ?? {};
  const lines = [
    "## Site profile",
    "",
    `- **Site:** ${profile.site?.name ?? "unknown"} — ${profile.site?.url ?? "unknown"}`,
    `- **Host:** ${profile.site?.host ?? "unknown"} (env MCP host: ${profile.mcp?.endpoint_host ?? "unknown"})`,
    `- **Identity OK:** ${profile.checks?.identity_ok ? "yes" : "no"}`,
    `- **REST auth:** ${profile.checks?.rest_ok ? "yes" : "no"}`,
    `- **MCP adapter:** ${profile.checks?.mcp_ok ? "yes" : "no"} (${profile.mcp?.tool_count ?? 0} tools)`,
    `- **MCP server (Cursor):** ${profile.mcp?.server_name ?? "unknown"}`,
    `- **Abilities:** ${summary.discovered ?? 0} discovered, ${summary.executable ?? 0} executable, ${summary.blocked ?? 0} blocked`,
  ];

  const executable = listExecutableAbilityNames(profile).slice(0, 12);
  if (executable.length) {
    lines.push(`- **Executable ability names:** ${executable.join(", ")}`);
  }

  const rest = profile.rest ?? {};
  if (rest.meta_prefixes?.length) {
    lines.push(`- **REST meta prefixes (sample):** ${rest.meta_prefixes.join(", ")}`);
  }
  if (rest.namespaces?.length) {
    lines.push(
      `- **REST namespaces:** ${rest.namespaces.slice(0, 8).join(", ")}${rest.namespaces.length > 8 ? " …" : ""}`
    );
  }
  if (rest.post_types?.length) {
    const totals = rest.post_types
      .filter((t) => t.published_total != null)
      .slice(0, 8)
      .map((t) => `${t.slug}=${t.published_total}`)
      .join(", ");
    if (totals) {
      lines.push(`- **REST published totals:** ${totals}${rest.post_types.length > 8 ? " …" : ""}`);
    }
    const slugs = rest.post_types
      .slice(0, 10)
      .map((t) => t.slug)
      .join(", ");
    lines.push(`- **REST post types:** ${slugs}${rest.post_types.length > 10 ? " …" : ""}`);
  }

  lines.push(`- **Probed:** ${profile.probed_at ?? "unknown"}`);

  return lines.join("\n");
}

export function formatRoutingSummary() {
  return [
    "## Agent routing (Ent)",
    "",
    "- **REST** for core WordPress when no executable MCP ability applies (`checks.rest_ok` required).",
    "- **Inventory/count/list** — read site profile + site-specifications first; use REST or `ent wp get` headers; do not call `discover-abilities`.",
    "- **MCP execute-ability** only for abilities with `executable: true` in site profile.",
    "- **Extension tasks** require a matching executable ability — do not brute-force plugin APIs.",
    "- Profile `needs_input` abilities are parametric — not permission failures.",
    "- Full policy: `ent/agent-adapters/shared/site-routing.md`",
  ].join("\n");
}

export function formatSessionExtensionHints(workspaceRoot) {
  return formatExtensionHints(loadExtensions(workspaceRoot));
}

export function formatSessionSiteSpecificationsHints(workspaceRoot) {
  return formatSiteSpecificationsHints(loadSiteSpecifications(workspaceRoot));
}

function extractAbilityName(toolInput) {
  const input = toolInput ?? {};
  const candidates = [input.ability_name, input.ability, input.name, input.arguments?.ability_name];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function buildMcpGuardMessage(profile, toolName = "", toolInput = {}) {
  const base = "Ent MCP: follow site profile and routing policy in session preload.";

  if (!profile) {
    return `${base} No site profile — run ent audit before MCP tasks.`;
  }

  if (!profile.checks?.identity_ok) {
    return `${base} Site identity mismatch — fix WP_MCP_URL in .env before using MCP.`;
  }

  if (!profile.checks?.mcp_ok) {
    return `${base} MCP Adapter not available on this site — use REST only or fix onboard.`;
  }

  const tool = String(toolName).toLowerCase();
  if (/execute-ability|execute_ability/.test(tool)) {
    const abilityName = extractAbilityName(toolInput);
    if (abilityName && !isAbilityAllowed(profile, abilityName)) {
      const match = (profile.abilities ?? []).find((a) => a.name === abilityName);
      if (!match) {
        return `${base} Ability "${abilityName}" is not in site profile.`;
      }
      return `${base} Ability "${abilityName}" is not executable (${match.error_code ?? "blocked"}).`;
    }
    return `${base} Only execute abilities marked executable in .ent/site-profile.json.`;
  }

  return profile.mcp?.server_name
    ? `${base} Use MCP server "${profile.mcp.server_name}" for this workspace.`
    : base;
}

export { abilityHaystack, profileHasAbilityPattern };
