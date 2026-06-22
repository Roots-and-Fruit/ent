---
name: ent-offboard
description: Disconnect Ent from a workspace. Run with /ent-offboard to remove MCP config and onboard state.
disable-model-invocation: true
---

# Ent offboard

Disconnect Ent-managed WordPress MCP from this workspace.

## Default scope

Removes Ent MCP server entries from `.cursor/mcp.json` (and `.mcp.json` if present) and deletes `.ent/state.json`. Does **not** delete `ent/`, `content/`, `.env`, or projected `.cursor/` hooks unless optional flags are set.

## Steps

1. Confirm the user wants to **disconnect** (default) vs full teardown.
2. Show the plan:

```bash
node ent/tools/ent.mjs offboard --workspace-root . --dry-run
```

3. Run offboard after confirmation:

```bash
node ent/tools/ent.mjs offboard --workspace-root .
```

## Optional flags

| Flag | Effect |
|------|--------|
| `--clear-audit` | Remove `.ent/audit.json`, `onboard.html`, `onboard-log.json` |
| `--clear-env` | Remove `WP_MCP_*` lines from `.env` |
| `--remove-projected` | Delete `.cursor/` and `.mcp.json` |
| `--remove-kit` | Delete `ent/` (destructive — confirm explicitly) |
| `--keep-mcp` | Leave MCP config unchanged |
| `--keep-state` | Leave `.ent/state.json` |

## After offboard

Tell the user the manual steps printed by the CLI:

1. Disable the MCP server in **Cursor Settings → MCP**
2. **Developer: Reload Window**
3. Optionally revoke the WordPress Application Password

Do not claim the site is fully disconnected until the user has reloaded Cursor.
