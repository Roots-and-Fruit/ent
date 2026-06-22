import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env.mjs";
import { getEntRoot } from "./manifest.mjs";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";
import { readSiteProfile } from "./site-profile.mjs";
import { fetchWpMcpAbilities } from "./wp-smoke.mjs";

const FOOTER_HTML =
  'A <a href="https://rootsandfruit.com" rel="noopener">Roots &amp; Fruit</a> project';

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

function capabilityItem(item) {
  let hint = item.hint ?? "";
  if (item.hintLink && hint) {
    hint = `${hint} <a href="${escapeHtml(item.hintLink)}" rel="noopener">Ability guide</a>`;
  }
  const hintHtml = hint ? `<p class="hint">${hint}</p>` : "";
  return `<li class="capability-item">${checkbox(item.checked)}<div><span class="cap-label">${escapeHtml(item.label)}</span>${hintHtml}</div></li>`;
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
    return `<p class="muted">No public abilities were returned yet. Register abilities with <code>meta.mcp.public</code> on your site, then re-run onboard.</p>`;
  }

  const usable = abilities.filter((a) => a.executable === true);
  const blocked = abilities.filter((a) => a.executable === false);
  const unknown = abilities.filter((a) => a.executable == null);

  const renderGroup = (title, list, badge) => {
    if (list.length === 0) {
      return "";
    }
    const rows = list
      .map((a) => {
        const err = a.error ? `<p class="hint">${escapeHtml(a.error)}</p>` : "";
        return `<article class="ability"><h3>${escapeHtml(a.label || a.name)} <span class="badge">${badge}</span></h3><p class="ability-name"><code>${escapeHtml(a.name)}</code></p><p>${escapeHtml(a.description || "No description provided.")}</p>${err}</article>`;
      })
      .join("\n");
    return `<h3 class="ability-group">${escapeHtml(title)}</h3><div class="ability-grid">${rows}</div>`;
  };

  return [
    renderGroup("Executable", usable, "ok"),
    renderGroup("Discovered but blocked", blocked, "blocked"),
    renderGroup("Status unknown", unknown, "unknown"),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderChecklistSections(sections) {
  return sections
    .map((section) => {
      const items = section.items.map((item) => capabilityItem(item)).join("\n");
      return `<section class="card" data-section-id="${escapeHtml(section.id)}">
    <h2>${escapeHtml(section.title)}</h2>
    <ul class="capability-list">
      ${items}
    </ul>
  </section>`;
    })
    .join("\n");
}

export async function buildOnboardPageModel(workspaceRoot, report) {
  const entRoot = path.join(workspaceRoot, "ent");
  const checklist = loadOnboardChecklist(
    fs.existsSync(path.join(entRoot, "onboard-checklist.yaml")) ? entRoot : getEntRoot()
  );

  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  const url = env.WP_MCP_URL?.trim();
  const username = env.WP_MCP_USERNAME?.trim();
  const password = env.WP_MCP_PASSWORD?.trim();

  const profile = readSiteProfile(workspaceRoot);
  let abilities = profile?.abilities ?? [];
  if (abilities.length === 0 && checkStatus(report, "wp.mcp_transport") && url && username && password) {
    try {
      const result = await fetchWpMcpAbilities({ url, username, password });
      abilities = result.abilities;
    } catch {
      abilities = [];
    }
  }

  const siteTitle = profile?.site?.name ?? (await fetchSiteTitle(workspaceRoot)) ?? "your site";
  const mcpCheck = report.checks.find((c) => c.id === "wp.mcp_config");
  const mcpMatch = mcpCheck?.message?.match(/"([^"]+)"/);
  const mcpServerName = mcpMatch?.[1] ?? "wordpress";

  return {
    report,
    siteTitle,
    mcpServerName,
    abilities,
    sections: resolveChecklistSections(checklist, report, abilities, workspaceRoot),
    ready: report.summary.fail === 0 && report.summary.skip === 0,
  };
}

