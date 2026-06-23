# Ent onboard design system

Static HTML/CSS for `.ent/onboard.html`. **Light mode only.** No dark theme.

## For agents — read this before editing onboard UI

1. **Do not add `style=""` attributes** to generated HTML. Use classes from `onboard.css` only.
2. **Do not invent one-off CSS** in `onboard-html.mjs`. Add or extend tokens/components in `onboard.css`, then expose via `tools/lib/onboard-ui.mjs`.
3. **Compose pages with `onboard-ui.mjs`** helpers (`entCard`, `entSectionHead`, `entMcpGroup`, …). Keep `onboard-html.mjs` as data wiring only.
4. **Prefix every class with `ent-`** so the system stays namespaced and grep-friendly.
5. **Icons** live in `tools/lib/onboard-icons.mjs` (inline Lucide SVGs). Section eyebrows/icons in `SECTION_META`.

## File map

| File | Role |
|------|------|
| `agent-adapters/shared/onboard/onboard.css` | Tokens + components (single source of truth) |
| `agent-adapters/shared/onboard/DESIGN.md` | This doc |
| `tools/lib/onboard-ui.mjs` | HTML component builders (class names only) |
| `tools/lib/onboard-html.mjs` | Page model + section assembly |
| `tools/lib/onboard-icons.mjs` | SVG icons + section metadata |

## Tokens (`:root`)

Semantic colors use oklch. Spacing/radius/type scale use `--ent-*` names.

| Token | Use |
|-------|-----|
| `--ent-bg`, `--ent-fg` | Page background / body text |
| `--ent-card`, `--ent-border` | Cards, dividers |
| `--ent-primary` | Brand orange — eyebrows, links, accents |
| `--ent-sage` | Success — passed checks, Ready badge |
| `--ent-muted`, `--ent-muted-fg` | Subtle fills / secondary text |
| `--ent-accent` | Icon box background |
| `--ent-shadow` | Card elevation |
| `--ent-radius` | 5px — cards, tiles, callouts |
| `--ent-font-sans`, `--ent-font-display` | Hanken Grotesk / Zilla Slab |

## Layout

| Class | Role |
|-------|------|
| `.ent-page` | Centered max-width column (`48rem`) |
| `.ent-grid-2` | Two columns from `560px` |
| `.ent-stack` | Vertical flex with `--ent-gap` |

## Typography

| Class | Role |
|-------|------|
| `.ent-eyebrow` | Uppercase section label (orange) |
| `.ent-title-xl` | Hero headline |
| `.ent-title-lg` | Card / section title |
| `.ent-title-md` | MCP group title, tile title |
| `.ent-lede` | Intro paragraph under a title |
| `.ent-text-sm`, `.ent-text-xs` | Secondary copy |
| `.ent-muted` | De-emphasized paragraph |
| `.ent-code` | Inline monospace chip |

## Primitives

| Class | Role |
|-------|------|
| `.ent-status.ent-status--pass` | Green check circle |
| `.ent-status.ent-status--pending` | Empty circle |
| `.ent-status.ent-status--sm` | Smaller variant (MCP task grid) |
| `.ent-icon-box` | Rounded square behind section icons |
| `.ent-badge.ent-status--ready` / `--locked` | Ability Ready / Locked |
| `.ent-callout.ent-callout--warn` | Setup failure alert |
| `.ent-callout.ent-callout--prompt` | Agent copy-paste prompt |

## Components

| Class | Role |
|-------|------|
| `.ent-site-header` | Logo + wordmark + tagline |
| `.ent-hero` | Gradient welcome card |
| `.ent-card` | Standard section container |
| `.ent-section-head` | Icon box + eyebrow + title + lede |
| `.ent-stat-row` / `.ent-stat.ent-stat--sage` | Hero ability pills |
| `.ent-list` / `.ent-list-item` | Checklist rows |
| `.ent-mcp-stack` / `.ent-mcp` | MCP Support groups |
| `.ent-mcp__tasks` | Two-column task grid inside an MCP |
| `.ent-tile` | Ability card in Discover |
| `.ent-footer` / `.ent-footer__credit` | Roots & Fruit line |

## Adding a new section

1. Add eyebrow/icon/lede to `SECTION_META` in `onboard-icons.mjs` if needed.
2. Add checklist entry in `onboard-checklist.yaml` (not inline in HTML).
3. If the layout is new, add a builder in `onboard-ui.mjs` using existing primitives.
4. Wire it in `onboard-html.mjs` `renderChecklistSections` or a dedicated function.
5. Run `node tools/ent.mjs test onboard-html`.

## Live refresh (deterministic, no agent tokens)

`onboard.html` is a **projection** of audit + site probes, not hand-edited.

| Trigger | Behavior |
|---------|----------|
| `audit` | Always runs audit + renders HTML + writes `.ent/onboard-meta.json` |
| `refresh-onboard` | Re-renders only if inputs fingerprint is stale (or `--force`) |
| Session boot (2-lite) | `refreshIfStale` when `.env` / `mcp.json` / kit inputs changed — **no preload text added** |
| `afterFileEdit` hook | Watched paths → `force` refresh (debounced 2s) |

**Machine truth for agents:** `.ent/audit.json`, `.ent/site-profile.json` — not HTML.

**Staleness:** SHA fingerprint of watched input paths + `ent` git HEAD vs `onboard-meta.json`.

**Disable auto refresh:** `ENT_ONBOARD_REFRESH=0` in `.env`.

**Implementation:** `tools/lib/onboard-refresh.mjs`, hooks in `.cursor/hooks/onboard-refresh-hook.mjs`.

## Preview locally

```bash
node ent/tools/ent.mjs audit --workspace-root .
# or refresh without live probes when already fresh:
node ent/tools/ent.mjs refresh-onboard --workspace-root .
# Open .ent/onboard.html in an external browser (not Cursor Simple Browser — it may tint previews).
```
