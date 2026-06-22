---
name: ent-onboard
description: Onboard a workspace to Ent. Run with /ent-onboard when .ent/state.json is missing or onboarded is false.
disable-model-invocation: true
---

# Ent onboard

Guide the user through Ent workspace setup.

## Steps

1. Confirm Cursor opens the **workspace root** (folder containing `ent/`), not `ent/` alone.
2. Run scaffold:

```bash
node ent/tools/ent.mjs scaffold --workspace-root .
```

3. Run audit and render checklist:

```bash
node ent/tools/ent.mjs audit --workspace-root .
node ent/tools/ent.mjs render-onboard --workspace-root .
```

4. Open `.ent/onboard.html` and fix **one** failing check at a time.
5. Re-run audit after each fix until `summary.fail` is 0 for enabled profiles.
6. Write `.ent/state.json` with `onboarded: true`, `ent_commit`, and `agents: ["cursor"]` only when audit passes.

## Boundaries

- Update `ent/` via `git pull` only
- Mutable work: `content/`, `.ent/`, `.env` at workspace root