export function renderOnboardHtml(model) {
  const { report, siteTitle, mcpServerName, abilities, sections, ready } = model;

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
      --ent-bg: #f6f7f5;
      --ent-bg-end: #eef1ec;
      --ent-surface: #ffffff;
      --ent-text: #1e1e1e;
      --ent-muted: #5a5a5a;
      --ent-border: #e0e4dc;
      --ent-accent: #3d6b4f;
      --ent-accent-deep: #2d503c;
      --ent-highlight: #4a6fa5;
      --ent-shadow: 0 8px 28px rgba(30, 30, 30, 0.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      color: var(--ent-text);
      background: linear-gradient(180deg, var(--ent-bg) 0%, var(--ent-bg-end) 100%);
      line-height: 1.55;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 2.5rem 1.5rem 3rem; }
    .hero { text-align: center; margin-bottom: 2rem; }
    .logo { width: 88px; height: 88px; object-fit: contain; margin-bottom: 0.75rem; }
    .brand { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; color: var(--ent-accent-deep); margin: 0; }
    .tagline { color: var(--ent-muted); margin: 0.35rem 0 1rem; }
    .welcome {
      background: var(--ent-surface);
      border: 1px solid var(--ent-border);
      border-left: 4px solid var(--ent-highlight);
      border-radius: 12px;
      padding: 1rem 1.25rem;
      box-shadow: var(--ent-shadow);
      text-align: left;
    }
    .card {
      background: var(--ent-surface);
      border: 1px solid var(--ent-border);
      border-radius: 14px;
      padding: 1.25rem 1.35rem;
      margin: 1rem 0;
      box-shadow: var(--ent-shadow);
    }
    .card h2 { margin: 0 0 0.75rem; font-size: 1.15rem; color: var(--ent-accent-deep); }
    .lede { margin: 0 0 1rem; color: var(--ent-muted); }
    .capability-list { list-style: none; padding: 0; margin: 0; }
    .capability-item {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
      padding: 0.65rem 0;
      border-top: 1px solid var(--ent-border);
    }
    .capability-item:first-child { border-top: 0; padding-top: 0; }
    .check {
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 4px;
      border: 2px solid var(--ent-border);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
      margin-top: 0.15rem;
    }
    .check-on { background: var(--ent-accent); border-color: var(--ent-accent); color: #fff; font-weight: 700; }
    .check-off { background: #fff; }
    .cap-label { font-weight: 600; }
    .hint { margin: 0.35rem 0 0; font-size: 0.92rem; color: var(--ent-muted); }
    .hint a { color: var(--ent-highlight); }
    .setup { border-left: 4px solid var(--ent-highlight); }
    .setup-list { margin: 0; padding-left: 1.2rem; }
    .setup-list li { margin: 0.4rem 0; }
    .ability-grid { display: grid; gap: 0.75rem; }
    .ability {
      border: 1px solid var(--ent-border);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      background: var(--ent-bg);
    }
    .ability h3 { margin: 0 0 0.25rem; font-size: 1rem; color: var(--ent-accent-deep); }
    .ability-group { font-size: 0.95rem; margin: 1rem 0 0.5rem; color: var(--ent-muted); }
    .badge { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ent-muted); }
    .ability-name { margin: 0 0 0.35rem; font-size: 0.85rem; }
    .muted { color: var(--ent-muted); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.88em;
      background: #e8ebe6;
      padding: 0.1em 0.35em;
      border-radius: 4px;
    }
    footer {
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--ent-border);
      text-align: center;
      font-size: 0.92rem;
      color: var(--ent-muted);
    }
    footer a { color: var(--ent-accent); font-weight: 600; text-decoration: none; }
    footer a:hover { color: var(--ent-highlight); }
    @media (prefers-color-scheme: dark) {
      :root {
        --ent-bg: #141816;
        --ent-bg-end: #1a1f1c;
        --ent-surface: #232925;
        --ent-text: #ece8e1;
        --ent-muted: #b5b0a8;
        --ent-border: #3a433d;
        --ent-accent: #6fa878;
        --ent-accent-deep: #9fd4a8;
        --ent-highlight: #8ab4e8;
      }
      .logo-light { display: none; }
      .logo-dark { display: inline; }
      code { background: #2f3631; }
      .ability { background: #1a1f1c; }
      .check-off { background: var(--ent-surface); }
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

    ${renderChecklistSections(sections)}

    <section class="card">
      <h2>MCP abilities</h2>
      <p class="lede">Discovered on <strong>${escapeHtml(siteTitle)}</strong> via MCP server <code>${escapeHtml(mcpServerName)}</code>. Only <strong>executable</strong> abilities are usable by agents.</p>
      ${renderAbilitiesList(abilities)}
    </section>

    <footer>${FOOTER_HTML}</footer>
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
