---
name: write-a-skill
description: Gate before creating or editing Ent skills. Invoke with /write-a-skill.
disable-model-invocation: true
---

# Write a skill

Do not create or edit skills under `.cursor/skills/` until this procedure completes.

## Intake

| Field | Question |
|-------|----------|
| Purpose | What predictability does this skill guarantee? |
| Invocation | User-invoked (`disable-model-invocation: true`) or model-invoked? |
| Location | `ent/agent-adapters/shared/skills/` (source) → sync to `.cursor/skills/` |

## Draft

1. Name — kebab-case, matches folder name
2. Frontmatter — `name`, `description`, invocation flag
3. Steps — executable commands with `node ent/tools/ent.mjs` where relevant

## Ship

1. Add skill under `ent/agent-adapters/shared/skills/<name>/`
2. Run `node ent/tools/ent.mjs sync --workspace-root . --agent cursor`
3. Verify skill appears in `.cursor/skills/<name>/SKILL.md`
