import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const CANDIDATE_FILES = [
  path.join("content", "extensions.yaml"),
  path.join(".ent", "extensions.yaml"),
];

export function extensionsPaths(workspaceRoot) {
  return CANDIDATE_FILES.map((rel) => path.join(workspaceRoot, rel));
}

export function loadExtensions(workspaceRoot) {
  for (const filePath of extensionsPaths(workspaceRoot)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const doc = YAML.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(doc?.extensions)) {
        return { path: filePath, extensions: doc.extensions };
      }
    } catch {
      // try next file
    }
  }
  return { path: null, extensions: [] };
}

export function formatExtensionHints(extensionsDoc) {
  const extensions = extensionsDoc?.extensions ?? [];
  if (extensions.length === 0) {
    return "";
  }

  const lines = ["## Extension hints (site-local)", ""];
  for (const ext of extensions) {
    lines.push(`### ${ext.label ?? ext.id}`);
    if (ext.ability_patterns?.length) {
      lines.push(`- Ability patterns: ${ext.ability_patterns.join(", ")}`);
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
