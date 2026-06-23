---
name: ent-onboard
description: Onboard a workspace to Ent. Run with /ent-onboard when .ent/state.json is missing or onboarded is false. Use --logging for a detailed trace.
disable-model-invocation: true
---

# Ent onboard

Guide the user through Ent workspace setup.

## Steps

1. Confirm Cursor opens the **workspace root** (folder containing `ent/`), not `ent/` alone.
2. Run onboard (preferred — single orchestrated flow):

```bash
node ent/tools/ent.mjs onboard --workspace-root .
```

If the user asked for **`--logging`**, a trace, or verbose debugging, add `--log` (and optionally `--verbose`):

```bash
node ent/tools/ent.mjs onboard --workspace-root . --log --verbose
```

3. Fix **one** failing setup item at a time when audit is not clean (see "Complete setup first" on `.ent/onboard.html`).
4. Re-run onboard after each fix until `summary.fail` is 0 and `summary.skip` is 0.
5. When `--log` was used, tell the user the trace path: `.ent/onboard-log.json`.

Legacy step-by-step (only if orchestrator is unavailable):

```bash
node ent/tools/ent.mjs scaffold --workspace-root .
node ent/tools/ent.mjs audit --workspace-root .
node ent/tools/ent.mjs render-onboard --workspace-root .
```

`state.json` is written automatically when audit is clean — do not write it manually.

## When onboard completes (`fail=0`, `skip=0`)

**This is a product moment.** Reply with a warm, confident, celebratory message (not cheesy). Structure:

1. **Congratulations** — onboarding is complete; their WordPress workspace is connected to Ent.
2. **What they unlocked** — agents can work with their site using the Ent MCP bridge, site profile, and capability map.
3. **Open the onboard page in the browser** — tell them explicitly to open **`.ent/onboard.html`** from the workspace root (e.g. right-click → Reveal in File Explorer → double-click, or drag the file into a browser). Say this is their **home base** for MCP Support, abilities, and optional add-ons.
4. **Cursor housekeeping** — Reload Window (Developer: Reload Window), then enable the WordPress MCP server in Settings → MCP (name matches their site).
5. **Optional MCPs** — mention that onboard.html lists **Blocks MCP (Gravity Kit)** and **Website specifications MCP**; if those rows are not all green, copy the "Ask your agent to set this up" prompt from that section into a new chat.

Do **not** dump raw audit JSON unless they used `--log` and asked for debugging detail.

Example tone (adapt to their site name):

> Onboarding is complete — you're all set! **{site}** is now wired into Ent, and your agent can start working with your WordPress site from Cursor.
>
> Take a minute to open **`.ent/onboard.html`** in your browser. That's your capability dashboard: MCP Support, registered abilities, and what to add next.
>
> In Cursor: run **Developer: Reload Window**, then enable your site MCP server under Settings → MCP. Optional add-ons like Block MCP are listed on the onboard page with copy-paste prompts if you want them.

## After onboard passes (technical)

Audit verifies remote WordPress MCP transport — not the local Cursor MCP process.

1. **Reload Cursor** — `Developer: Reload Window` before MCP config is active.
2. **Enable MCP** — Settings → MCP → enable the server named after the site.
3. **Bundled launcher** — if MCP fails locally, run `node ent/tools/ent.mjs scaffold --workspace-root .` and fix `wp.mcp_launcher`.

Do not claim MCP tools are ready until the user has reloaded and enabled the server.

## Site profile and agent routing

After a clean audit, Ent writes `.ent/site-profile.json` with site identity, REST inventory, and abilities with **executable** status.

- `wp.site_identity` fail → fix `WP_MCP_URL` in `.env`.
- `wp.abilities_usable` fail → some abilities are blocked — fix WordPress permissions or install companion engine.
- `wp.companion_engine` skip → optional; pass when a `*/ping` ability is executable (abilities engine on site).
- Optional `content/site-specifications.yaml` for content model semantics; `content/extensions.yaml` for plugin ability hints.

Policy: `ent/agent-adapters/shared/site-routing.md`

## Boundaries

- Update `ent/` via `git pull` only
- Mutable work: `content/`, `.ent/`, `.env` at workspace root
