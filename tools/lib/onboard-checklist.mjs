import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getEntRoot } from "./manifest.mjs";

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

function matchesAbilityPatterns(abilities, patterns) {
  if (!patterns?.length || abilities.length === 0) {
    return false;
  }
  return abilities.some((ability) => {
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
  const auditOk = audit.length > 0 && audit.some((id) => checkStatus(report, id));
  const abilityOk = patterns.length > 0 && matchesAbilityPatterns(abilities, patterns);
  if (audit.length && patterns.length) {
    return auditOk || abilityOk;
  }
  if (audit.length) {
    return auditOk;
  }
  if (patterns.length) {
    return abilityOk;
  }
  return false;
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

export function resolveChecklistSections(checklist, report, abilities) {
  return checklist.sections.map((section) => {
    if (section.source?.type === "audit_profile") {
      return {
        id: section.id,
        title: section.title,
        items: resolveAuditProfileSection(section, report),
      };
    }
    return {
      id: section.id,
      title: section.title,
      items: resolveItemSection(section, report, abilities),
    };
  });
}
