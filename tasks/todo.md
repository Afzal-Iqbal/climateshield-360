# Tasks: Risk Map Loading State Fix

- [ ] **Task 1: Add `zonesStillArriving` guard and update UI conditions**

  **Description:** Derive a `zonesStillArriving` boolean that is `true` when either `isZonesLoading` is true OR `isZonesSuccess` is true but features are empty. Use this single flag to: (a) show the "Loading risk data…" spinner, and (b) suppress the "No District Polygons" empty state. The empty state should only render when `!zonesStillArriving && features.length === 0` — which in practice never happens because the dataset always has zones.

  **Acceptance criteria:**
  - [ ] A `zonesStillArriving` const is computed after the `filteredZones` memo (~line 251)
  - [ ] Loading spinner block (line ~828) uses `zonesStillArriving` instead of `isZonesLoading`
  - [ ] Empty state block (line ~843) uses `!zonesStillArriving` instead of `!isZonesLoading`
  - [ ] No other lines in `RiskMap.tsx` are changed

  **Verification:**
  - [ ] `cd frontend && npm run build` exits 0
  - [ ] Open `http://127.0.0.1:5173/risk-map` → spinner shows until zones render
  - [ ] "No District Polygons" dialog never appears during normal load

  **Dependencies:** None
  **Files likely touched:** `frontend/src/pages/RiskMap.tsx`
  **Estimated scope:** XS (1 file, ~5 lines changed)
