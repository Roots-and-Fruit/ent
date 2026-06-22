# Ent — boot card

Index: `AGENTS.md`. Execution protocol: `docs/EXECUTION.md`. Testing: `docs/TESTING.md`.

## Workspace

- **Layout:** workspace root contains `ent/` (immutable kit) + mutable ring (`content/`, `.ent/`, `.env`)
- **Open:** workspace root in Cursor — the parent folder that contains `ent/`
- **Config:** `ent sync` projects agent adapters into workspace `.cursor/` (or `.mcp.json` for Claude Code). Syncing a consumer fixture also refreshes ent-kit `.cursor/` for `ent-dev.code-workspace` preload.

## Onboard

Run **`/ent-onboard`** when `.ent/state.json` is missing or `onboarded` is false. Use **`/ent-onboard --logging`** (or `onboard --log`) when debugging in a new environment.

```bash
node ent/tools/ent.mjs onboard --workspace-root . [--log]
```

Requires `ent/node_modules` (installed by `scaffold` or `sync` after `git pull`).

## Offboard

Run **`/ent-offboard`** to disconnect Ent MCP and clear onboard state. Dry-run first:

```bash
node ent/tools/ent.mjs offboard --workspace-root . --dry-run
```

## Update Ent

```bash
git -C ent pull
node ent/tools/ent.mjs sync --workspace-root . --agent cursor
node ent/tools/ent.mjs audit --workspace-root .
```

## Boundaries

- Update `ent/` via `git pull` only
- Mutable work lives in `content/`, `.ent/`, `.env` at workspace root
- Verification gates live in `docs/TESTING.md`
