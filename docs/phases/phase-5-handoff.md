# Phase 5 handoff

## Shipped

- `tools/run-wordpress-mcp.mjs` — workspace `.env`, spawns bundled `ent/node_modules/@automattic/mcp-wordpress-remote`
- `tools/test-wordpress-mcp-http.mjs` — REST + MCP smoke
- `tools/lib/wp-smoke.mjs` — shared smoke logic used by audit live checks

## Phase 6

Live gate uses workspace `.env` with real `WP_MCP_*` credentials.
