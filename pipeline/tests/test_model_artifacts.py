from __future__ import annotations

from pathlib import Path

import pytest


def test_trained_artifacts_load() -> None:
    models_dir = Path("models") if Path("models").exists() else Path("pipeline/models")
    metrics = Path("reports/model_vs_baseline_metrics.json") if Path("reports/model_vs_baseline_metrics.json").exists() else Path("pipeline/reports/model_vs_baseline_metrics.json")
    if not models_dir.exists() or not metrics.exists():
        pytest.skip("training has not been executed in this environment")
    import json
    import joblib

    regressor = joblib.load(models_dir / "lightgbm_rainfall_regressor.joblib")
    classifier = joblib.load(models_dir / "lightgbm_inundation_classifier.joblib")
    quantiles = joblib.load(models_dir / "quantile_regressors.joblib")
    payload = json.loads(metrics.read_text(encoding="utf-8"))
    assert hasattr(regressor, "predict")
    assert hasattr(classifier, "predict_proba")
    assert set(quantiles) >= {0.1, 0.5, 0.9}
    assert payload["baseline_declared"].startswith("24h persistence")
    assert payload["train_rows"] > 0
    assert payload["test_rows"] > 0
    assert "mae_improvement_pct" in payload
    assert payload["train_period"].startswith("2021")
    assert payload["test_period"].startswith("2025")
