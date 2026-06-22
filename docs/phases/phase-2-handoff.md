# Phase 2 handoff

## Shipped

- `agent-adapters/cursor/workspace-template/` — mcp.json, hooks, layout rule, session-boot
- `agent-adapters/claude-code/templates/` — mcp.json + CLAUDE.md.fragment (stub)
- `agent-adapters/shared/skills/` — ent-onboard, write-a-skill
- `tools/lib/sync.mjs`, `tools/lib/test-sync.mjs`
- `tools/ent.mjs sync` and `test sync`
- Stub `tools/run-wordpress-mcp.mjs`

## First commands for Phase 3

```bash
export ENT_FIXTURE=../workspace-fixture
node tools/ent.mjs sync --workspace-root "$ENT_FIXTURE" --agent cursor
node tools/ent.mjs audit --workspace-root "$ENT_FIXTURE"
node tools/ent.mjs test negative-audit --workspace-root "$ENT_FIXTURE"
```

## Risks for Phase 3

- Golden fixtures must match check ids in manifest exactly
- `skip` with `live_gate_deferred` for WP transport until Phase 5/6
