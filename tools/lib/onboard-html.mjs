import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env.mjs";
import { fetchWpMcpAbilities } from "./wp-smoke.mjs";

const READ_PATTERNS = [
  /post/i,
  /page/i,
  /content/i,
  /get-site/i,
  /list.*post/i,
  /read/i,
];
const EDIT_PATTERNS = [/create/i, /update/i, /edit/i, /write/i, /publish/i, /delete/i];
const PLUGIN_LIST_PATTERNS = [/plugin/i, /theme/i, /extension/i];
const PLUGIN_UPDATE_PATTERNS = [/update.*plugin/i, /install.*plugin/i, /upgrade/i, /activate/i];
const ANALYTICS_PATTERNS = [/analytics/i, /ga4/i, /plausible/i, /search.?console/i, /gsc/i];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checkStatus(report, id) {
  return report.checks.find((c) => c.id === id)?.status === "pass";
}

function abilityHaystack(abilities) {
  return abilities
    .map((a) => `${a.name} ${a.label} ${a.description}`.toLowerCase())
    .join(" ");
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function matchesAbilities(abilities, patterns) {
  if (abilities.length === 0) {
    return false;
  }
  return abilities.some((ability) => {
    const blob = `${ability.name} ${ability.label} ${ability.description}`.toLowerCase();
    return matchesAny(blob, patterns);
  });
}

export function deriveCapabilities(report, abilities = []) {
  const connected = checkStatus(report, "wp.mcp_transport") && checkStatus(report, "wp.rest_auth");
  const haystack = abilityHaystack(abilities);

  return {
    connected,
    content: {
      read: connected && (matchesAbilities(abilities, READ_PATTERNS) || checkStatus(report, "wp.rest_auth")),
      edit: connected && matchesAbilities(abilities, EDIT_PATTERNS),
    },
    plugins: {
      list: connected && matchesAbilities(abilities, PLUGIN_LIST_PATTERNS),
      manage: connected && matchesAbilities(abilities, PLUGIN_UPDATE_PATTERNS),
    },
    security: {
      audits: false,
      upcoming: true,
    },
    analytics: {
      web: connected && matchesAny(haystack, ANALYTICS_PATTERNS),
      searchConsole: connected && /search.?console|gsc/i.test(haystack),
    },
  };
}

export async function fetchSiteTitle(workspaceRoot) {
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  const url = env.WP_MCP_URL?.trim();
  if (!url) {
    return null;
  }
  const siteRoot = url.replace(/\/wp-json\/.*$/, "");
  try {
    const res = await fetch(`${siteRoot}/wp-json`, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data?.name ?? null;
  } catch {
    return null;
  }
}

function copyOnboardAssets(workspaceRoot) {
  const entAssets = path.join(workspaceRoot, "ent", "assets");
  const dest = path.join(workspaceRoot, ".ent", "assets");
  for (const file of ["ent.png", "ent-dark.png"]) {
    const src = path.join(entAssets, file);
    if (fs.existsSync(src)) {
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(src, path.join(dest, file));
    }
  }
}

function checkbox(checked) {
  return `<span class="check ${checked ? "check-on" : "check-off"}" aria-hidden="true">${checked ? "✓" : ""}</span>`;
}

function capabilityItem(checked, label, hintHtml = "") {
  const hint = hintHtml ? `<p class="hint">${hintHtml}</p>` : "";
  return `<li class="capability-item">${checkbox(checked)}<div><span class="cap-label">${escapeHtml(label)}</span>${hint}</div></li>`;
}

function setupAlerts(report) {
  const fails = report.checks.filter((c) => c.status === "fail");
  if (fails.length === 0) {
    return "";
  }
  const items = fails
    .map(
      (c) =>
        `<li data-check-id="${escapeHtml(c.id)}"><code>${escapeHtml(c.id)}</code> — ${escapeHtml(c.message)}</li>`
    )
    .join("\n");
  return `<section class="setup card">
    <h2>Complete setup first</h2>
    <p class="lede">Fix these items in Cursor, then re-run <code>node ent/tools/ent.mjs onboard --workspace-root .</code></p>
    <ul class="setup-list">${items}</ul>
  </section>`;
}

function renderAbilitiesList(abilities) {
  if (abilities.length === 0) {
    return `<p class="muted">No public abilities were returned yet. Your site exposes MCP meta-tools; ask your agent to run <code>discover-abilities</code> after you register abilities with <code>meta.mcp.public</code>.</p>`;
  }
  const rows = abilities
    .map(
      (a) =>
        `<article class="ability"><h3>${escapeHtml(a.label || a.name)}</h3><p class="ability-name"><code>${escapeHtml(a.name)}</code></p><p>${escapeHtml(a.description || "No description provided.")}</p></article>`
    )
    .join("\n");
  return `<div class="ability-grid">${rows}</div>`;
}

export async function buildOnboardPageModel(workspaceRoot, report) {
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  const url = env.WP_MCP_URL?.trim();
  const username = env.WP_MCP_USERNAME?.trim();
  const password = env.WP_MCP_PASSWORD?.trim();

  let abilities = [];
  if (checkStatus(report, "wp.mcp_transport") && url && username && password) {
    try {
      const result = await fetchWpMcpAbilities({ url, username, password });
      abilities = result.abilities;
    } catch {
      abilities = [];
    }
  }

  const siteTitle = (await fetchSiteTitle(workspaceRoot)) ?? "your site";
  const mcpCheck = report.checks.find((c) => c.id === "wp.mcp_config");
  const mcpMatch = mcpCheck?.message?.match(/"([^"]+)"/);
  const mcpServerName = mcpMatch?.[1] ?? "wordpress";

  return {
    report,
    siteTitle,
    mcpServerName,
    abilities,
    capabilities: deriveCapabilities(report, abilities),
    ready: report.summary.fail === 0 && report.summary.skip === 0,
  };
}

export function renderOnboardHtml(model) {
  const { report, siteTitle, mcpServerName, abilities, capabilities, ready } = model;

  const editHow = `Register WordPress abilities with <code>meta.mcp.public =&gt; true</code> for actions like <code>create-post</code> and <code>update-post</code>, or ask your agent in Cursor: <em>"Create a draft post titled…"</em> once those abilities exist. <a href="https://github.com/WordPress/mcp-adapter/blob/trunk/docs/guides/creating-abilities.md" rel="noopener">MCP Adapter ability guide</a>`;

  const pluginHow = `Expose plugin and theme management abilities on your site (custom abilities or a provider plugin), then refresh this page after audit. Until then, manage updates in <code>wp-admin</code>.`;

  const securityHow = `Coming soon — Ent will help you schedule security audits and apply fixes from Cursor.`;

  const analyticsHow = `Register analytics abilities (GA4, Plausible, Search Console) with the MCP Adapter, or ask your developer to expose read-only reporting abilities with <code>meta.mcp.public</code>.`;

  const contentSection = `<section class="card">
    <h2>Manage / edit content</h2>
    <ul class="capability-list">
      ${capabilityItem(capabilities.content.read, "Read posts and pages")}
      ${capabilityItem(
        capabilities.content.edit,
        "Edit posts and pages",
        capabilities.content.edit ? "" : editHow
      )}
    </ul>
  </section>`;

  const pluginsSection = `<section class="card">
    <h2>Manage plugin &amp; theme updates</h2>
    <ul class="capability-list">
      ${capabilityItem(capabilities.plugins.list, "See and list plugins and themes")}
      ${capabilityItem(
        capabilities.plugins.manage,
        "Manage plugin and theme updates",
        capabilities.plugins.manage ? "" : pluginHow
      )}
    </ul>
  </section>`;

  const securitySection = `<section class="card">
    <h2>Security</h2>
    <ul class="capability-list">
      ${capabilityItem(false, "Run regular security audits and fixes", securityHow)}
    </ul>
  </section>`;

  const analyticsSection = `<section class="card">
    <h2>Analytics</h2>
    <ul class="capability-list">
      ${capabilityItem(
        capabilities.analytics.web,
        "See web analytics (GA4, Plausible, etc.)",
        capabilities.analytics.web ? "" : analyticsHow
      )}
      ${capabilityItem(
        capabilities.analytics.searchConsole,
        "Search Console",
        capabilities.analytics.searchConsole ? "" : analyticsHow
      )}
    </ul>
  </section>`;

  const abilitiesSection = `<section class="card">
    <h2>All abilities</h2>
    <p class="lede">WordPress abilities your agent can discover on <strong>${escapeHtml(siteTitle)}</strong> via MCP server <code>${escapeHtml(mcpServerName)}</code>.</p>
    ${renderAbilitiesList(abilities)}
  </section>`;

  const welcome = ready
    ? `You're connected. Choose what you want to do with <strong>${escapeHtml(siteTitle)}</strong> from Cursor — here's what's available today.`
    : `Welcome. Finish setup below, then come back to see what you can do with <strong>${escapeHtml(siteTitle)}</strong> from Cursor.`;

  const auditJson = JSON.stringify({
    ent_version: report.ent_version,
    summary: report.summary,
    checks: report.checks.map((c) => ({ id: c.id, profile: c.profile, status: c.status, message: c.message })),
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ent — ${escapeHtml(siteTitle)}</title>
  <style>
    :root {
      --rf-green: #3a5f41;
      --rf-green-deep: #2a4530;
      --rf-cream: #f8f6f1;
      --rf-fruit: #b85c38;
      --rf-fruit-soft: #e8d5cc;
      --rf-text: #2b2b2b;
      --rf-muted: #5c5c5c;
      --rf-card: #ffffff;
      --rf-border: #e4e0d8;
      --rf-shadow: 0 8px 28px rgba(42, 69, 48, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--rf-text);
      background: linear-gradient(180deg, var(--rf-cream) 0%, #f1ede6 100%);
      line-height: 1.55;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }
    .hero {
      text-align: center;
      margin-bottom: 2rem;
    }
    .logo {
      width: 88px;
      height: 88px;
      object-fit: contain;
      margin-bottom: 0.75rem;
    }
    .brand { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; color: var(--rf-green-deep); margin: 0; }
    .tagline { color: var(--rf-muted); margin: 0.35rem 0 1rem; }
    .welcome {
      background: var(--rf-card);
      border: 1px solid var(--rf-border);
      border-left: 4px solid var(--rf-fruit);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      box-shadow: var(--rf-shadow);
      text-align: left;
    }
    .card {
      background: var(--rf-card);
      border: 1px solid var(--rf-border);
      border-radius: 14px;
      padding: 1.25rem 1.35rem;
      margin: 1rem 0;
      box-shadow: var(--rf-shadow);
    }
    .card h2 {
      margin: 0 0 0.75rem;
      font-size: 1.15rem;
      color: var(--rf-green-deep);
    }
    .lede { margin: 0 0 1rem; color: var(--rf-muted); }
    .capability-list { list-style: none; padding: 0; margin: 0; }
    .capability-item {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.65rem 0;
      border-top: 1px solid var(--rf-border);
    }
    .capability-item:first-child { border-top: 0; padding-top: 0; }
    .check {
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 4px;
      border: 2px solid var(--rf-border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
      margin-top: 0.15rem;
    }
    .check-on {
      background: var(--rf-green);
      border-color: var(--rf-green);
      color: #fff;
      font-weight: 700;
    }
    .check-off { background: #fff; }
    .cap-label { font-weight: 600; }
    .hint {
      margin: 0.35rem 0 0;
      font-size: 0.92rem;
      color: var(--rf-muted);
    }
    .hint a { color: var(--rf-fruit); }
    .setup { border-left: 4px solid var(--rf-fruit); }
    .setup-list { margin: 0; padding-left: 1.2rem; }
    .setup-list li { margin: 0.4rem 0; }
    .ability-grid { display: grid; gap: 0.75rem; }
    .ability {
      border: 1px solid var(--rf-border);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      background: var(--rf-cream);
    }
    .ability h3 { margin: 0 0 0.25rem; font-size: 1rem; color: var(--rf-green-deep); }
    .ability-name { margin: 0 0 0.35rem; font-size: 0.85rem; }
    .muted { color: var(--rf-muted); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.88em;
      background: #efeae2;
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    footer {
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--rf-border);
      text-align: center;
      font-size: 0.92rem;
      color: var(--rf-muted);
    }
    footer a { color: var(--rf-green); font-weight: 600; text-decoration: none; }
    footer a:hover { color: var(--rf-fruit); }
    @media (prefers-color-scheme: dark) {
      :root {
        --rf-cream: #1a1f1c;
        --rf-card: #232925;
        --rf-text: #ece8e1;
        --rf-muted: #b5b0a8;
        --rf-border: #3a433d;
        --rf-green: #6fa878;
        --rf-green-deep: #9fd4a8;
        --rf-fruit: #e09874;
      }
      body { background: linear-gradient(180deg, #141816 0%, #1a1f1c 100%); }
      .logo-light { display: none; }
      .logo-dark { display: inline; }
      code { background: #2f3631; }
      .ability { background: #1a1f1c; }
    }
    .logo-dark { display: none; }
  </style>
</head>
<body>
  <div class="page">
    <header class="hero">
      <picture>
        <source srcset="assets/ent-dark.png" media="(prefers-color-scheme: dark)" />
        <img class="logo logo-light" src="assets/ent.png" alt="Ent" width="88" height="88" />
      </picture>
      <img class="logo logo-dark" src="assets/ent-dark.png" alt="Ent" width="88" height="88" />
      <h1 class="brand">Ent</h1>
      <p class="tagline">Agent ops for your WordPress site</p>
      <div class="welcome"><p>${welcome}</p></div>
    </header>

    ${setupAlerts(report)}

    ${contentSection}
    ${pluginsSection}
    ${securitySection}
    ${analyticsSection}
    ${abilitiesSection}

    <footer>
      A <a href="https://rootsandfruit.com" rel="noopener">Roots &amp; Fruit</a> project
    </footer>
  </div>
  <script type="application/json" id="ent-audit-data">${auditJson}</script>
</body>
</html>
`;
}

export async function writeOnboardHtml(workspaceRoot, report) {
  copyOnboardAssets(workspaceRoot);
  const model = await buildOnboardPageModel(workspaceRoot, report);
  const html = renderOnboardHtml(model);
  const outPath = path.join(workspaceRoot, ".ent", "onboard.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");
  return outPath;
}
