# Phase 1 handoff

## Shipped

- Ent kit repo with manifest, CLI, and docs
- `ent.manifest.yaml` v1.0.0 with core checks, `wordpress_mcp` profile, workspace scaffold, agent adapters
- `tools/ent.mjs validate-manifest` + `test branding-boundary` + `test kit-runtime-boundary`
- `yaml` package for manifest parsing
- Docs: `PLAN.md`, `README.md`, `ENT-BOOT.md`, `AGENTS.md`, `docs/EXECUTION.md`, `docs/TESTING.md`

## Decisions

- Branding boundary patterns live in `test/golden/branding-boundary.txt`; gate runs via CLI (keeps docs free of banned literals)
- Manifest validation is strict: unique check ids, required descriptions, agents.templates

## First commands for Phase 2

```bash
# See docs/TESTING.md for fixture layout
export ENT_FIXTURE=../workspace-fixture
git clone . "$ENT_FIXTURE/ent"
node tools/ent.mjs sync --workspace-root "$ENT_FIXTURE" --agent cursor
node tools/ent.mjs test sync --workspace-root "$ENT_FIXTURE"
```

## Risks for Phase 2

- `session-boot.mjs` must detect workspace-with-ent layout (not legacy agent/ layout)
- MCP paths use `${workspaceFolder}/ent/tools/run-wordpress-mcp.mjs`
