# Spec: Map Resilience & Fault-Tolerant Spatial Rendering

## Assumptions I'm Making
1. The canvas going blank is triggered by WebGL context disruption or tile load rejections during camera transformation (`zoom`, `pan`, `fitBounds`).
2. The user wants a map that is 100% resilient across all browsers (including Windows Chrome/Edge with hardware acceleration quirks) during hackathon presentations.
3. The district polygons (`/api/map/zones`) and facility points (`/api/map/facilities`) are the critical business data that must always remain visible.
4. Backend API and DuckDB database remain strictly read-only and unmodified.

---

## 1. Objective
Replace the fragile map rendering layer on `/risk-map` with a fault-tolerant spatial architecture that guarantees the canvas **never goes blank, black, or displays missing tile boxes** when a user clicks a district, selects a facility, or zooms in and out.

### Evaluation of Strategies

| Strategy | Architecture | Pros | Cons / Trade-offs |
|---|---|---|---|
| **Strategy A (Recommended): Leaflet + Esri/CARTO Dark** | Standard 2D HTML Canvas & DOM tiles (via `leaflet` / `react-leaflet`) | **Zero WebGL crashes** (impossible for context to be lost); ultra-lightweight; rock-solid zooming & panning; free global CDN (Esri/CARTO) | 3D pitch/bearing extrusions not supported (pure 2D top-down) |
| **Strategy B: Native Interactive SVG / D3 Vector Map** | Pure React SVG / HTML5 Canvas rendering of Karachi GeoJSON | **Zero network requests for tiles**; 100% offline; completely immune to tile blocking or API keys; 60fps animations | No background street raster below the districts |
| **Strategy C: Hardened MapLibre with WebGL Recovery & Esri Akamai CDN** | MapLibre GL with `preserveDrawingBuffer: true`, WebGL context loss handlers, Esri Dark Gray Base, and removal of destructive `setStyle()` resets | Retains 3D extrusion capabilities; uses Esri's unrestricted Akamai CDN | WebGL context can still be affected by low-end GPU drivers or Windows blur |

---

## 2. Tech Stack
- Frontend: React 18, TypeScript, Tailwind CSS, Vite
- Map Engine:
  - Option A: Leaflet 1.9 (`leaflet`, `@types/leaflet`)
  - Option C: MapLibre GL 4.7 hardened
- Tile Services: Esri World Dark Gray Base (`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`) & CARTO Dark Matter (`https://basemaps.cartocdn.com/...`)
- State & Data: TanStack React Query, GeoJSON FeatureCollections

---

## 3. Commands
- **Build**: `cd frontend && npm run build`
- **Lint**: `cd frontend && npm run lint`
- **Dev**: `cd frontend && npm run dev`
- **Backend Tests**: `PYTHONPATH=backend .venv/bin/pytest backend/tests`

---

## 4. Project Structure
```
frontend/src/
├── lib/
│   ├── mapBasemap.ts      → Basemap definitions & multi-provider tile URLs
│   ├── mapGeojson.ts      → GeoJSON parsing, bounds computation, data sanitization
│   └── mapHeight.ts       → Metric scale calculations
├── pages/
│   └── RiskMap.tsx        → Primary spatial visualization page & drawer
└── components/
    └── ui/                → Toast, badges, error states, and spinners
```

---

## 5. Code Style
- Strict TypeScript with no implicit `any`.
- Functional React components with hooks.
- Defensive error boundary around map container:
```typescript
// Example: Safe Leaflet / MapLibre context recovery pattern
const handleContextRestored = () => {
  console.info('[Map] WebGL/Canvas context restored; reloading layer data');
  syncSources();
};
```

---

## 6. Testing Strategy
- Unit & regression: Ensure `npm run build` passes with zero TypeScript warnings.
- Backend integrity: Ensure all 81 pytest tests pass (`backend/tests/`).
- Manual interaction verification:
  1. Rapid continuous zooming (mouse scroll, double click, zoom buttons).
  2. District polygon selection for all 7 Karachi districts.
  3. Window resize and drawer open/close.

---

## 7. Boundaries
- **Always**:
  - Keep the working tree clean on branch `Hunain`.
  - Ensure zero watermarks or broken tile placeholders.
  - Preserve all existing district dossier tabs (Hazard, Exposure, Vulnerability, Evidence).
- **Ask first**:
  - Replacing MapLibre with Leaflet (dropping 3D extrusion feature in exchange for 100% crash immunity).
  - Adding new NPM packages to `frontend/package.json`.
- **Never**:
  - Never push commits to `main`.
  - Never introduce paid third-party dependencies requiring credit card billing.
  - Never leave unhandled promise rejections on camera movements.

---

## 8. Success Criteria
1. Clicking any of the 7 districts updates the URL query (`?zone=...`), opens the dossier drawer, and smoothly centers the district without the map blanking out.
2. Rapid zooming in and out across all zoom levels (5 through 18) maintains tile rendering with zero white or black screens.
3. If an external tile request drops or is slow, the map remains interactive and displays the district boundary overlays on the dark theme.
4. Production build (`npm run build`) and backend tests (81/81) remain green.

---

## 9. Open Questions for User
1. **Which strategy do you want to proceed with?**
   * **Strategy A (Leaflet 2D)**: Replaces MapLibre with Leaflet. Guaranteed zero WebGL crashes / blank canvas forever, but disables 3D building extrusions.
   * **Strategy B (Esri Akamai CDN in MapLibre + WebGL Hardening)**: Keeps MapLibre and 3D mode, but replaces CARTO with Esri's unrestricted Akamai CDN (`server.arcgisonline.com`) and disables destructive style reloads.
   * **Strategy C (Pure Offline SVG/Canvas Vector Map)**: 100% local rendering of Karachi polygons with zero external tile server dependencies.
2. What exact text or error appears in your browser's Developer Tools Console (`F12` -> Console tab) when the blank canvas occurs?
