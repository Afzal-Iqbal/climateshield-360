# Deliverable 3: Predictive Model vs Declared Baseline Report

**Generated:** 2026-10-20 03:17:42 UTC  
**Track:** Climate (Rainfall & Road Inundation)  
**Evaluation Horizon:** 2025–2026 untouched future test set (189,276 records)

---

## 1. Executive Metric Summary

| Metric | Declared Persistence Baseline | LightGBM ML Model | Relative Improvement | HackInsight Milestone |
|---|---|---|---|---|
| **Rainfall MAE** | `0.1055 mm` | `0.0685 mm` | **`+35.09%`** | PASSED (>= 20%) |
| **Rainfall RMSE** | `0.6415 mm` | `0.3978 mm` | **`+38.00%`** | Significant reduction |
| **Caution-event Brier (rain >= 2.5 mm)** | `0.0125` | `0.0053` | **`+57.32%`** | PASSED (>= 20%) |
| **Forecast Explanatory Power (R^2)** | `0.0000` | `0.3003` | - | Strong predictive signal |

## 2. Uncertainty Quantification (Prediction Intervals)

- **Quantile Framework:** Multi-quantile LightGBM (`alpha = 0.10, 0.50, 0.90`).
- **Empirical 80% Coverage:** `97.42%` of test observations fall within the predicted $[Q_10, Q_90]$ range.
- **Average Uncertainty Band Width:** `0.11 mm`.
- **Operational Interpretation for Primary Users:** Traffic Police and Rescue 1122 receive a confidence band. If $Q_{90} > 15\text{ mm/hr}$, precautionary road diversions are initiated even if the median $Q_{50}$ remains modest.

## 3. Disaggregated Group Fairness Analysis

### Fairness by Metropolitan City

| City | Province | Test Records | Baseline MAE | Model MAE | Improvement |
|---|---|---|---|---|---|
| Islamabad | Islamabad Capital Territory | 15,773 | 0.2211 mm | 0.1376 mm | **+37.77%** |
| Rawalpindi | Punjab | 15,773 | 0.2068 mm | 0.1295 mm | **+37.37%** |
| Gilgit | Gilgit-Baltistan | 15,773 | 0.2329 mm | 0.1219 mm | **+47.66%** |
| Lahore | Punjab | 15,773 | 0.1739 mm | 0.1117 mm | **+35.78%** |
| Peshawar | Khyber Pakhtunkhwa | 15,773 | 0.1460 mm | 0.0943 mm | **+35.45%** |
| Faisalabad | Punjab | 15,773 | 0.0910 mm | 0.0670 mm | **+26.39%** |
| Karachi | Sindh | 15,773 | 0.0472 mm | 0.0393 mm | **+16.77%** |
| Multan | Punjab | 15,773 | 0.0441 mm | 0.0365 mm | **+17.11%** |
| Quetta | Balochistan | 15,773 | 0.0399 mm | 0.0263 mm | **+34.17%** |
| Hyderabad | Sindh | 15,773 | 0.0292 mm | 0.0256 mm | **+12.17%** |
| Sukkur | Sindh | 15,773 | 0.0150 mm | 0.0161 mm | **-7.14%** |
| Gwadar | Balochistan | 15,773 | 0.0185 mm | 0.0157 mm | **+15.04%** |

> **Highest-error city:** **`Islamabad`** with model MAE `0.1376 mm`.
> **Cities where the model loses to persistence:** Sukkur (-7.14%). Treat those forecasts as no better than yesterday's rain.

