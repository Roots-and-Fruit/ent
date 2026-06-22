function abilityHaystack(abilities) {
  return (abilities ?? [])
    .map((a) => `${a.name} ${a.label} ${a.description}`.toLowerCase())
    .join(" ");
}

export function formatSiteProfileBlock(profile) {
  if (!profile) {
    return [
      "## Site profile",
      "",
      "- No `.ent/site-profile.json` — run `node ent/tools/ent.mjs audit --workspace-root .` after configuring `.env`.",
    ].join("\n");
  }

  const lines = [
    "## Site profile",
    "",
    `- **Site:** ${profile.site?.name ?? "unknown"} — ${profile.site?.url ?? "unknown"}`,
    `- **Host:** ${profile.site?.host ?? "unknown"} (env MCP host: ${profile.mcp?.endpoint_host ?? "unknown"})`,
    `- **Identity OK:** ${profile.checks?.identity_ok ? "yes" : "no"}`,
    `- **REST auth:** ${profile.checks?.rest_ok ? "yes" : "no"}`,
    `- **MCP adapter:** ${profile.checks?.mcp_ok ? "yes" : "no"} (${profile.mcp?.tool_count ?? 0} tools)`,
    `- **MCP server (Cursor):** ${profile.mcp?.server_name ?? "unknown"}`,
    `- **Public abilities:** ${profile.abilities?.length ?? 0}`,
  ];

  if (profile.abilities?.length) {
    const names = profile.abilities
      .slice(0, 12)
      .map((a) => a.name)
      .join(", ");
    const more = profile.abilities.length > 12 ? ` (+${profile.abilities.length - 12} more)` : "";
    lines.push(`- **Ability names:** ${names}${more}`);
  }

  const haystack = abilityHaystack(profile.abilities);
  lines.push(
    `- **Note:** ${
      /yoast|seo-score|rank-math|seo/.test(haystack)
        ? "SEO/Yoast-like abilities present"
        : "no SEO/Yoast abilities in profile"
    }`
  );
  lines.push(`- **Probed:** ${profile.probed_at ?? "unknown"}`);

  return lines.join("\n");
}

export function formatRoutingSummary() {
  return [
    "## Agent routing (Ent)",
    "",
    "- **REST** for core WP resources when no listed MCP ability applies (`checks.rest_ok` required).",
    "- **MCP execute-ability** only for abilities in site profile (`checks.mcp_ok` required).",
    "- **Do not** use MCP for plugin/SEO/analytics tasks unless a matching ability is listed.",
    "- Full policy: `ent/agent-adapters/shared/site-routing.md`",
  ].join("\n");
}

function profileHasAbilityPattern(profile, patterns) {
  const haystack = abilityHaystack(profile?.abilities);
  if (!haystack) {
    return false;
  }
  return patterns.some((p) => haystack.includes(String(p).toLowerCase()));
}

export function buildMcpGuardMessage(profile, toolName = "", toolInput = {}) {
  const base = "Ent MCP: follow site profile and routing policy in session preload.";
  const inputBlob = JSON.stringify(toolInput ?? {}).toLowerCase();

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
  const pluginTask = /yoast|seo|analytics|ga4|plausible|search.?console|plugin|theme|rank.?math/i.test(
    `${tool} ${inputBlob}`
  );

  if (/execute-ability|execute_ability/.test(tool)) {
    if (pluginTask && !profileHasAbilityPattern(profile, ["yoast", "seo", "analytics", "search-console", "gsc"])) {
      return `${base} This site has no matching ability in profile for that plugin task — do not guess.`;
    }
    return `${base} Only execute abilities listed in .ent/site-profile.json.`;
  }

  return base;
}
