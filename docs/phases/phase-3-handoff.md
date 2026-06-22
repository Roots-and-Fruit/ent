# Phase 3 handoff

## Shipped

- `tools/lib/audit.mjs` — manifest-aligned checks, audit.json, onboard.html
- `tools/ent.mjs audit`, `render-onboard`, `test negative-audit`
- Golden `test/golden/audit-post-sync-no-env.json`

## First commands for Phase 4

```bash
export ENT_FIXTURE=../workspace-fixture
node tools/ent.mjs scaffold --workspace-root "$ENT_FIXTURE"
node tools/ent.mjs test scaffold --workspace-root "$ENT_FIXTURE"
```
