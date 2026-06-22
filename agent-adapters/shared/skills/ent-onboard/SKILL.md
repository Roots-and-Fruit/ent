---
name: ent-onboard
description: Onboard a workspace to Ent. Run with /ent-onboard when .ent/state.json is missing or onboarded is false. Use --logging for a detailed trace.
disable-model-invocation: true
---

# Ent onboard

Guide the user through Ent workspace setup.

## Steps

1. Confirm Cursor opens the **workspace root** (folder containing `ent/`), not `ent/` alone.
2. Run onboard (preferred — single orchestrated flow):

```bash
node ent/tools/ent.mjs onboard --workspace-root .
```

If the user asked for **`--logging`**, a trace, or verbose debugging, add `--log` (and optionally `--verbose`):

```bash
node ent/tools/ent.mjs onboard --workspace-root . --log --verbose
```

3. Open `.ent/onboard.html` and fix **one** failing check at a time.
4. Re-run onboard (or `audit`) after each fix until `summary.fail` is 0 and `summary.skip` is 0.
5. When `--log` was used, tell the user the trace path: `.ent/onboard-log.json` (attach or summarize it when debugging in a new environment).

Legacy step-by-step (only if orchestrator is unavailable):

```bash
node ent/tools/ent.mjs scaffold --workspace-root .
node ent/tools/ent.mjs audit --workspace-root .
node ent/tools/ent.mjs render-onboard --workspace-root .
```

`state.json` is written automatically when audit is clean — do not write it manually.

## After onboard passes

Audit verifies remote WordPress MCP transport — not the local Cursor MCP process. Tell the user:

1. **Reload Cursor** — run **Developer: Reload Window** so `.cursor/mcp.json` is picked up (MCP stays disabled until reload).
2. **Enable MCP** — in Cursor Settings → MCP, enable the server named after the site (not the generic `wordpress` placeholder).
3. **If MCP fails to connect** — ensure bundled MCP is installed (`ent/node_modules/@automattic/mcp-wordpress-remote`). Re-run `node ent/tools/ent.mjs scaffold --workspace-root .` or `npm install --omit=dev` from `ent/`, then audit and fix `wp.mcp_launcher` if it fails.

Do not claim MCP tools are ready until the user has reloaded and enabled the server.

## Boundaries

- Update `ent/` via `git pull` only
- Mutable work: `content/`, `.ent/`, `.env` at workspace root
