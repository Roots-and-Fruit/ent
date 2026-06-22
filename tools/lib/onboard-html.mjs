import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env.mjs";
import { getEntRoot } from "./manifest.mjs";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";
import { ICONS, SECTION_META } from "./onboard-icons.mjs";
import { readSiteProfile } from "./site-profile.mjs";
import { fetchWpMcpAbilities } from "./wp-smoke.mjs";

const FOOTER_LINK_FALLBACK =
  '<span class="footer-credit">A <a href="https://rootsandfruit.com" rel="noopener">Roots &amp; Fruit</a> project</span>';

const ONBOARD_CSS_REL = path.join("agent-adapters", "shared", "onboard", "onboard.css");

function minifySvg(svg) {
  return svg
    .trim()
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><");
}

function buildFooterHtml(entRoot) {
  const svgPath = path.join(entRoot, "assets", "R&FIcon.svg");
  if (!fs.existsSync(svgPath)) {
    return FOOTER_LINK_FALLBACK;
  }
  const icon = minifySvg(fs.readFileSync(svgPath, "utf8"))
    .replace("<svg", '<svg class="rf-icon" aria-hidden="true"')
    .replace(/\s(width|height)="[^"]*"/g, "");
  return `<span class="footer-credit">A <a href="https://rootsandfruit.com" rel="noopener">${icon}<span>Roots &amp; Fruit</span></a> project</span>`;
}

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

function resolveOnboardCss(entRoot) {
  const cssPath = path.join(entRoot, ...ONBOARD_CSS_REL.split("/"));
  if (fs.existsSync(cssPath)) {
    return fs.readFileSync(cssPath, "utf8");
  }
  return "";
}

function resolveEntRoot(workspaceRoot) {
  if (fs.existsSync(path.join(workspaceRoot, "ent", "tools", "ent.mjs"))) {
    return path.join(workspaceRoot, "ent");
  }
  return getEntRoot();
}

function copyOnboardAssets(workspaceRoot) {
  const entRoot = resolveEntRoot(workspaceRoot);
  const dest = path.join(workspaceRoot, ".ent", "assets");
  fs.mkdirSync(dest, { recursive: true });

  for (const file of ["ent.png"]) {
    const workspaceSrc = path.join(workspaceRoot, "ent", "assets", file);
    const kitSrc = path.join(entRoot, "assets", file);
    const src = fs.existsSync(workspaceSrc) ? workspaceSrc : kitSrc;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dest, file));
    }
  }

  const css = resolveOnboardCss(entRoot);
  if (css) {
    fs.writeFileSync(path.join(dest, "onboard.css"), css, "utf8");
  }
}

function statusIcon(checked) {
  if (checked) {
    return `<span class="status-icon on" aria-hidden="true">${ICONS.check}</span>`;
  }
  return `<span class="status-icon off" aria-hidden="true"></span>`;
}

function capabilityItem(item) {
  let hint = item.hint ?? "";
  if (item.hintLink && hint && item.kind !== "agent_prompt") {
    hint = `${hint} <a href="${escapeHtml(item.hintLink)}" rel="noopener">Learn more</a>`;
  }
  const hintHtml = hint
    ? item.kind === "agent_prompt"
      ? `<p class="hint agent-prompt"><strong>Copy into Cursor chat:</strong> ${escapeHtml(hint)}</p>`
      : `<p class="hint">${hint}</p>`
    : "";

  const classes = ["capability-item"];
  if (item.kind === "agent_prompt") {
    classes.push("agent-prompt-item");
  }

  const labelClass = "cap-label";
  return `<li class="${classes.join(" ")}" data-item-kind="${escapeHtml(item.kind ?? "item")}">${statusIcon(item.checked)}<div><span class="${labelClass}">${escapeHtml(item.label)}</span>${hintHtml}</div></li>`;
}

function mcpTaskItem(item) {
  const hint = item.hint ?? "";
  const hintHtml = hint ? `<p class="hint">${escapeHtml(hint)}</p>` : "";
  return `<li class="mcp-task" data-item-kind="${escapeHtml(item.kind ?? "check")}">
    ${statusIcon(item.checked)}
    <div>
      <span class="mcp-task-label">${escapeHtml(item.label)}</span>
      ${hintHtml}
    </div>
  </li>`;
}

function renderMcpAgentPrompt(prompt) {
  return `<div class="mcp-agent-prompt">
    <p class="mcp-agent-prompt-label">${escapeHtml(prompt.label)}</p>
    <p class="hint agent-prompt"><strong>Copy into Cursor chat:</strong> ${escapeHtml(prompt.hint)}</p>
  </div>`;
}

