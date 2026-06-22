import fs from "node:fs";
import path from "node:path";

const ABSOLUTE_PATH_PATTERN = /\b[A-Za-z]:\\(?:[^"'`\s\\]|\\(?![nrt]))+/g;
const ABSOLUTE_PATH_SCAN_EXTENSIONS = new Set([".md", ".mdc", ".html", ".yaml", ".yml", ".json", ".txt", ".fragment"]);
const LITERAL_SCAN_EXTENSIONS = new Set([
  ...ABSOLUTE_PATH_SCAN_EXTENSIONS,
  ".mjs",
  ".js",
]);

export function collectFiles(dir, options = {}) {
  const { ignoreDirs = new Set(["node_modules", ".git", ".ent", ".cursor"]), root = dir } = options;
  const results = [];
  if (!fs.existsSync(dir)) {
    return results;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }
      results.push(...collectFiles(full, { ignoreDirs, root }));
      continue;
    }
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (rel === "test/golden/branding-boundary.txt") {
      continue;
    }
    if (rel === "package-lock.json") {
      continue;
    }
    const ext = path.extname(entry.name);
    if (!LITERAL_SCAN_EXTENSIONS.has(ext)) {
      continue;
    }
    results.push(full);
  }
  return results;
}

export function scanAbsolutePaths(content) {
  const matches = [];
  for (const match of content.matchAll(ABSOLUTE_PATH_PATTERN)) {
    matches.push(match[0]);
  }
  return matches;
}

export function scanBrandingBoundary(entRoot, patternsPath) {
  const patterns = fs
    .readFileSync(patternsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const matches = [];
  for (const file of collectFiles(entRoot, { root: entRoot })) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(entRoot, file).split(path.sep).join("/");
    for (const pattern of patterns) {
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        matches.push({ file: rel, pattern });
      }
    }
    if (ABSOLUTE_PATH_SCAN_EXTENSIONS.has(path.extname(file))) {
      for (const absPath of scanAbsolutePaths(content)) {
        matches.push({ file: rel, pattern: `absolute path: ${absPath}` });
      }
    }
  }
  return matches;
}
