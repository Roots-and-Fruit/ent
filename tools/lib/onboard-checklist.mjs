import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getEntRoot } from "./manifest.mjs";
import { loadExtensions } from "./extensions.mjs";
import { resolveMcpSupportSection } from "./mcp-support.mjs";

export function loadOnboardChecklist(entRoot = getEntRoot()) {
  const checklistPath = path.join(entRoot, "onboard-checklist.yaml");
  if (!fs.existsSync(checklistPath)) {
    throw new Error(`Missing onboard checklist: ${checklistPath}`);
  }
  const doc = YAML.parse(fs.readFileSync(checklistPath, "utf8"));
  if (!Array.isArray(doc?.sections) || doc.sections.length === 0) {
    throw new Error("onboard-checklist.yaml must define a non-empty sections array");
  }
  return doc;
}

function checkStatus(report, id) {
  return report.checks.find((c) => c.id === id)?.status === "pass";
}

function abilityBlob(ability) {
  return `${ability.name} ${ability.label} ${ability.description}`.toLowerCase();
}

function matchesAbilityPatterns(abilities, patterns, { executableOnly = false } = {}) {
  if (!patterns?.length || abilities.length === 0) {
    return false;
  }
  return abilities.some((ability) => {
    if (executableOnly && ability.executable !== true) {
      return false;
    }
    const blob = abilityBlob(ability);
    return patterns.some((pattern) => blob.includes(String(pattern).toLowerCase()));
  });
}

function matchesPassWhen(passWhen, report, abilities) {
  if (!passWhen) {
    return false;
  }
  const audit = passWhen.any_audit_pass ?? [];
  const patterns = passWhen.any_ability_pattern ?? [];
  const execPatterns = passWhen.any_executable_ability_pattern ?? [];
  const auditOk = audit.length > 0 && audit.some((id) => checkStatus(report, id));
  const abilityOk = patterns.length > 0 && matchesAbilityPatterns(abilities, patterns);
  const execOk =
    execPatterns.length > 0 && matchesAbilityPatterns(abilities, execPatterns, { executableOnly: true });

  const parts = [];
  if (audit.length) {
    parts.push(auditOk);
  }
  if (patterns.length) {
    parts.push(abilityOk);
  }
  if (execPatterns.length) {
    parts.push(execOk);
  }
  if (parts.length === 0) {
    return false;
  }
  return parts.some(Boolean);
}

export function resolveAuditProfileSection(section, report) {
  const profile = section.source?.profile;
  const labels = section.check_labels ?? {};
  const checks = report.checks.filter((c) => c.profile === profile);
  return checks.map((check) => ({
    id: check.id,
    label: labels[check.id] ?? check.message,
    checked: check.status === "pass",
    hint: check.status === "fail" ? check.message : "",
    upcoming: false,
  }));
}

export function resolveSiteProfileAbilitiesSection(section, abilities) {
  if (!abilities?.length) {
    return [
      {
        id: "none",
        label: "No public abilities registered on this site",
        checked: false,
        hint: "Register abilities with meta.mcp.public on your WordPress site, then re-run onboard.",
        hintLink: "https://github.com/WordPress/mcp-adapter/blob/trunk/docs/guides/creating-abilities.md",
        upcoming: false,
      },
    ];
  }

  return abilities.map((ability) => ({
    id: ability.name.replace(/[^\w-]+/g, "-"),
    label: ability.label || ability.name,
    checked: ability.executable === true,
    hint:
      ability.executable === false
        ? ability.error || "Discovered but not executable for the MCP service account"
        : ability.executable == null
          ? "Execute status unknown — re-run audit"
          : "",
    hintLink: null,
    upcoming: false,
    meta: { ability_name: ability.name },
  }));
}

export function resolveExtensionsSection(section, abilities, workspaceRoot) {
  const { extensions } = loadExtensions(workspaceRoot);
  if (extensions.length === 0) {
    return [
      {
        id: "extensions_optional",
        label: "Optional — add content/extensions.yaml for site-specific capability labels",
        checked: false,
        hint: "Copy ent/content/extensions.yaml.example to content/extensions.yaml to define extension groups and agent hints.",
        hintLink: null,
        upcoming: true,
      },
    ];
  }

  return extensions.map((ext) => {
    const patterns = ext.ability_patterns ?? [];
    const checked = matchesAbilityPatterns(abilities, patterns, { executableOnly: true });
    const discoveredOnly =
      !checked && matchesAbilityPatterns(abilities, patterns, { executableOnly: false });
    let hint = ext.hint ?? "";
    if (!checked && discoveredOnly) {
      hint = "Ability discovered but not executable for the MCP service account — check WordPress permissions.";
    } else if (!checked) {
      hint = ext.hint ?? "No matching executable ability on this site yet.";
    }
    return {
      id: ext.id,
      label: ext.label ?? ext.id,
      checked,
      hint: checked ? "" : hint,
      hintLink: ext.hint_link ?? null,
      upcoming: false,
    };
  });
}

export function resolveItemSection(section, report, abilities) {
  return (section.items ?? []).map((item) => {
    if (item.upcoming) {
      return {
        id: item.id,
        label: item.label,
        checked: false,
        hint: item.hint ?? "",
        hintLink: item.hint_link ?? null,
        upcoming: true,
      };
    }
    const checked = matchesPassWhen(item.pass_when, report, abilities);
    return {
      id: item.id,
      label: item.label,
      checked,
      hint: checked ? "" : item.hint ?? "",
      hintLink: checked ? null : item.hint_link ?? null,
      upcoming: false,
    };
  });
}

export function resolveChecklistSections(checklist, report, abilities, workspaceRoot = ".", siteProfile = null) {
  return checklist.sections
    .map((section) => {
      if (section.source?.type === "mcp_support_catalog") {
        return {
          id: section.id,
          title: section.title,
          groups: resolveMcpSupportSection(section, workspaceRoot, report, siteProfile),
          items: [],
        };
      }
      if (section.source?.type === "audit_profile") {
        return {
          id: section.id,
          title: section.title,
          items: resolveAuditProfileSection(section, report),
        };
      }
      if (section.source?.type === "site_profile_abilities") {
        return {
          id: section.id,
          title: section.title,
          items: resolveSiteProfileAbilitiesSection(section, abilities),
        };
      }
      if (section.source?.type === "extensions_file") {
        return {
          id: section.id,
          title: section.title,
          items: resolveExtensionsSection(section, abilities, workspaceRoot),
        };
      }
      return {
        id: section.id,
        title: section.title,
        items: resolveItemSection(section, report, abilities),
      };
    })
    .filter((section) => section.items.length > 0 || (section.groups?.length ?? 0) > 0);
}
