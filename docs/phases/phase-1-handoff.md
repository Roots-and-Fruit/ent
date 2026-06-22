# Phase 1 handoff

## Shipped

- Ent repo at `C:\Users\reach\OneDrive\Ent`
- `ent.manifest.yaml` v1.0.0 with core checks, `wordpress_mcp` profile, workspace scaffold, agent adapters
- `tools/ent.mjs validate-manifest` + `test branding-boundary` + `test kit-runtime-boundary`
- `yaml` package for manifest parsing
- Docs: `PLAN.md`, `README.md`, `ENT-BOOT.md`, `AGENTS.md`, `docs/EXECUTION.md`, `docs/TESTING.md`

## Decisions

- Branding boundary patterns live in `test/golden/branding-boundary.txt`; gate runs via CLI (keeps docs free of banned literals)
- Manifest validation is strict: unique check ids, required descriptions, agents.templates

## First commands for Phase 2

```bash
cd C:\Users\reach\OneDrive\Ent
git clone C:\Users\reach\OneDrive\Ent C:\Users\reach\OneDrive\Ent-workspace-test\ent
# implement ent sync + agent-adapters/cursor/workspace-template
node tools/ent.mjs sync --workspace-root C:\Users\reach\OneDrive\Ent-workspace-test --agent cursor
node tools/ent.mjs test sync --workspace-root C:\Users\reach\OneDrive\Ent-workspace-test
```

## Risks for Phase 2

- `session-boot.mjs` must detect workspace-with-ent layout (not legacy agent/ layout)
- MCP paths use `${workspaceFolder}/ent/tools/run-wordpress-mcp.mjs`
