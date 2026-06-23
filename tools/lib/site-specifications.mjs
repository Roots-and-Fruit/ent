import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const CANDIDATE_FILES = [
  path.join("content", "site-specifications.yaml"),
  path.join("content", "site-specifications.md"),
  path.join(".ent", "site-specifications.yaml"),
];

export function siteSpecificationsPaths(workspaceRoot) {
  return CANDIDATE_FILES.map((rel) => path.join(workspaceRoot, rel));
}

export function loadSiteSpecifications(workspaceRoot) {
  for (const filePath of siteSpecificationsPaths(workspaceRoot)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    if (filePath.endsWith(".md")) {
      return { path: filePath, format: "markdown", raw: fs.readFileSync(filePath, "utf8").trim() };
    }
    try {
      const doc = YAML.parse(fs.readFileSync(filePath, "utf8"));
      if (doc && typeof doc === "object") {
        return { path: filePath, format: "yaml", doc };
      }
    } catch {
      // try next file
    }
  }
  return { path: null, format: null, doc: null, raw: null };
}

export function formatSiteSpecificationsHints(specDoc) {
  if (!specDoc?.path) {
    return "";
  }

  if (specDoc.format === "markdown" && specDoc.raw) {
    const excerpt =
      specDoc.raw.length > 1200 ? `${specDoc.raw.slice(0, 1200).trim()}\n\n…` : specDoc.raw;
    return ["## Site specifications (site-local)", "", excerpt].join("\n");
  }

  const doc = specDoc.doc ?? {};
  const lines = ["## Site specifications (site-local)", ""];

  if (doc.site?.label || doc.site?.url) {
    lines.push(
      `- **Site:** ${doc.site.label ?? "unknown"}${doc.site.url ? ` — ${doc.site.url}` : ""}`
    );
  }

  const models = doc.content_models ?? {};
  const modelIds = Object.keys(models);
  if (modelIds.length) {
    lines.push("- **Content models:**");
    for (const id of modelIds) {
      const model = models[id];
      const parts = [
        model.label ?? id,
        model.post_type ? `post_type=\`${model.post_type}\`` : null,
        model.rest_path ? `rest=\`${model.rest_path}\`` : null,
      ].filter(Boolean);
      lines.push(`  - **${id}:** ${parts.join(", ")}`);
      for (const [key, value] of Object.entries(model.filters ?? {})) {
        lines.push(`    - ${key}: ${value}`);
      }
    }
  }

  const definitions = doc.definitions ?? {};
  for (const [key, value] of Object.entries(definitions)) {
    const text = String(value).trim().replace(/\s+/g, " ");
    lines.push(`- **${key}:** ${text}`);
  }

  if (lines.length === 2) {
    return "";
  }

  lines.push(`- **Source:** \`${specDoc.path}\``);
  return lines.join("\n");
}
