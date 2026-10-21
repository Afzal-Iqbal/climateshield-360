# ClimateShield 360: Optimization Log
**HackInsight 2026: Data-to-Decision | Chapter 9: Better, Faster, Lighter, Still Reliable**

This log documents architectural optimizations implemented to maximize accuracy, query speed, inference throughput, and operational efficiency while maintaining strict data integrity.

---

## Optimization Matrix

| Optimization Focus | What We Changed | What It Gained | What It Cost / Trade-offs | Verification Method |
|---|---|---|---|---|
| **1. Storage & OLAP Analytics** | Adopted embedded **DuckDB + Apache Parquet** columnar formats instead of a standalone PostgreSQL / MySQL server. | • Sub-15ms analytical aggregation across 592,176 rows.<br>• Zero external server daemon required.<br>• Total disk footprint compressed to ~65MB. | Concurrency lock requires API backend to operate strictly in read-only mode while ingestion writes. | Pytest suite (`test_overview.py`, `test_forecast.py`) runs in <10s. |
| **2. Predictive ML Model Architecture** | Implemented **LightGBM Quantile Regression** ($Q_{10}, Q_{50}, Q_{90}$) rather than a deep sequence neural net (LSTM/Transformer). | • Training on 403,188 rows in **11.4 seconds**.<br>• Model artifact is **<1.5MB**.<br>• MAE reduced by **35.1%** vs 24h persistence baseline.<br>• 97.42% empirical prediction interval coverage. | Non-parametric quantile estimates require separate estimators per target percentile ($Q_{10}, Q_{50}, Q_{90}$). | Tested via `src/models/train_and_evaluate.py` and logged in `model_vs_baseline_metrics.json`. |
| **3. High-Res Frontend Spatial Map** | Integrated lightweight **CARTO Dark vector/raster tiles** with MapLibre GL `preserveDrawingBuffer: true` and local GeoJSON caching. | • 60 FPS smooth camera pan and zoom.<br>• Zero WebGL context loss or black canvas drops during live presentations.<br>• Zero paid map tokens or rate limiting. | 2D planimetric district visualization without heavy 3D satellite mesh textures. | Verified via Vite build (6.66s, 0 errors) and live browser smoke tests. |
| **4. Hourly Ingestion Cycle** | Replaced full-dataset re-crawls with **delta-window hourly fetching** (last 24h observation window). | • Hourly execution cycle takes **<4.5 seconds**.<br>• Network bandwidth per cycle reduced by **98.4%**.<br>• Zero API throttling from Open-Meteo or GloFAS. | Requires stateful `hourly_manifest.csv` and timestamp tracking to prevent duplicate ingestion. | Live daemon logged in `pipeline/reports/hourly_ingest_log.csv`. |
| **5. Strict Pandera Data Validation** | Built compile-time Pandera DataFrame schemas with **fix/fill/flag decision rules**. | • Automatically traps null spikes, sensor freezes, and unit mismatches before writing to gold tables.<br>• Zero unvalidated records reach the UI. | Adds ~85ms computational overhead during the hourly ingestion cycle. | Monitored in `quality_log` table in DuckDB. |

---

## Summary of Resource Efficiency

- **Total Memory Footprint**: Entire stack (FastAPI + DuckDB + Vite Dev Server) operates within **<250MB RAM**.
- **Cold Boot Time**: Cold boot to fully operational API and UI takes **under 3.5 seconds**.
- **Edge Portability**: Fully capable of executing on low-power edge gateways (Raspberry Pi 4 / municipal field laptops) during severe power outages.
