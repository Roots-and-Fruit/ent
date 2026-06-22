# Execution protocol

## Two-strike rule

1. Run the phase gate command(s).
2. On **first failure**: one fix attempt; re-run the **same** gate unchanged.
3. On **second failure**: **STOP**. Write `docs/phases/phase-N-STOP.md` with failing command, output, hypothesis, and recommended resolution.
4. User decides next step.

## Test integrity

| Rule | Purpose |
|------|---------|
| `skip` ≠ `pass` for phase completion | Prevent false-green onboard |
| Live WordPress only in Phase 6 | Prevent mocked HTTP success |
| Negative tests assert expected failure shape | Prevent "audit ran" as success |

## Phase completion ritual

1. Append learnings to `PLAN.md` under `## Phase N learnings`.
2. Write `docs/phases/phase-N-handoff.md`.
3. Commit: `phase-N: <summary>`.
