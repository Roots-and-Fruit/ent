# Ent — session context (dynamic snapshot)

This file is generated at session start. It augments `.cursor/rules/00-ent-preload.mdc`.

## Kit status (phases complete)

Manifest v1.0.0 · Phases 1–6 complete per `ent/PLAN.md`:

- Manifest + validate-manifest
- ent sync + Cursor adapter
- ent audit + onboard HTML
- scaffold + /ent-onboard skill
- WordPress MCP runner
- Live E2E gate

## Extension map — start here

| If you are adding… | Start here | Also read |
|-------------------|------------|-----------|
| Audit check | `ent/ent.manifest.yaml` + `ent/tools/lib/audit.mjs` | `ent/docs/TESTING.md` |
| New profile | `ent/ent.manifest.yaml` profiles | mirror `wordpress_mcp` |
| Cursor adapter / hooks / rules | `ent/agent-adapters/cursor/workspace-template/` | `ent/tools/lib/sync.mjs` |
| Shared skill | `ent/agent-adapters/shared/skills/` | sync copies to `.cursor/skills/` |
| Onboard / scaffold | `ent/onboard-checklist.yaml`, `ent/tools/lib/onboard.mjs` | `ent-onboard` skill |
| Onboard HTML UI | `ent/agent-adapters/shared/onboard/DESIGN.md` | `onboard-ui.mjs`, `onboard.css` — use `ent-*` classes only |
| Offboard | `ent/tools/lib/offboard.mjs` | `ent-offboard` skill |
| WordPress MCP | `ent/tools/run-wordpress-mcp.mjs` | `ent/tools/lib/wp-smoke.mjs` |
| CLI subcommand | `ent/tools/ent.mjs` | `ent/docs/EXECUTION.md` |
| Boot / preload rule | `ent/ENT-BOOT.md` (human docs) | sync → `00-ent-preload.mdc` |

## Check IDs (manifest contract)

**Core:** `core.node`, `core.workspace_open_mode`, `core.ent_clean_git`, `core.agent_config`

**wordpress_mcp:** `wp.env_present`, `wp.env_complete`, `wp.mcp_config`, `wp.mcp_launcher`, `wp.rest_auth`, `wp.mcp_transport`

Implementations: `ent/tools/lib/audit.mjs` (runner), `ent/tools/lib/wp-smoke.mjs` (live WP).

## Audit semantics

- **fail** — fix before calling onboard complete
- **skip** — deferred (e.g. live gate); **skip ≠ pass** for phase completion
- **Clean audit** — `fail` and `skip` both zero → writes `.ent/state.json`
- Check order follows manifest order (stable for golden diffs)

## Verification (kit changes)

From kit repo root:

```bash
node tools/ent.mjs validate-manifest
node tools/ent.mjs test branding-boundary
node tools/ent.mjs test kit-runtime-boundary
```

With consumer fixture (`ENT_FIXTURE`):

```bash
node tools/ent.mjs test sync --workspace-root "$ENT_FIXTURE"
node tools/ent.mjs test negative-audit --workspace-root "$ENT_FIXTURE"
node tools/ent.mjs test scaffold --workspace-root "$ENT_FIXTURE"
```

## Anti-patterns

- Open `ent/` alone in Cursor (fails `core.workspace_open_mode`)
- Edit workspace `.cursor/` in place — source is `ent/agent-adapters/`; run `ent sync`
- Put kit logic in `content/` or modify `ent/` for mutable work
- Treat `skip` as success
- Commit `.env` or project-specific branding in the kit repo
