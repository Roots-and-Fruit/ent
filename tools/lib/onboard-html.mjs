import fs from "node:fs";
import path from "node:path";
import { parseEnvFile } from "./env.mjs";
import { getEntRoot } from "./manifest.mjs";
import { loadOnboardChecklist, resolveChecklistSections } from "./onboard-checklist.mjs";
import { ICONS, SECTION_META } from "./onboard-icons.mjs";
import {
  entAbilityGroup,
  entCalloutWarn,
  entCard,
  entFooter,
  entHero,
  entList,
  entListItem,
  entMcpStack,
  entSectionHead,
  entSiteHeader,
  entStatPill,
  escapeHtml,
} from "./onboard-ui.mjs";
import { readSiteProfile } from "./site-profile.mjs";
import { fetchWpMcpAbilities } from "./wp-smoke.mjs";

const FOOTER_LINK_FALLBACK =
  '<span class="ent-footer__credit">A <a href="https://rootsandfruit.com" rel="noopener">Roots &amp; Fruit</a> project</span>';

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
    .replace("<svg", '<svg class="ent-footer__icon" aria-hidden="true"')
    .replace(/\s(width|height)="[^"]*"/g, "");
  return `<span class="ent-footer__credit">A <a href="https://rootsandfruit.com" rel="noopener">${icon}<span>Roots &amp; Fruit</span></a> project</span>`;
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

function sectionHeadFromMeta(sectionId, title, customLede = null) {
  const meta = SECTION_META[sectionId] ?? { eyebrow: "", icon: "spark", lede: "" };
  return entSectionHead({
    eyebrow: meta.eyebrow,
    title,
    lede: customLede ?? meta.lede ?? "",
    icon: meta.icon,
  });
}

function heroSection(siteTitle, ready, abilities) {
  const discovered = abilities.length;
  const locked = abilities.filter((a) => a.executable === false).length;
  const unlockCount = locked > 0 ? locked : abilities.filter((a) => a.executable !== true).length;

  const eyebrow = ready ? "Welcome aboard" : "Getting started";
  const headline = ready ? "Let's plant some roots." : "Almost there.";
  const ledeHtml = ready
    ? `You're connected to <strong>${escapeHtml(siteTitle)}</strong> from Cursor. Review MCP Support below and open this page anytime at <code>.ent/onboard.html</code>.`
    : `Finish the short setup below, then come back to discover everything you can do with <strong>${escapeHtml(siteTitle)}</strong> right from Cursor. Each step unlocks a new ability.`;

  const stats = [];
  if (discovered > 0) {
    stats.push(entStatPill("sage", ICONS.check, `${discovered} abilities discovered`));
  }
  if (unlockCount > 0) {
    stats.push(entStatPill("primary", ICONS.sparkles, `${unlockCount} more to unlock`));
  }

  return entHero({
    eyebrow,
    headline,
    ledeHtml,
    statsHtml: stats.join(""),
  });
}

function setupSection(report) {
  const fails = report.checks.filter((c) => c.status === "fail");
  if (fails.length === 0) {
    return "";
  }

  const meta = SECTION_META.setup;
  const alerts = fails.map((c) => entCalloutWarn(c.id, c.message)).join("\n");
  const head = entSectionHead({
    eyebrow: meta.eyebrow,
    title: "Complete setup first",
    lede: `${meta.lede} Re-run <code>node ent/tools/ent.mjs onboard --workspace-root .</code>`,
    icon: meta.icon,
  });

  return entCard({ sectionHeadHtml: head, bodyHtml: alerts });
}

function renderMcpSupportSection(section) {
  const head = sectionHeadFromMeta(section.id, section.title);
  return entCard({
    sectionId: section.id,
    sectionHeadHtml: head,
    bodyHtml: entMcpStack(section.groups ?? []),
  });
}

function renderChecklistSections(sections) {
  return sections
    .map((section) => {
      if (section.id === "mcp_support" && section.groups?.length) {
        return renderMcpSupportSection(section);
      }
      const items = section.items
        .map((item) =>
          entListItem({
            checked: item.checked,
            label: item.label,
            hint: item.hint,
            hintLink: item.hintLink,
            kind: item.kind,
          })
        )
        .join("\n");
      return entCard({
        sectionId: section.id,
        sectionHeadHtml: sectionHeadFromMeta(section.id, section.title),
        bodyHtml: entList(items),
      });
    })
    .join("\n");
}

function renderAbilitiesList(abilities) {
  if (abilities.length === 0) {
    return `<p class="ent-muted">No public abilities were returned yet. Register abilities with <code>meta.mcp.public</code> on your site, then re-run onboard.</p>`;
  }

  const usable = abilities.filter((a) => a.executable === true);
  const blocked = abilities.filter((a) => a.executable === false);
  const unknown = abilities.filter((a) => a.executable == null);

  return [
    entAbilityGroup("Ready to use", usable, "ready", "Ready"),
    entAbilityGroup("Waiting to be unlocked", blocked, "locked", "Locked"),
    entAbilityGroup("Status unknown", unknown, "locked", "Unknown"),
  ]
    .filter(Boolean)
    .join("\n");
}

function discoverSection(siteTitle, mcpServerName, abilities) {
  const lede = `Discovered via <strong>${escapeHtml(siteTitle)}</strong> through the <code>${escapeHtml(mcpServerName)}</code> MCP server. Ready abilities are usable by agents today.`;
  return entCard({
    sectionHeadHtml: sectionHeadFromMeta("discover", "What Ent can do", lede),
    bodyHtml: renderAbilitiesList(abilities),
  });
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
  <main class="ent-page">
    ${entSiteHeader()}

    ${heroSection(siteTitle, ready, abilities)}

    ${setupSection(report)}

    ${renderChecklistSections(sections)}

    ${discoverSection(siteTitle, mcpServerName, abilities)}

    ${entFooter(footerHtml)}
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
