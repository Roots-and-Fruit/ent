# Ent site routing (agent policy)

Use this with `.ent/site-profile.json` on every session. Humans configure the site; agents follow these rules.

## Site identity

- Treat **site name**, **site URL**, and **host** in `.ent/site-profile.json` as the only site this workspace targets.
- If `checks.identity_ok` is false, stop and ask the user to fix `WP_MCP_URL` in `.env` before using REST or MCP against this workspace.
- Do not assume the MCP server label in Cursor matches the site — trust the profile host.

## REST vs MCP

| Use | When |
|-----|------|
| **WordPress REST** (`/wp-json/wp/v2/...`) | Core read/write of posts, pages, users, media when no dedicated MCP ability exists. Requires `checks.rest_ok`. |
| **MCP abilities** (`discover-abilities` / `execute-ability`) | Only for ability names listed in `site-profile.json` → `abilities`. Requires `checks.mcp_ok`. |
| **Neither** | Plugin-specific tasks (SEO/Yoast scores, analytics, Search Console, custom plugin APIs) when no matching ability is listed. Say what is missing; do not guess. |

## MCP tool discipline

1. Call `discover-abilities` (or read the profile ability list) before `execute-ability`.
2. Never invent ability names.
3. If `checks.mcp_ok` is false, do not use WordPress MCP tools — the MCP Adapter is not available on this site.
4. If the user asks for a capability not in the profile ability list, explain that the site has not exposed that ability via MCP.

## Staleness

- If site profile is missing or audit shows failed `wp.site_identity` / `wp.mcp_transport`, re-run `node ent/tools/ent.mjs audit --workspace-root .` before relying on MCP.
