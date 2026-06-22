function abilityHaystack(abilities) {
  return (abilities ?? [])
    .map((a) => `${a.name} ${a.label} ${a.description}`.toLowerCase())
    .join(" ");
}

function extractAbilityName(toolInput) {
  const input = toolInput ?? {};
  const candidates = [
    input.ability_name,
    input.ability,
    input.name,
    input.arguments?.ability_name,
    input.parameters?.ability_name,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
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
    `- **MCP server (Cursor):** ${profile.mcp?.server_name ?? "unknown"} — use this server only for this workspace`,
    `- **Abilities:** ${summary.discovered ?? 0} discovered, ${summary.executable ?? 0} executable, ${summary.blocked ?? 0} blocked`,
  ];

  if (profile.abilities?.length) {
    const executable = profile.abilities
      .filter((a) => a.executable === true)
      .slice(0, 12)
      .map((a) => a.name)
      .join(", ");
    if (executable) {
      lines.push(`- **Executable ability names:** ${executable}`);
    }
  }

  const rest = profile.rest ?? {};
  if (rest.meta_prefixes?.length) {
    lines.push(`- **REST meta prefixes (sample):** ${rest.meta_prefixes.join(", ")}`);
  }
  if (rest.namespaces?.length) {
    lines.push(`- **REST namespaces:** ${rest.namespaces.slice(0, 8).join(", ")}${rest.namespaces.length > 8 ? " …" : ""}`);
  }

  lines.push(`- **Probed:** ${profile.probed_at ?? "unknown"}`);

  return lines.join("\n");
}

export function formatRoutingSummary() {
  return [
    "## Agent routing (Ent)",
    "",
    "- **REST** (`/wp-json/wp/v2/...`) for core WordPress when no executable MCP ability applies (`checks.rest_ok` required).",
    "- **MCP execute-ability** only for abilities with `executable: true` in site profile (`checks.mcp_ok` required).",
    "- **Extension tasks** need a matching executable ability — do not brute-force plugin REST namespaces or wp-admin.",
    "- After one REST sample read, stop if the profile shows no executable ability for the task.",
    "- CLI: `node ent/tools/ent.mjs wp get --path /wp/v2/posts --query 'per_page=1'`",
    "- Full policy: `ent/agent-adapters/shared/site-routing.md`",
  ].join("\n");
}

export function formatExtensionHintsBlock(extensionsDoc) {
  const extensions = extensionsDoc?.extensions ?? [];
  if (extensions.length === 0) {
    return "";
  }

  const lines = ["## Extension hints (site-local)", ""];
  for (const ext of extensions) {
    lines.push(`### ${ext.label ?? ext.id}`);
    if (ext.ability_patterns?.length) {
      lines.push(`- Patterns: ${ext.ability_patterns.join(", ")}`);
    }
    for (const hint of ext.agent_hints ?? []) {
      lines.push(`- ${hint}`);
    }
    for (const hint of ext.rest_hints ?? []) {
      lines.push(`- REST: ${hint}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
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
    if (abilityName) {
      const match = (profile.abilities ?? []).find((a) => a.name === abilityName);
      if (!match) {
        return `${base} Ability "${abilityName}" is not listed in .ent/site-profile.json — do not execute.`;
      }
      if (match.executable === false) {
        return `${base} Ability "${abilityName}" is discovered but blocked (${match.error_code ?? "not executable"}).`;
      }
    }
    return `${base} Only execute abilities marked executable in .ent/site-profile.json.`;
  }

  if (profile.mcp?.server_name) {
    return `${base} Use MCP server "${profile.mcp.server_name}" for this workspace.`;
  }

  return base;
}
