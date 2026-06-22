import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { formatRoutingSummary, formatSiteProfileBlock } from "./site-snapshot.mjs";

const STATIC_REL = path.join("agent-adapters", "shared", "preload", "ent-session-context.md");
const CONTEXT_FILE = path.join(".ent", "session-context.md");
const DEV_ROOTS_MANIFEST = "ent-dev-roots.json";

export function isConsumerRoot(root) {
  return fs.existsSync(path.join(root, "ent", "tools", "ent.mjs"));
}

export function isKitRoot(root) {
  return fs.existsSync(path.join(root, "tools", "ent.mjs")) && !isConsumerRoot(root);
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readDevRootsManifest(searchDirs) {
  for (const dir of searchDirs) {
    const manifest = readJsonFile(path.join(dir, ".cursor", DEV_ROOTS_MANIFEST));
    if (manifest?.consumerRoot && manifest?.kitRoot) {
      return manifest;
    }
  }
  return null;
}

function parseCodeWorkspaceFolders(kitRoot) {
  const wsFile = path.join(kitRoot, "ent-dev.code-workspace");
  if (!fs.existsSync(wsFile)) {
    return [];
  }
  try {
    const ws = JSON.parse(fs.readFileSync(wsFile, "utf8"));
    return (ws.folders ?? []).map((folder) => path.resolve(kitRoot, folder.path));
  } catch {
    return [];
  }
}

function findKitRootNear(dir) {
  let current = path.resolve(dir);
  for (let depth = 0; depth < 6; depth++) {
    if (isKitRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

export function discoverWorkspaceRoots(fallbackDir, hookRoots = []) {
  const fallback = path.resolve(fallbackDir ?? process.cwd());
  const roots = new Set();

  for (const root of hookRoots) {
    roots.add(path.resolve(root));
  }
  roots.add(fallback);

  const kitFromFallback = isKitRoot(fallback) ? fallback : findKitRootNear(fallback);
  if (kitFromFallback) {
    roots.add(kitFromFallback);
    for (const folder of parseCodeWorkspaceFolders(kitFromFallback)) {
      roots.add(folder);
    }
  }

  const manifest = readDevRootsManifest([...roots, fallback, path.dirname(fallback)]);
  if (manifest) {
    roots.add(path.resolve(manifest.kitRoot));
    roots.add(path.resolve(manifest.consumerRoot));
  }

  const rootList = [...roots];
  const kitRoot =
    (manifest?.kitRoot && isKitRoot(manifest.kitRoot) ? path.resolve(manifest.kitRoot) : null) ??
    rootList.find(isKitRoot) ??
    null;
  const consumerRoot =
    (manifest?.consumerRoot && isConsumerRoot(manifest.consumerRoot)
      ? path.resolve(manifest.consumerRoot)
      : null) ?? rootList.find(isConsumerRoot) ?? null;

  return { roots: rootList, manifest, kitRoot, consumerRoot };
}

export function resolvePreloadRoot(discovered) {
  if (discovered.consumerRoot) {
    return discovered.consumerRoot;
  }
  for (const root of discovered.roots) {
    if (isConsumerRoot(root)) {
      return root;
    }
  }
  for (const root of discovered.roots) {
    if (isKitRoot(root)) {
      return root;
    }
  }
  return discovered.roots[0] ?? process.cwd();
}

function openModeLabel(openMode) {
  if (openMode === "workspace") {
    return "consumer root — start here for audit, onboard, MCP";
  }
  if (openMode === "multi-root-dev") {
    return "ent-dev.code-workspace — consumer for ops, kit for product edits";
  }
  if (openMode === "ent-only") {
    return "kit repo only — pair with a consumer fixture for gates";
  }
  return "unknown";
}

function resolveOpenMode(preloadRoot, kitRoot, consumerRoot) {
  if (kitRoot && consumerRoot) {
    return "multi-root-dev";
  }
  if (isConsumerRoot(preloadRoot)) {
    return "workspace";
  }
  if (isKitRoot(preloadRoot)) {
    return "ent-only";
  }
  return "unknown";
}

export function resolveProjectContext(projectDir) {
  const root = path.resolve(projectDir);
  const entInWorkspace = path.join(root, "ent", "tools", "ent.mjs");
  const entKitOnly = path.join(root, "tools", "ent.mjs");

  let entCoreDir = null;

  if (fs.existsSync(entInWorkspace)) {
    entCoreDir = path.join(root, "ent");
  } else if (fs.existsSync(entKitOnly)) {
    entCoreDir = root;
  }

  return {
    projectDir: root,
    entCoreDir,
    mcpConfigActive: path.join(root, ".cursor", "mcp.json"),
  };
}

function entVersion(entCoreDir) {
  if (!entCoreDir || !fs.existsSync(path.join(entCoreDir, ".git"))) {
    return "unknown";
  }
  try {
    return execSync("git rev-parse --short HEAD", { cwd: entCoreDir, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function auditLines(projectDir) {
  const audit = readJsonFile(path.join(projectDir, ".ent", "audit.json"));
  if (!audit?.summary) {
    return ["- Audit: not run — `node ent/tools/ent.mjs audit --workspace-root .` (from consumer root)"];
  }
  const { pass, fail, skip } = audit.summary;
  const lines = [`- Audit: pass ${pass}, fail ${fail}, skip ${skip}`];
  if (audit.checks?.length) {
    for (const c of audit.checks) {
      if (c.status === "fail" || c.status === "skip") {
        lines.push(`  - \`${c.id}\`: ${c.status} — ${c.message}`);
      }
    }
  }
  return lines;
}

function onboardLine(projectDir) {
  const state = readJsonFile(path.join(projectDir, ".ent", "state.json"));
  if (state?.onboarded) {
    return `- Onboard: complete (ent ${state.ent_commit ?? "?"})`;
  }
  return "- Onboard: incomplete — run `/ent-onboard` from consumer root";
}

function readStaticBlock(entCoreDir) {
  if (!entCoreDir) {
    return "";
  }
  const staticPath = path.join(entCoreDir, ...STATIC_REL.split("/"));
  if (!fs.existsSync(staticPath)) {
    return "";
  }
  return fs.readFileSync(staticPath, "utf8").trim();
}

function siteProfileLines(projectDir) {
  const profile = readJsonFile(path.join(projectDir, ".ent", "site-profile.json"));
  return [formatSiteProfileBlock(profile), formatRoutingSummary()];
}

function workStartBlock(openMode, kitRoot, consumerRoot, preloadRoot) {
  const lines = ["## Where to start this session", ""];

  if (openMode === "multi-root-dev" && kitRoot && consumerRoot) {
    lines.push(
      `- **Start consumer work here:** \`${consumerRoot}\` — audit, onboard, MCP, \`.env\`, \`content/\`, \`.ent/\``,
      `- **Edit kit here:** \`${kitRoot}\` — manifest, CLI, adapters; then \`node tools/ent.mjs sync --workspace-root ../Ent-workspace-test\``,
      ""
    );
    return lines.join("\n");
  }

  if (isConsumerRoot(preloadRoot)) {
    lines.push(`- **Workspace root:** \`${preloadRoot}\` — all consumer ops run here`, "");
    return lines.join("\n");
  }

  if (isKitRoot(preloadRoot)) {
    lines.push(
      `- **Kit repo:** \`${preloadRoot}\` — product edits only`,
      "- Pair with a consumer workspace for audit, onboard, and MCP",
      ""
    );
    return lines.join("\n");
  }

  lines.push(`- **Workspace:** \`${preloadRoot}\``, "");
  return lines.join("\n");
}

export function buildSessionPreload(fallbackDir, options = {}) {
  const { workspaceRoots } = options;
  const discovered = discoverWorkspaceRoots(fallbackDir, workspaceRoots ?? []);
  const preloadRoot = resolvePreloadRoot(discovered);
  const ctx = resolveProjectContext(preloadRoot);
  const kitRoot = discovered.kitRoot;
  const consumerRoot = discovered.consumerRoot;
  const openMode = resolveOpenMode(preloadRoot, kitRoot, consumerRoot);

  const staticEntCore = kitRoot ?? ctx.entCoreDir;
  const staticBlock = readStaticBlock(staticEntCore);
  const versionDir = kitRoot ?? ctx.entCoreDir;
  const generatedAt = new Date().toISOString();
  const startBlock = workStartBlock(openMode, kitRoot, consumerRoot, preloadRoot);

  const dynamicBlock = [
    "## Workspace snapshot (generated)",
    "",
    `- Generated: ${generatedAt}`,
    `- Consumer root: \`${consumerRoot ?? (isConsumerRoot(preloadRoot) ? preloadRoot : "none")}\``,
    ...(kitRoot ? [`- Kit root: \`${kitRoot}\``] : []),
    `- Open mode: \`${openMode}\` (${openModeLabel(openMode)})`,
    `- Ent commit (kit): \`${entVersion(versionDir)}\``,
    onboardLine(isConsumerRoot(preloadRoot) ? preloadRoot : consumerRoot ?? preloadRoot),
    ...auditLines(isConsumerRoot(preloadRoot) ? preloadRoot : consumerRoot ?? preloadRoot),
    "",
    startBlock.trimEnd(),
  ].join("\n");

  const auditRoot = consumerRoot ?? (isConsumerRoot(preloadRoot) ? preloadRoot : preloadRoot);
  const profileRoot = isConsumerRoot(auditRoot) ? auditRoot : consumerRoot ?? auditRoot;
  const siteBlocks = isConsumerRoot(profileRoot) ? siteProfileLines(profileRoot) : [];

  const sessionContextBody = [dynamicBlock, ...siteBlocks, staticBlock].filter(Boolean).join("\n\n");
  const contextFilePath = path.join(
    isConsumerRoot(auditRoot) ? auditRoot : preloadRoot,
    ...CONTEXT_FILE.split("/")
  );

  const additionalContext = [
    "# Ent session preload",
    "",
    dynamicBlock.trim(),
    "",
    ...(siteBlocks.length ? [...siteBlocks, ""] : []),
    "Full extension map: `.ent/session-context.md` on the consumer root.",
    "Invariants: `.cursor/rules/00-ent-preload.mdc` on the consumer root.",
  ].join("\n");

  return {
    ...ctx,
    projectDir: isConsumerRoot(auditRoot) ? auditRoot : preloadRoot,
    openMode,
    kitRoot,
    consumerRoot,
    contextFilePath,
    sessionContextBody,
    additionalContext,
    env: {
      ENT_WORKSPACE_ROOT: consumerRoot ?? preloadRoot,
      ENT_CONSUMER_ROOT: consumerRoot ?? "",
      ENT_KIT_ROOT: kitRoot ?? ctx.entCoreDir ?? preloadRoot,
      ENT_CORE_DIR: ctx.entCoreDir ?? kitRoot ?? preloadRoot,
      ENT_WORKSPACE_OPEN_MODE: openMode,
      ENT_MCP_CONFIG_ACTIVE: consumerRoot
        ? path.join(consumerRoot, ".cursor", "mcp.json")
        : ctx.mcpConfigActive,
      ENT_SESSION_PRELOAD_DONE: "1",
    },
  };
}

export function writeSessionContextFile(preload) {
  fs.mkdirSync(path.dirname(preload.contextFilePath), { recursive: true });
  fs.writeFileSync(preload.contextFilePath, `${preload.sessionContextBody.trim()}\n`, "utf8");
  return preload.contextFilePath;
}
