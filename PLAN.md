# Build Ent — execution plan

Phased build at `C:\Users\reach\OneDrive\Ent`. Test fixture: `C:\Users\reach\OneDrive\Ent-workspace-test`.

## Documentation voice

Ent documentation states what we build and how it works. Boundaries describe what to prevent.

## Phase status

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Manifest + validate-manifest | complete |
| 2 | ent sync + Cursor adapter | complete |
| 3 | ent audit + onboard HTML | in progress |
| 4 | scaffold + /ent-onboard skill | pending |
| 5 | WordPress MCP runner | pending |
| 6 | Live E2E gate | pending |

## Phase learnings

### Phase 2

- `node` in mcp.json (not absolute node path) keeps adapter portable across OS.
- Sync reads live `ent/` dev tree via `getEntRoot()`; fixture `workspace/ent/` clone used only for pristine check.