function renderMcpGroup(group) {
  const tasks = group.children.map((item) => mcpTaskItem(item)).join("\n");
  const prompt = group.agentPrompt ? renderMcpAgentPrompt(group.agentPrompt) : "";
  return `<section class="mcp-subsection" data-mcp-id="${escapeHtml(group.id)}">
    <header class="mcp-subsection-head">
      ${statusIcon(group.checked)}
      <div>
        <h3 class="mcp-subsection-title">${escapeHtml(group.label)}</h3>
        <p class="mcp-subsection-lede">${escapeHtml(group.description)}</p>
      </div>
    </header>
    <ul class="mcp-task-grid">
      ${tasks}
    </ul>
    ${prompt}
  </section>`;
}

function renderMcpSupportSection(section) {
  const groups = (section.groups ?? []).map((group) => renderMcpGroup(group)).join("\n");
  return `<section class="card mcp-support-card" data-section-id="${escapeHtml(section.id)}">
    ${sectionHead(section.id, section.title)}
    <div class="mcp-groups">
      ${groups}
    </div>
  </section>`;
}

function heroSection(siteTitle, ready, abilities) {
  const discovered = abilities.length;
  const locked = abilities.filter((a) => a.executable === false).length;
  const unlockCount = locked > 0 ? locked : abilities.filter((a) => a.executable !== true).length;

  const eyebrow = ready ? "Welcome aboard" : "Getting started";
  const headline = ready ? "Let's plant some roots." : "Almost there.";
  const lede = ready
    ? `You're connected to <strong>${escapeHtml(siteTitle)}</strong> from Cursor. Review MCP Support below and open this page anytime at <code>.ent/onboard.html</code>.`
    : `Finish the short setup below, then come back to discover everything you can do with <strong>${escapeHtml(siteTitle)}</strong> right from Cursor. Each step unlocks a new ability.`;

  const pills = [];
  if (discovered > 0) {
    pills.push(
      `<span class="stat-pill sage">${ICONS.check} ${discovered} abilities discovered</span>`
    );
  }
  if (unlockCount > 0) {
    pills.push(
      `<span class="stat-pill primary">${ICONS.sparkles} ${unlockCount} more to unlock</span>`
    );
  }

  return `<section class="hero-card">
    <p class="eyebrow">${eyebrow}</p>
    <h2>${headline}</h2>
    <p class="lede">${lede}</p>
    ${pills.length ? `<div class="stat-pills">${pills.join("")}</div>` : ""}
  </section>`;
}

function setupSection(report) {
  const fails = report.checks.filter((c) => c.status === "fail");
  if (fails.length === 0) {
    return "";
  }

  const meta = SECTION_META.setup;
  const items = fails
    .map(
      (c) =>
        `<div class="alert-box"><strong>${escapeHtml(c.id)}</strong> — ${escapeHtml(c.message)}</div>`
    )
    .join("\n");

  return `<section class="card">
    <div class="section-head">
      <span class="icon-box">${ICONS[meta.icon]}</span>
      <div>
        <p class="eyebrow">${meta.eyebrow}</p>
        <h2>Complete setup first</h2>
        <p class="lede">${meta.lede} Re-run <code>node ent/tools/ent.mjs onboard --workspace-root .</code></p>
      </div>
    </div>
    ${items}
  </section>`;
}

function sectionHead(sectionId, title, customLede = null) {
  const meta = SECTION_META[sectionId] ?? { eyebrow: "", icon: "spark", lede: "" };
  const lede = customLede ?? meta.lede ?? "";
  return `<div class="section-head">
    <span class="icon-box">${ICONS[meta.icon] ?? ICONS.spark}</span>
    <div>
      ${meta.eyebrow ? `<p class="eyebrow">${escapeHtml(meta.eyebrow)}</p>` : ""}
      <h2>${escapeHtml(title)}</h2>
      ${lede ? `<p class="lede">${lede}</p>` : ""}
    </div>
  </div>`;
}

function renderChecklistSections(sections) {
  return sections
    .map((section) => {
      if (section.id === "mcp_support" && section.groups?.length) {
        return renderMcpSupportSection(section);
      }
      const items = section.items.map((item) => capabilityItem(item)).join("\n");
      return `<section class="card" data-section-id="${escapeHtml(section.id)}">
    ${sectionHead(section.id, section.title)}
    <ul class="capability-list">
      ${items}
    </ul>
  </section>`;
    })
    .join("\n");
}

