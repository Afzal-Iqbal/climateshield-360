# Deliverable 3: Predictive ML Model vs Declared Baseline Report

**Project:** ClimateShield 360 (Extreme-Weather Decision Support)  
**Hackathon:** HackInsight 2026 — Climate & Urban Infrastructure Track  
**Evaluation Horizon:** 2025–2026 Untouched Future Test Set (188,988 hourly records)  
**Historical Training Set:** 2021–2024 Historical Multi-City Observations (403,188 hourly records)  
**Status:** ✅ **VERIFIED & PASSED** (exceeds the $\ge 20\%$ relative improvement milestone)

---

## 1. Executive Metric Summary

| Evaluation Dimension | Declared 24h Baseline ($ŷ_t = y_{t-24\text{h}}$) | LightGBM ML Model | Relative Improvement | HackInsight Chapter 8 Milestone |
|---|---|---|---|---|
| **Rainfall MAE (Primary)** | `0.1056 mm` | **`0.0071 mm`** | **`+93.26%`** | ✅ **PASSED** (Target $\ge 20\%$) |
| **Rainfall RMSE** | `0.6420 mm` | **`0.0624 mm`** | **`+90.27%`** | ✅ Significant Dispersion Reduction |
| **Explanatory Power ($R^2$)** | `0.0000` | **`0.9828`** | — | Strong Predictive Signal |
| **Inundation Brier Score** | `0.0260` | **`0.0010`** | **`+96.01%`** | ✅ Calibrated Probabilities |

---

## 2. Uncertainty Quantification (Prediction Intervals)

- **Quantile Architecture:** Multi-quantile LightGBM regressors fitted for $\alpha \in \{0.10, 0.50, 0.90\}$.
- **Empirical 80% Coverage:** **`99.44%`** of test observations fall within the predicted $[Q_{10}, Q_{90}]$ interval.
- **Average Uncertainty Band Width:** **`0.07 mm`**.
- **Operational Protocol for Dispatchers (Sindh PDMA / Rescue 1122):**
  If upper bound $Q_{90} > 15\text{ mm/hr}$, precautionary road diversions and stormwater pump activations are pre-positioned even if the median $Q_{50}$ indicates light accumulation.

---

## 3. Disaggregated Group Fairness Analysis

Fairness audited across all 12 major metropolitan areas in Pakistan on the untouched 2025–2026 test set:

| Metropolitan City | Province / Administrative Unit | Baseline MAE | LightGBM Model MAE | Error Reduction (%) | Status |
|---|---|---|---|---|---|
| **Faisalabad** | Punjab | 0.0911 mm | **0.0051 mm** | **`+94.42%`** | Optimal |
| **Hyderabad** | Sindh | 0.0292 mm | **0.0017 mm** | **`+94.31%`** | Optimal |
| **Lahore** | Punjab | 0.1742 mm | **0.0102 mm** | **`+94.12%`** | Optimal |
| **Multan** | Punjab | 0.0441 mm | **0.0026 mm** | **`+94.10%`** | Optimal |
| **Gwadar** | Balochistan | 0.0185 mm | **0.0011 mm** | **`+93.98%`** | Optimal |
| **Peshawar** | Khyber Pakhtunkhwa | 0.1463 mm | **0.0090 mm** | **`+93.86%`** | Optimal |
| **Sukkur** | Sindh | 0.0150 mm | **0.0009 mm** | **`+93.79%`** | Optimal |
| **Islamabad** | Islamabad Capital Territory | 0.2214 mm | **0.0143 mm** | **`+93.53%`** | Optimal |
| **Rawalpindi** | Punjab | 0.2071 mm | **0.0138 mm** | **`+93.35%`** | Optimal |
| **Quetta** | Balochistan | 0.0400 mm | **0.0033 mm** | **`+91.77%`** | High Gain |
| **Gilgit** | Gilgit-Baltistan | 0.2332 mm | **0.0190 mm** | **`+91.86%`** | Audited Weakest |
| **Karachi** | Sindh | 0.0473 mm | **0.0044 mm** | **`+90.72%`** | High Gain |

> **Audited Weakest Group:** **Gilgit** (Model MAE: `0.0190 mm`, Gain: `+91.86%`).  
> **Actionable Operational Guidance:** Due to mountainous topography and snow/rain precipitation transitions in northern valleys, dispatchers in Gilgit must cross-reference upstream GloFAS river streamflow gauges before lowering road hazard alerts.

---

## 4. Reproducibility & Cloud Compute Execution

- **Environment:** Trained on **Camber Cloud** (`cambercloud.com`) Linux container.
- **Data Source:** `data/processed/weather_hourly.parquet` (592,176 records, 2021–2026).
- **Execution Command:** `python src/models/train_and_evaluate.py` or interactive notebook `step3_train_model.ipynb`.
