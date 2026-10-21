# Implementation Plan: HackInsight 2026 Deliverables Audit & Submission README

## Overview
Deliver an executive-grade submission package and root `README.md` for **ClimateShield 360** (Karachi Extreme Weather & Crisis Platform) for the HackInsight 2026 judging panel (Climate Track: Data-to-Decision). The package is strictly aligned with the official HackInsight Participant Guide (`hackathonguide.pdf`), verifying all 5 core deliverables, organizing project artifacts, integrating the project logo, and presenting a complete rubric compliance matrix.

---

## Architecture & Presentation Decisions
- **Logo Asset Management**: Copy `/home/hunain/Downloads/Gemini_Generated_Image_l5ku91l5ku91l5ku.jpeg` to `doc/assets/logo.jpeg` and `frontend/public/logo.jpeg` for version-controlled, high-availability rendering in markdown and web.
- **Strict Grounding in `hackathonguide.pdf`**:
  - Deliverable 1: Warehouse & Manifest (`climateshield.duckdb`, `hourly_manifest.csv`, `Dataset_Declaration.pdf`).
  - Deliverable 2: Data Quality Agent (`pandera` validation, fix/fill/flag decision matrix, `quality_log`).
  - Deliverable 3: Predictive ML Model vs Declared Baseline (LightGBM quantile regression $Q_{10}, Q_{50}, Q_{90}$, 35.1% MAE improvement over 24h persistence, group fairness breakdown across 12 Pakistani cities).
  - Deliverable 4: Insight Agent (RAG with gold table row citations, fallback to "I don't know" for unsupported queries).
  - Deliverable 5: Hourly Pipeline & Dashboard (Daemon scheduling, `prefect_runs.csv`, freshness radar, 3D Risk Map).
  - Chapters 9, 12, 14: Business Model, Optimization Log, AI Use Log (`AI_Use_Log.md`).
- **Visual Assets**: Embed high-resolution screenshots from `frontend/design/` (Risk Map, Executive Overview, 8 Impacts Matrix, Pipeline Freshness, Trust Radar, Insight Agent) and evaluation figures from `pipeline/reports/figures/`. No animated GIF files.
- **Zero Hallucination Constraint**: Every metric, table count, and benchmark figure in `README.md` must match the DuckDB warehouse and verified test reports.

---

## Task List

### Phase 1: Asset Preparation & Deliverable Directory Audit
- [ ] Task 1: Prepare Logo and Asset Directory (`doc/assets/logo.jpeg` and `frontend/public/logo.jpeg`).
- [ ] Task 2: Audit and verify all 5 HackInsight deliverables and supplementary documentation in `doc/` against `hackathonguide.pdf`.

### Checkpoint: Foundation
- [ ] Logo file accessible in repository.
- [ ] All 5 deliverables present, organized, and confirmed in `doc/`.

### Phase 2: Root Submission README Creation
- [ ] Task 3: Author the comprehensive HackInsight Judging Submission `README.md` with badges, centered logo, executive abstract, and team roles.
- [ ] Task 4: Embed architectural diagrams, interactive UI screenshots, and ML benchmark tables ($Q_{10}/Q_{50}/Q_{90}$, MAE reduction, group fairness).
- [ ] Task 5: Add complete HackInsight Rubric Compliance Matrix and 2-command Judge Quickstart guide.

### Checkpoint: Deliverable Completeness
- [ ] `README.md` rendered cleanly at repository root.
- [ ] All screenshot and deliverable file links are valid and relative.

### Phase 3: Verification & Live Health Check
- [ ] Task 6: Run backend test suite (`pytest backend/tests`) to ensure 82/82 tests pass.
- [ ] Task 7: Verify frontend build (`npm run build`) and confirm live daemon health (FastAPI port 8002, Vite port 5173).

### Checkpoint: Complete
- [ ] All acceptance criteria met.
- [ ] System is 100% submission-ready for the HackInsight jury.

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Relative image path broken in GitHub markdown | Medium | Use standard repository-relative paths (`doc/assets/logo.jpeg`, `frontend/design/...`) verified locally |
| Metric discrepancy between README and DuckDB | High | Pull verified figures directly from `doc/MODEL_REPORT.md` and DuckDB `model_eval` table |
| Judge port collision | Low | Document explicit port mappings (FastAPI: 8002, Vite: 5173) and curl verification commands |