function renderAbilitiesList(abilities) {
  if (abilities.length === 0) {
    return `<p class="muted">No public abilities were returned yet. Register abilities with <code>meta.mcp.public</code> on your site, then re-run onboard.</p>`;
  }

  const usable = abilities.filter((a) => a.executable === true);
  const blocked = abilities.filter((a) => a.executable === false);
  const unknown = abilities.filter((a) => a.executable == null);

  const renderCard = (ability, badgeClass, badgeLabel) => {
    const err = ability.error ? `<p class="hint">${escapeHtml(ability.error)}</p>` : "";
    return `<article class="ability-card">
      <h3>${escapeHtml(ability.label || ability.name)} <span class="badge ${badgeClass}">${badgeLabel}</span></h3>
      <p class="ability-name"><code>${escapeHtml(ability.name)}</code></p>
      <p>${escapeHtml(ability.description || "No description provided.")}</p>
      ${err}
    </article>`;
  };

  const renderGroup = (title, list, badgeClass, badgeLabel) => {
    if (list.length === 0) {
      return "";
    }
    const rows = list.map((a) => renderCard(a, badgeClass, badgeLabel)).join("\n");
    return `<h3 class="ability-group-title">${escapeHtml(title)}</h3><div class="ability-grid">${rows}</div>`;
  };

  return [
    renderGroup("Ready to use", usable, "ready", "Ready"),
    renderGroup("Waiting to be unlocked", blocked, "locked", "Locked"),
    renderGroup("Status unknown", unknown, "locked", "Unknown"),
  ]
    .filter(Boolean)
    .join("\n");
}

function discoverSection(siteTitle, mcpServerName, abilities) {
  const lede = `Discovered via <strong>${escapeHtml(siteTitle)}</strong> through the <code>${escapeHtml(mcpServerName)}</code> MCP server. Ready abilities are usable by agents today.`;
  return `<section class="card">
    ${sectionHead("discover", "What Ent can do", lede)}
    ${renderAbilitiesList(abilities)}
  </section>`;
}

function siteHeader() {
  return `<header class="site-header">
  <div>
    <div class="brand-row">
      <img class="logo" src="assets/ent.png" alt="Ent" width="56" height="56" />
      <h1 class="brand">Ent</h1>
    </div>
    <p class="tagline">Your knowledgeable agent for your WordPress site</p>
  </div>
</header>`;
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
  const mcpServerName = profile?.mcp?.server_name ?? mcpMatch?.[1] ?? "wordpress";

  return {
    report,
    siteTitle,
    mcpServerName,
    abilities,
    sections: resolveChecklistSections(checklist, report, abilities, workspaceRoot, profile),
    ready: report.summary.fail === 0 && report.summary.skip === 0,
  };
}

export function renderOnboardHtml(model, options = {}) {
  const { report, siteTitle, mcpServerName, abilities, sections, ready } = model;
  const cssInline = options.cssInline ?? "";
  const footerHtml = options.footerHtml ?? FOOTER_LINK_FALLBACK;

  const auditJson = JSON.stringify({
    ent_version: report.ent_version,
    summary: report.summary,
    checks: report.checks.map((c) => ({ id: c.id, profile: c.profile, status: c.status, message: c.message })),
  });

  const cssBlock = cssInline
    ? `<style>\n${cssInline}\n</style>`
    : `<link rel="stylesheet" href="assets/onboard.css" />`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>Ent — ${escapeHtml(siteTitle)}</title>
  <meta name="description" content="Your Ent onboarding dashboard — MCP support, abilities, and next steps for ${escapeHtml(siteTitle)}." />
  ${cssBlock}
</head>
<body>
  <main class="page">
    ${siteHeader()}

    ${heroSection(siteTitle, ready, abilities)}

    ${setupSection(report)}

    ${renderChecklistSections(sections)}

    ${discoverSection(siteTitle, mcpServerName, abilities)}

    <footer>${footerHtml}</footer>
  </main>
  <script type="application/json" id="ent-audit-data">${auditJson}</script>
</body>
</html>
`;
}

export async function writeOnboardHtml(workspaceRoot, report) {
  copyOnboardAssets(workspaceRoot);
  const model = await buildOnboardPageModel(workspaceRoot, report);
  const entRoot = resolveEntRoot(workspaceRoot);
  const cssInline = resolveOnboardCss(entRoot);
  const footerHtml = buildFooterHtml(entRoot);
  const html = renderOnboardHtml(model, { cssInline, footerHtml });
  const outPath = path.join(workspaceRoot, ".ent", "onboard.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");
  return outPath;
}
