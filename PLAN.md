# Build Ent — execution plan

Phased build at `C:\Users\reach\OneDrive\Ent`. Test fixture: `C:\Users\reach\OneDrive\Ent-workspace-test`.

## Documentation voice

Ent documentation states what we build and how it works. Boundaries describe what to prevent.

## Phase status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Manifest + validate-manifest | complete |
| 2 | ent sync + Cursor adapter | complete |
| 3 | ent audit + onboard HTML | complete |
| 4 | scaffold + /ent-onboard skill | complete |
| 5 | WordPress MCP runner | complete |
| 6 | Live E2E gate | complete |

## Phase learnings

### Phase 6

- Live gate passed with mapped workspace credentials; audit exits 0 only when `fail` and `skip` are both zero.
- `state.json` writes automatically on clean audit.

### Phase 5

- `runWpMcpSmoke` centralizes REST + MCP initialize + tools/list for audit and CLI.

### Phase 4

- Scaffold preserves non-empty `.env` and leaves `ent/` git tree untouched.

### Phase 3

- Check order is stable for golden comparison (manifest order).
- Incomplete `.env` yields `fail` on live WP checks; `skip` only when env is complete but live gate deferred.

### Phase 1

- Branding gate belongs in CLI (`test branding-boundary`) so docs stay clean.
- `yaml` dependency keeps manifest human-editable; validator enforces structure at gate time.
