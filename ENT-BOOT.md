# Ent — boot card

Index: `AGENTS.md`. Execution protocol: `docs/EXECUTION.md`. Testing: `docs/TESTING.md`.

## Workspace

- **Layout:** workspace root contains `ent/` (immutable kit) + mutable ring (`content/`, `.ent/`, `.env`)
- **Open:** workspace root in Cursor — the parent folder that contains `ent/`
- **Config:** `ent sync` projects agent adapters into workspace `.cursor/` (or `.mcp.json` for Claude Code)

## Onboard

Run **`/ent-onboard`** when `.ent/state.json` is missing or `onboarded` is false.

```bash
node ent/tools/ent.mjs scaffold --workspace-root .
node ent/tools/ent.mjs audit --workspace-root .
node ent/tools/ent.mjs render-onboard --workspace-root .
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
