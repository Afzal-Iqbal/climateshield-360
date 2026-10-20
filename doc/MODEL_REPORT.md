# Model report

Evidence file: `pipeline/reports/model_vs_baseline_metrics.json` (`timestamp_utc` 2026-10-19T14:51:31Z). Artifacts on disk:

- `pipeline/models/lightgbm_rainfall_regressor.joblib`
- `pipeline/models/quantile_regressors.joblib`
- `pipeline/models/lightgbm_inundation_classifier.joblib` (present beside the regressor; this session's inference script loaded the quantile file)

`src/models/train_and_evaluate.py` was not run in this session. Training is not re-declared as something that happened today.

## Task

- Target in the metrics file: rainfall amount, compared with a declared 24-hour persistence baseline `y_hat_t = y_{t-24h}`.
- A second score in the same file is an inundation Brier score. The model Brier score is worse than the baseline.
- Inference script `src/models/predict.py` writes the next hour's rainfall quantiles and `P(rain >= 2.5 mm/h)` for each monitored city.
- Heat is not a model output. `/api/forecast?hazard=heat` returns observations and thresholds only.

## Split recorded in the metrics file

- Train: 2021-01-01 to 2024-12-31, 403,188 rows.
- Test: 2025-01-01 to 2026-10-18, 189,168 rows.
- This session did not re-check leakage inside the training script. The file says the test period starts after the train period.

## Metrics in the saved file

| Metric | Baseline | Model |
|---|---|---|
| Rainfall MAE | 0.1055 mm | 0.0685 mm (35.1% lower error) |
| Rainfall RMSE | 0.6417 mm | 0.3979 mm |
| R² | — | 0.3003 |
| Inundation Brier | 0.0153 | 0.0351 (worse; change -129.37%) |
| Share of test points inside the 10th–90th percentile band | — | 97.42% |
| Average band width | — | 0.11 mm |

Weakest city in that file and in `fairness_by_group.csv`: **Islamabad**, model MAE 0.1377 mm, baseline MAE 0.2212 mm. Sukkur is the city where the model MAE is worse than persistence (0.0161 vs 0.0150).

`doc/AI_Use_Log.md` entry 2 says the improvement was 93.26% and Gilgit was weakest. Those figures do not match this JSON or CSV. Use the JSON and CSV.

## Inference executed in this session

Command:

`python src/models/predict.py --db-path pipeline/data/processed/climateshield.duckdb`

Result: exit code 0, 12 rows, one per city, model version `lightgbm_quantile_v1.0`, forecast time `2026-10-20T00:00:00+00:00` as printed by the script.

Karachi row stored in DuckDB: probability 0.0082, interval 0.0 to 0.0, median 0.0, baseline 0.0. Gilgit median was 0.112 mm with interval 0.0 to 0.1626. These are the stored outputs, not dashboard placeholders.

## Limitations

- The rainfall model can beat persistence on MAE and still be a poor inundation probability model. The Brier score says that openly.
- A 0.0 mm median with a small exceedance probability is easy to misread as "no uncertainty." The stored 10th and 90th percentiles for several cities are also 0.0.
- Group errors are by city, from the saved fairness file. This session did not recompute seasonal or district errors.
- The test set was not refit or retuned here.
