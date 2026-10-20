# Implementation Plan: Risk Map Loading State Fix

## Overview
When the Risk Map page loads, the backend `/api/map/zones` returns an empty feature collection initially. The 60-second `refetchInterval` eventually picks up real data. During the wait, users see a confusing "No District Polygons" empty state. We need to keep showing "Loading risk data…" until real zone features arrive.

## Architecture Decisions
- **Frontend-only fix**: The backend query/refetch timing is out of scope.
- **Treat empty-success as still-loading**: Since the dataset always has zone data, an empty response means "not ready yet," not "genuinely empty." We derive a `zonesStillArriving` boolean and use it to gate the loading vs. empty-state UI.
- **No new dependencies**: Use the existing `Spinner` component already imported.

## Task List

### Phase 1: Fix the loading/empty state logic

- [ ] Task 1: Add `zonesStillArriving` guard and update UI conditions

### Checkpoint: Complete
- [ ] `npm run build` passes with 0 errors
- [ ] Open `/risk-map` → see spinner "Loading risk data…" until zones render on map
- [ ] "No District Polygons" never flashes during normal data arrival

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| If the backend truly has no data (empty warehouse), spinner shows forever | Low — dataset always has zones | Acceptable for hackathon scope |

## Open Questions
None — confirmed intent with user.
