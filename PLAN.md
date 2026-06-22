# Build Ent — execution plan

Phased build at `C:\Users\reach\OneDrive\Ent`. Test fixture: `C:\Users\reach\OneDrive\Ent-workspace-test`.

## Documentation voice

Ent documentation states what we build and how it works. Boundaries describe what to prevent.

## Phase status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Manifest + validate-manifest | complete |
| 2 | ent sync + Cursor adapter | in progress |
| 3 | ent audit + onboard HTML | pending |
| 4 | scaffold + /ent-onboard skill | pending |
| 5 | WordPress MCP runner | pending |
| 6 | Live E2E gate | pending |

## Phase learnings

### Phase 1

- Branding gate belongs in CLI (`test branding-boundary`) so docs stay clean.
- `yaml` dependency keeps manifest human-editable; validator enforces structure at gate time.
