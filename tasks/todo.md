# Tasks: Permanent Map Fix & CARTO Purge

- [x] **Task 1: Purge CARTO & Configure OpenFreeMap Dark in `mapBasemap.ts`**

  **Description:** Update `frontend/src/lib/mapBasemap.ts` to redefine `BasemapTier` as `'openfreemap' | 'osm' | 'dark'`, pointing `'openfreemap'` to OpenFreeMap Dark (`https://tiles.openfreemap.org/styles/dark`), remove all CARTO CDN urls, and configure `nextBasemapTier`: `openfreemap` → `osm` → `dark`.

  **Acceptance criteria:**
  - [x] No occurrences of `carto` or `cartocdn.com` in `mapBasemap.ts`
  - [x] Tier 1 is OpenFreeMap Dark (`https://tiles.openfreemap.org/styles/dark`)
  - [x] Tier 2 is OSM Raster (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`)
  - [x] Tier 3 is Dark Canvas (`#0b0f19`)

  **Verification:**
  - [x] TypeScript compilation passes: `npx tsc -b frontend`
  - [x] Zero lint/type errors in `mapBasemap.ts`

- [x] **Task 2: Update `RiskMap.tsx` initialization & fallback messages**

  **Description:** Ensure `RiskMap.tsx` initializes `basemapTierRef` and `styleForTier` to `'openfreemap'`, update the fallback toast message to reflect the new hierarchy (`OpenFreeMap unavailable — using OpenStreetMap raster`), and verify error handler skips non-fatal tile network warnings.

  **Acceptance criteria:**
  - [x] `basemapTierRef` defaults to `'openfreemap'`
  - [x] Map constructor uses `styleForTier('openfreemap')`
  - [x] Toast notification says `OpenFreeMap unavailable — using OpenStreetMap raster.` when falling back to `osm`
  - [x] Error handler ignores individual tile 404s/asset drops

  **Verification:**
  - [x] `npm run build` succeeds cleanly in `frontend/`

## Checkpoint: Core Implementation
- [x] Application builds without errors (`npm run build`)
- [x] Backend test suite passes (`pytest`)

- [x] **Task 3: Full Project Verification**

  **Description:** Run the full frontend production build and backend test suite to guarantee zero regressions.

  **Acceptance criteria:**
  - [x] `cd frontend && npm run build` completes in <10s with 0 errors
  - [x] `cd backend && PYTHONPATH=backend pytest backend/tests` passes 81/81 tests

- [ ] **Task 4: Commit and Push to `Hunain` Branch**

  **Description:** Stage the changes, commit with a descriptive message, and push directly to `origin/Hunain` using `git` and `gh` CLI.

  **Acceptance criteria:**
  - [ ] Git commit created on branch `Hunain`
  - [ ] Pushed to `https://github.com/Afzal-Iqbal/climateshield-360` under `Hunain`
  - [ ] Branch `main` untouched
