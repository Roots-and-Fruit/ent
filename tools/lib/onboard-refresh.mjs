import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parseEnvFile } from "./env.mjs";
import { runAudit, writeAuditReport, writeStateJson } from "./audit.mjs";
import { writeOnboardHtml } from "./onboard-html.mjs";

/** Relative paths whose changes invalidate onboard.html (deterministic fingerprint). */
export const ONBOARD_INPUT_REL_PATHS = [
  ".env",
  ".cursor/mcp.json",
  "content/extensions.yaml",
  "content/site-specifications.yaml",
  "content/site-specifications.md",
  "content/specifications.md",
  "ent/onboard-checklist.yaml",
  "ent/mcp-support-catalog.yaml",
  "ent/agent-adapters/shared/onboard/onboard.css",
  "ent/tools/lib/onboard-html.mjs",
  "ent/tools/lib/onboard-ui.mjs",
  "ent/tools/lib/onboard-icons.mjs",
  "ent/tools/lib/onboard-refresh.mjs",
  "ent/tools/lib/mcp-support.mjs",
  "ent/tools/lib/onboard-checklist.mjs",
];

const DEBOUNCE_MS = 2000;
const META_REL = ".ent/onboard-meta.json";

function entHead(entDir) {
  if (!fs.existsSync(path.join(entDir, ".git"))) {
    return "no-git";
  }
  try {
    return execSync("git rev-parse --short HEAD", { cwd: entDir, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function maxMtimeMs(dir) {
  let max = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      max = Math.max(max, maxMtimeMs(full));
    } else if (entry.isFile()) {
      max = Math.max(max, fs.statSync(full).mtimeMs);
    }
  }
  return max;
}

function pathStatToken(workspaceRoot, rel) {
  const full = path.join(workspaceRoot, rel);
  if (!fs.existsSync(full)) {
    return `${rel}:missing`;
  }
  const st = fs.statSync(full);
  if (st.isDirectory()) {
    return `${rel}:${maxMtimeMs(full)}`;
  }
  return `${rel}:${st.mtimeMs}`;
}

export function computeOnboardInputsFingerprint(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const lines = ONBOARD_INPUT_REL_PATHS.map((rel) => pathStatToken(root, rel));
  lines.push(pathStatToken(root, "content/specs"));
  lines.push(`ent_head:${entHead(path.join(root, "ent"))}`);
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

export function isRefreshDisabled(workspaceRoot) {
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  const flag = env.ENT_ONBOARD_REFRESH?.trim().toLowerCase();
  return flag === "0" || flag === "false" || flag === "off";
}

export function isEnvComplete(workspaceRoot) {
  const env = parseEnvFile(path.join(workspaceRoot, ".env"));
  return Boolean(
    env.WP_MCP_URL?.trim() && env.WP_MCP_USERNAME?.trim() && env.WP_MCP_PASSWORD?.trim()
  );
}

export function readOnboardMeta(workspaceRoot) {
  const metaPath = path.join(workspaceRoot, META_REL);
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

export function writeOnboardMeta(workspaceRoot, meta) {
  const metaPath = path.join(workspaceRoot, META_REL);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
  return metaPath;
}

export function isOnboardDashboardStale(workspaceRoot) {
  const root = path.resolve(workspaceRoot);
  const htmlPath = path.join(root, ".ent", "onboard.html");
  const auditPath = path.join(root, ".ent", "audit.json");

  if (!fs.existsSync(htmlPath)) {
    return { stale: true, reason: "missing-onboard-html" };
  }
  if (!fs.existsSync(auditPath)) {
    return { stale: true, reason: "missing-audit-json" };
  }

  const meta = readOnboardMeta(root);
  if (!meta?.inputs_fingerprint) {
    return { stale: true, reason: "missing-meta" };
  }

  const current = computeOnboardInputsFingerprint(root);
  if (current !== meta.inputs_fingerprint) {
    return {
      stale: true,
      reason: "inputs-changed",
      current,
      stored: meta.inputs_fingerprint,
    };
  }

  return { stale: false, reason: "fresh" };
}

export function isRefreshDebounced(workspaceRoot) {
  const meta = readOnboardMeta(workspaceRoot);
  if (!meta?.generated_at) {
    return false;
  }
  const elapsed = Date.now() - new Date(meta.generated_at).getTime();
  return elapsed >= 0 && elapsed < DEBOUNCE_MS;
}

/**
 * Refresh audit.json, site-profile (when live), onboard.html, and onboard-meta.json.
 * Skips work when fresh unless force/renderOnly. Never affects agent preload tokens.
 */
export async function refreshOnboardDashboard(workspaceRoot, options = {}) {
  const root = path.resolve(workspaceRoot);
  const {
    reason = "manual",
    force = false,
    renderOnly = false,
    live = undefined,
  } = options;

  if (!renderOnly && isRefreshDisabled(root)) {
    return { skipped: true, skip_reason: "disabled", exitCode: 0 };
  }

  if (!force && !renderOnly) {
    const stale = isOnboardDashboardStale(root);
    if (!stale.stale) {
      return {
        skipped: true,
        skip_reason: "fresh",
        meta: readOnboardMeta(root),
        exitCode: 0,
      };
    }
  }

  if (!renderOnly && isRefreshDebounced(root)) {
    return {
      skipped: true,
      skip_reason: "debounced",
      meta: readOnboardMeta(root),
      exitCode: 0,
    };
  }

  const liveAudit = live ?? (renderOnly ? false : isEnvComplete(root));
  let report;
  let statePath = null;

  if (renderOnly) {
    const auditPath = path.join(root, ".ent", "audit.json");
    if (!fs.existsSync(auditPath)) {
      throw new Error("Missing .ent/audit.json — run audit first");
    }
    report = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  } else {
    report = await runAudit(root, { live: liveAudit });
    writeAuditReport(root, report);
    if (report.summary.fail === 0 && report.summary.skip === 0) {
      statePath = writeStateJson(root, report);
    }
  }

  const htmlPath = await writeOnboardHtml(root, report);
  const meta = {
    generated_at: new Date().toISOString(),
    reason,
    live: liveAudit,
    render_only: renderOnly,
    summary: report.summary,
    inputs_fingerprint: computeOnboardInputsFingerprint(root),
  };
  writeOnboardMeta(root, meta);

  const exitCode = report.summary.fail > 0 || report.summary.skip > 0 ? 1 : 0;
  return {
    skipped: false,
    report,
    htmlPath,
    statePath,
    meta,
    exitCode,
  };
}

export async function refreshIfStale(workspaceRoot, options = {}) {
  return refreshOnboardDashboard(workspaceRoot, { ...options, force: false });
}

/** Match hook file paths to onboard input watchers (normalized relative POSIX paths). */
export function isWatchedOnboardInput(workspaceRoot, filePath) {
  const root = path.resolve(workspaceRoot);
  const abs = path.resolve(filePath);
  let rel = path.relative(root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return false;
  }

  if (ONBOARD_INPUT_REL_PATHS.includes(rel)) {
    return true;
  }

  if (rel === "content/specs" || rel.startsWith("content/specs/")) {
    return true;
  }

  return false;
}
