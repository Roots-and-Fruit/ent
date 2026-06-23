/**
 * Ent onboard UI components — HTML builders using ent-* design system classes only.
 * Docs: agent-adapters/shared/onboard/DESIGN.md
 * CSS:  agent-adapters/shared/onboard/onboard.css
 *
 * Rules for agents:
 * - Never emit style attributes on HTML elements.
 * - Add new patterns here (or extend onboard.css), not ad-hoc markup in onboard-html.mjs.
 */
import { ICONS } from "./onboard-icons.mjs";

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pass / pending status circle. */
export function entStatus(checked, { small = false } = {}) {
  const classes = ["ent-status", checked ? "ent-status--pass" : "ent-status--pending"];
  if (small) {
    classes.push("ent-status--sm");
  }
  if (checked) {
    return `<span class="${classes.join(" ")}" aria-hidden="true">${ICONS.check}</span>`;
  }
  return `<span class="${classes.join(" ")}" aria-hidden="true"></span>`;
}

export function entIconBox(iconKey) {
  return `<span class="ent-icon-box">${ICONS[iconKey] ?? ICONS.spark}</span>`;
}

export function entSectionHead({ eyebrow, title, lede, icon }) {
  return `<div class="ent-section-head">
    ${entIconBox(icon)}
    <div>
      ${eyebrow ? `<p class="ent-eyebrow">${escapeHtml(eyebrow)}</p>` : ""}
      <h2 class="ent-title-lg">${escapeHtml(title)}</h2>
      ${lede ? `<p class="ent-lede">${lede}</p>` : ""}
    </div>
  </div>`;
}

export function entSiteHeader() {
  return `<header class="ent-site-header">
  <div>
    <div class="ent-brand-row">
      <img class="ent-logo" src="assets/ent.png" alt="Ent" width="56" height="56" />
      <h1 class="ent-brand">Ent</h1>
    </div>
    <p class="ent-tagline">Your knowledgeable agent for your WordPress site</p>
  </div>
</header>`;
}

export function entHero({ eyebrow, headline, ledeHtml, statsHtml = "" }) {
  return `<section class="ent-hero">
    <p class="ent-eyebrow">${escapeHtml(eyebrow)}</p>
    <h2 class="ent-title-xl">${escapeHtml(headline)}</h2>
    <p class="ent-lede">${ledeHtml}</p>
    ${statsHtml ? `<div class="ent-stat-row">${statsHtml}</div>` : ""}
  </section>`;
}

export function entStatPill(variant, iconHtml, label) {
  return `<span class="ent-stat ent-stat--${variant}">${iconHtml} ${escapeHtml(label)}</span>`;
}

export function entCard({ sectionId, sectionHeadHtml, bodyHtml, extraClass = "" }) {
  const cls = ["ent-card", extraClass].filter(Boolean).join(" ");
  const dataId = sectionId ? ` data-section-id="${escapeHtml(sectionId)}"` : "";
  return `<section class="${cls}"${dataId}>
    ${sectionHeadHtml}
    ${bodyHtml}
  </section>`;
}

export function entCalloutWarn(id, message) {
  return `<div class="ent-callout ent-callout--warn"><strong>${escapeHtml(id)}</strong> — ${escapeHtml(message)}</div>`;
}

export function entCalloutPrompt(label, hint) {
  return `<div class="ent-callout ent-callout--prompt">
    <p class="ent-callout__label">${escapeHtml(label)}</p>
    <p class="ent-hint"><strong>Copy into Cursor chat:</strong> ${escapeHtml(hint)}</p>
  </div>`;
}

export function entListItem({ checked, label, hint = "", hintLink = null, kind = "item" }) {
  let hintText = hint;
  if (hintLink && hintText && kind !== "agent_prompt") {
    hintText = `${hintText} <a href="${escapeHtml(hintLink)}" rel="noopener">Learn more</a>`;
  }
  const hintHtml = hintText
    ? kind === "agent_prompt"
      ? `<p class="ent-hint"><strong>Copy into Cursor chat:</strong> ${escapeHtml(hintText)}</p>`
      : `<p class="ent-hint">${hintText}</p>`
    : "";

  const classes = ["ent-list-item"];
  if (kind === "agent_prompt") {
    classes.push("ent-list-item--prompt");
  }

  return `<li class="${classes.join(" ")}" data-item-kind="${escapeHtml(kind)}">${entStatus(checked)}<div><span class="ent-list-label">${escapeHtml(label)}</span>${hintHtml}</div></li>`;
}

export function entList(itemsHtml) {
  return `<ul class="ent-list">${itemsHtml}</ul>`;
}

export function entMcpTask(item) {
  const hint = item.hint ?? "";
  const hintHtml = hint ? `<p class="ent-hint">${escapeHtml(hint)}</p>` : "";
  return `<li class="ent-mcp__task" data-item-kind="${escapeHtml(item.kind ?? "check")}">
    ${entStatus(item.checked, { small: true })}
    <div>
      <span class="ent-mcp__task-label">${escapeHtml(item.label)}</span>
      ${hintHtml}
    </div>
  </li>`;
}

export function entMcpGroup(group) {
  const tasks = group.children.map((item) => entMcpTask(item)).join("\n");
  const prompt = group.agentPrompt
    ? entCalloutPrompt(group.agentPrompt.label, group.agentPrompt.hint)
    : "";
  return `<section class="ent-mcp" data-mcp-id="${escapeHtml(group.id)}">
    <header class="ent-mcp__head">
      ${entStatus(group.checked)}
      <div>
        <h3 class="ent-title-md">${escapeHtml(group.label)}</h3>
        <p class="ent-mcp__lede">${escapeHtml(group.description)}</p>
      </div>
    </header>
    <ul class="ent-mcp__tasks">
      ${tasks}
    </ul>
    ${prompt}
  </section>`;
}

export function entMcpStack(groups) {
  const html = groups.map((g) => entMcpGroup(g)).join("\n");
  return `<div class="ent-mcp-stack">${html}</div>`;
}

export function entAbilityTile(ability, badgeClass, badgeLabel) {
  const err = ability.error ? `<p class="ent-hint">${escapeHtml(ability.error)}</p>` : "";
  return `<article class="ent-tile">
      <h3 class="ent-tile__head">${escapeHtml(ability.label || ability.name)} <span class="ent-badge ent-badge--${badgeClass}">${badgeLabel}</span></h3>
      <p class="ent-tile__slug"><code>${escapeHtml(ability.name)}</code></p>
      <p class="ent-tile__body">${escapeHtml(ability.description || "No description provided.")}</p>
      ${err}
    </article>`;
}

export function entAbilityGroup(title, abilities, badgeClass, badgeLabel) {
  if (abilities.length === 0) {
    return "";
  }
  const rows = abilities.map((a) => entAbilityTile(a, badgeClass, badgeLabel)).join("\n");
  return `<h3 class="ent-subheading">${escapeHtml(title)}</h3><div class="ent-grid-2 ent-grid-2--wide">${rows}</div>`;
}

export function entFooter(creditHtml) {
  return `<footer class="ent-footer">${creditHtml}</footer>`;
}
