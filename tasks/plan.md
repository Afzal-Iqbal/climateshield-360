# Implementation Plan: Permanent Map Fix & CARTO Purge

## Overview
CARTO recently began watermarking anonymous raster tile requests with grey "API Key Required" tiles, which caused the street basemap to disappear and leave only floating 3D district polygon blocks. This plan completely purges CARTO from the project, switches the primary basemap to OpenFreeMap Dark (`https://tiles.openfreemap.org/styles/dark` — 100% free, zero API keys, Cloudflare Karachi KHI edge CDN), and configures OpenStreetMap raster as the safe secondary fallback.

## Architecture Decisions
- **Purge CARTO entirely**: Delete all CARTO references and endpoints from `mapBasemap.ts` to guarantee no "API Key Required" watermarks can ever appear.
- **OpenFreeMap Dark as Primary Tier**:
  - Style URL: `https://tiles.openfreemap.org/styles/dark`
  - Zero API keys, completely open-source, served through Cloudflare with an edge node right in Karachi (`cf-ray: ...-KHI`).
  - Native dark theme matches ClimateShield 360's UI.
- **OpenStreetMap (OSM) as Secondary Tier**:
  - Community-maintained raster tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`).
  - Reliable fallback if OpenFreeMap is ever unreachable.
- **Dark Canvas as Final Tier**:
  - `#0b0f19` solid vector canvas if completely offline.
- **Harden Error Handlers**:
  - Filter out transient tile 404s and network warnings so individual tile drops never trigger basemap fallback storms or canvas resets.

## Task List

### Phase 1: Basemap & Error Hardening
- [ ] Task 1: Update `frontend/src/lib/mapBasemap.ts` to remove CARTO and configure OpenFreeMap Dark (`styles/dark`), OSM raster, and dark canvas.
- [ ] Task 2: Update `frontend/src/pages/RiskMap.tsx` to initialize with the new primary tier and update toast fallback descriptions.

### Phase 2: Verification & Delivery
- [ ] Task 3: Verify frontend build (`npm run build`) and backend tests (`pytest`).
- [ ] Task 4: Commit and push changes to branch `Hunain` on GitHub using `git` and `gh` CLI.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenFreeMap vector style takes a couple seconds to load on slow networks | Low | TanStack query caching + loading spinner keeps UI clean; Cloudflare Karachi edge caches assets |
| MapLibre setStyle resets custom district layers on fallback | Med | `onStyleReady` re-adds district layers automatically on `style.load` |

## Open Questions
None — Confirmed in interview session.
