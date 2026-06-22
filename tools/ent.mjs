#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { getEntRoot, loadManifest, validateManifest } from "./lib/manifest.mjs";
import { scanBrandingBoundary } from "./lib/branding.mjs";
import { syncWorkspace, assertEntPristine } from "./lib/sync.mjs";
import { runSyncTest } from "./lib/test-sync.mjs";
import { runNegativeAuditTest } from "./lib/test-negative-audit.mjs";
import { scaffoldWorkspace } from "./lib/scaffold.mjs";
import { runScaffoldTest } from "./lib/test-scaffold.mjs";
import { runMcpConfigTest } from "./lib/test-mcp-config.mjs";
import { runOnboardLogTest } from "./lib/test-onboard.mjs";
import { runOffboardTest } from "./lib/test-offboard.mjs";
import { runOnboard } from "./lib/onboard.mjs";
import { runOffboard } from "./lib/offboard.mjs";
import { runAudit, writeAuditReport, writeOnboardHtml, writeStateJson } from "./lib/audit.mjs";

function usage() {
  console.log(`Ent kit CLI

Usage:
  node tools/ent.mjs validate-manifest
  node tools/ent.mjs sync --workspace-root <path> [--agent cursor|claude-code|all]
  node tools/ent.mjs audit --workspace-root <path>
  node tools/ent.mjs onboard --workspace-root <path> [--log] [--verbose]
  node tools/ent.mjs offboard --workspace-root <path> [--dry-run] [--clear-audit] [--clear-env] [--remove-projected] [--remove-kit] [--keep-mcp] [--keep-state]
  node tools/ent.mjs render-onboard --workspace-root <path>
  node tools/ent.mjs scaffold --workspace-root <path>
  node tools/ent.mjs test <suite> --workspace-root <path>

Suites: branding-boundary, kit-runtime-boundary, mcp-config, onboard, offboard, sync, negative-audit, scaffold
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--workspace-root") {
      args.workspaceRoot = argv[++i];
    } else if (token === "--agent") {
      args.agent = argv[++i];
    } else if (token === "--env-file") {
      args.envFile = argv[++i];
    } else if (token.startsWith("--")) {
      args[token.slice(2)] = argv[++i] ?? true;
    } else {
      args._.push(token);
    }
  }
  return args;
}

async function cmdValidateManifest() {
  const manifest = loadManifest(getEntRoot());
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error("Manifest validation failed:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log(`OK  ent.manifest.yaml v${manifest.version}`);
  console.log(`    core_checks: ${manifest.core_checks.length}`);
  console.log(`    profiles: ${Object.keys(manifest.profiles).join(", ")}`);
  process.exit(0);
}

async function cmdTestBrandingBoundary() {
  const entRoot = getEntRoot();
  const patternsPath = path.join(entRoot, "test", "golden", "branding-boundary.txt");
  const matches = scanBrandingBoundary(entRoot, patternsPath);
  if (matches.length > 0) {
    console.error("Branding boundary failed:");
    for (const m of matches) {
      console.error(`  - ${m.file} matches ${m.pattern}`);
    }
    process.exit(1);
  }
  console.log("OK  branding boundary");
  process.exit(0);
}

async function cmdTestKitRuntimeBoundary() {
  const toolsDir = path.join(getEntRoot(), "tools");
  let count = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ps1")) {
        count++;
      }
    }
  }
  walk(toolsDir);
  if (count !== 0) {
    console.error(`Kit runtime boundary failed: ${count} .ps1 file(s) under tools/`);
    process.exit(1);
  }
  console.log("OK  kit runtime boundary");
  process.exit(0);
}

async function cmdSync(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("sync requires --workspace-root");
    process.exit(1);
  }
  const agent = args.agent ?? "cursor";
  const entRoot = getEntRoot();
  syncWorkspace(entRoot, workspaceRoot, agent);
  console.log(`OK  synced agent=${agent} workspace=${workspaceRoot}`);
  process.exit(0);
}

async function cmdAudit(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("audit requires --workspace-root");
    process.exit(1);
  }
  const report = await runAudit(workspaceRoot);
  const out = writeAuditReport(workspaceRoot, report);
  console.log(`OK  audit → ${out}`);
  console.log(`    pass=${report.summary.pass} fail=${report.summary.fail} skip=${report.summary.skip}`);
  if (report.summary.fail === 0 && report.summary.skip === 0) {
    const statePath = writeStateJson(workspaceRoot, report);
    console.log(`OK  state → ${statePath}`);
  }
  process.exit(report.summary.fail > 0 ? 1 : 0);
}

async function cmdRenderOnboard(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("render-onboard requires --workspace-root");
    process.exit(1);
  }
  const auditPath = path.join(workspaceRoot, ".ent", "audit.json");
  if (!fs.existsSync(auditPath)) {
    console.error("Missing .ent/audit.json — run audit first");
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  const out = writeOnboardHtml(workspaceRoot, report);
  console.log(`OK  onboard → ${out}`);
  process.exit(0);
}

async function cmdOnboard(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("onboard requires --workspace-root");
    process.exit(1);
  }
  const log = Boolean(args.log);
  const verbose = Boolean(args.verbose);
  const result = await runOnboard(getEntRoot(), workspaceRoot, { log, verbose });
  console.log(`OK  onboard workspace=${workspaceRoot}`);
  if (result.htmlPath) {
    console.log(`    checklist → ${result.htmlPath}`);
  }
  console.log(
    `    pass=${result.report.summary.pass} fail=${result.report.summary.fail} skip=${result.report.summary.skip}`
  );
  if (result.statePath) {
    console.log(`OK  state → ${result.statePath}`);
  }
  if (result.logPath) {
    console.log(`OK  log → ${result.logPath}`);
  }
  for (const warning of result.logBody.warnings) {
    console.log(`    warn: ${warning}`);
  }
  process.exit(result.exitCode);
}

async function cmdOffboard(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("offboard requires --workspace-root");
    process.exit(1);
  }
  const result = runOffboard(workspaceRoot, args);
  const mode = result.dry_run ? "dry-run" : result.applied ? "applied" : "planned";
  console.log(`OK  offboard (${mode}) workspace=${workspaceRoot}`);
  for (const action of result.actions) {
    console.log(`    ${action.type}: ${action.path}${action.servers ? ` (${action.servers.join(", ")})` : ""}`);
  }
  if (result.manual_steps?.length) {
    console.log("    manual:");
    for (const step of result.manual_steps) {
      console.log(`      - ${step}`);
    }
  }
  process.exit(0);
}

async function cmdScaffold(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("scaffold requires --workspace-root");
    process.exit(1);
  }
  scaffoldWorkspace(getEntRoot(), workspaceRoot);
  console.log(`OK  scaffold workspace=${workspaceRoot}`);
  process.exit(0);
}

async function cmdTestScaffold(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("test scaffold requires --workspace-root");
    process.exit(1);
  }
  runScaffoldTest(getEntRoot(), workspaceRoot);
  console.log("OK  test scaffold");
  process.exit(0);
}

async function cmdTestNegativeAudit(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("test negative-audit requires --workspace-root");
    process.exit(1);
  }
  await runNegativeAuditTest(getEntRoot(), workspaceRoot);
  console.log("OK  test negative-audit");
  process.exit(0);
}

async function cmdTestSync(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("test sync requires --workspace-root");
    process.exit(1);
  }
  const entRoot = getEntRoot();
  const entDir = path.join(workspaceRoot, "ent");
  assertEntPristine(entDir);
  runSyncTest(entRoot, workspaceRoot);
  console.log("OK  test sync");
  process.exit(0);
}

async function cmdTestMcpConfig() {
  runMcpConfigTest();
  console.log("OK  test mcp-config");
  process.exit(0);
}

async function cmdTestOnboard(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("test onboard requires --workspace-root");
    process.exit(1);
  }
  await runOnboardLogTest(getEntRoot(), workspaceRoot);
  console.log("OK  test onboard");
  process.exit(0);
}

async function cmdTestOffboard(args) {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? "");
  if (!workspaceRoot) {
    console.error("test offboard requires --workspace-root");
    process.exit(1);
  }
  runOffboardTest(getEntRoot(), workspaceRoot);
  console.log("OK  test offboard");
  process.exit(0);
}

async function cmdTest(args) {
  const suite = args._[1];
  if (!suite) {
    console.error("test requires a suite name");
    process.exit(1);
  }
  switch (suite) {
    case "branding-boundary":
      await cmdTestBrandingBoundary();
      break;
    case "kit-runtime-boundary":
      await cmdTestKitRuntimeBoundary();
      break;
    case "mcp-config":
      await cmdTestMcpConfig();
      break;
    case "onboard":
      if (!args.workspaceRoot) {
        console.error("test onboard requires --workspace-root");
        process.exit(1);
      }
      await cmdTestOnboard(args);
      break;
    case "offboard":
      if (!args.workspaceRoot) {
        console.error("test offboard requires --workspace-root");
        process.exit(1);
      }
      await cmdTestOffboard(args);
      break;
    case "sync":
      if (!args.workspaceRoot) {
        console.error("test sync requires --workspace-root");
        process.exit(1);
      }
      await cmdTestSync(args);
      break;
    case "negative-audit":
      if (!args.workspaceRoot) {
        console.error("test negative-audit requires --workspace-root");
        process.exit(1);
      }
      await cmdTestNegativeAudit(args);
      break;
    case "scaffold":
      if (!args.workspaceRoot) {
        console.error("test scaffold requires --workspace-root");
        process.exit(1);
      }
      await cmdTestScaffold(args);
      break;
    default:
      console.error(`Unknown test suite: ${suite}`);
      process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(command ? 0 : 1);
  }

  switch (command) {
    case "validate-manifest":
      await cmdValidateManifest();
      break;
    case "sync":
      await cmdSync(args);
      break;
    case "audit":
      await cmdAudit(args);
      break;
    case "onboard":
      await cmdOnboard(args);
      break;
    case "offboard":
      await cmdOffboard(args);
      break;
    case "render-onboard":
      await cmdRenderOnboard(args);
      break;
    case "scaffold":
      await cmdScaffold(args);
      break;
    case "test":
      await cmdTest(args);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
