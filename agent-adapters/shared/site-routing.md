# Ent site routing (agent policy)

Use this with `.ent/site-profile.json` on every session. Humans configure the site; agents follow these rules.

## Site identity

- Treat **site name**, **site URL**, and **host** in `.ent/site-profile.json` as the only site this workspace targets.
- Use the **MCP server name** from the profile (`mcp.server_name`) — ignore other MCP servers in Cursor for WordPress work on this workspace.
- If `checks.identity_ok` is false, stop and ask the user to fix `WP_MCP_URL` in `.env` before using REST or MCP.

## REST vs MCP

| Use | When |
|-----|------|
| **WordPress REST** (`/wp-json/wp/v2/...`) | Core read/write of posts, pages, users, media when no **executable** MCP ability exists. Requires `checks.rest_ok`. |
| **MCP abilities** (`execute-ability`) | Only abilities with `executable: true` in site profile. Requires `checks.mcp_ok`. |
| **Neither** | Extension/plugin tasks when no matching **executable** ability exists. Report the gap; do not guess or brute-force plugin REST namespaces. |

## Probe budget (extension tasks)

1. Read site profile abilities and `content/extensions.yaml` hints if present.
2. At most **one** targeted REST read (e.g. post meta sample from profile `rest.post_meta_keys_sample`).
3. At most **one** `execute-ability` attempt if an executable ability matches.
4. If still blocked, stop and explain (permission denied, missing ability, or data not exposed).

## MCP tool discipline

1. Prefer the profile ability list over live `discover-abilities` when profile is fresh.
2. Never invent ability names.
3. If `checks.mcp_ok` is false, do not use WordPress MCP tools.
4. If an ability is listed with `executable: false`, do not retry — fix permissions on WordPress or adjust ability caps.

## Site-local hints

Optional `content/extensions.yaml` maps human labels (e.g. "SEO scores") to ability patterns and agent hints. Ent does not ship plugin-specific rules in the kit.

## Staleness

Re-run `node ent/tools/ent.mjs audit --workspace-root .` when profile is missing, env changes, or `wp.abilities_usable` fails.

## CLI helpers

```bash
node ent/tools/ent.mjs wp get --workspace-root . --path /wp/v2/posts --query "per_page=1&_fields=id,title,meta"
node ent/tools/ent.mjs wp ability --workspace-root . --name "namespace/ability-name" --input '{}'
```
