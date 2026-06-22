# Ent

Ent is an immutable agent ops kit. Clone it into `ent/` inside a workspace; open the **workspace root** in your AI client.

## Quick start

```bash
git clone <ent-repo-url> my-workspace/ent
cd my-workspace
node ent/tools/ent.mjs scaffold --workspace-root .
```

In Cursor, run **`/ent-onboard`**.

## CLI

```bash
node ent/tools/ent.mjs validate-manifest
node ent/tools/ent.mjs sync --workspace-root . --agent cursor
node ent/tools/ent.mjs audit --workspace-root .
node ent/tools/ent.mjs render-onboard --workspace-root .
node ent/tools/ent.mjs scaffold --workspace-root .
```

## Layout

| Path | Role |
|------|------|
| `ent/` | Immutable kit — update via `git pull` |
| `content/` | Mutable site content |
| `.ent/` | Audit state and onboard checklist |
| `.env` | Workspace credentials |

See `docs/TESTING.md` for verification gates.
