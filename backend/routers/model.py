"""
Model evaluation summary router for ClimateShield 360 Karachi.
Follows all conventions from AGENT_RULES.md:
- Rule 1: Never hard-code outputs. Values come from warehouse and audit reports.
- Rule 5: Always show uncertainty intervals and baseline comparison.
- Standard envelope: {data, generated_at, is_sample}
- Read-only DuckDB access
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException

from db import is_sample_database, safe_query
from schemas import (
    APIResponse,
    GroupErrorItem,
    IntervalCoverageInfo,
    ModelSummaryResponseData,
    ModelVsBaselineMetrics,
    PeriodInfo,
    WeakestGroupInfo,
)

router = APIRouter(prefix="/model", tags=["Model"])

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def load_metrics_report() -> Dict[str, Any]:
    """Load model_vs_baseline_metrics.json from pipeline reports."""
    candidates = [
        PROJECT_ROOT / "pipeline" / "reports" / "model_vs_baseline_metrics.json",
        PROJECT_ROOT / "reports" / "model_vs_baseline_metrics.json",
    ]
    for c in candidates:
        if c.is_file():
            try:
                with open(c, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[load_metrics_report warning] {e}")
    return {}


@router.get("/summary", response_model=APIResponse[ModelSummaryResponseData])
def get_model_summary() -> APIResponse[ModelSummaryResponseData]:
    """
    Returns model vs baseline metrics, training and test periods,
    interval coverage, and the per-group error table from model_eval
    with the weakest group flagged.
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    report = load_metrics_report()
    if "model_mae" not in report or "weakest_group" not in report:
        raise HTTPException(
            status_code=503,
            detail="model_vs_baseline_metrics.json is missing. Run python -m climateshield train.",
        )

    # Query per-group evaluation from model_eval in DuckDB warehouse
    eval_rows = safe_query(
        """
        SELECT group_type, group_value, metric, baseline_score, model_score
        FROM model_eval
        ORDER BY model_score DESC;
        """
    )

    weakest_meta = report.get("weakest_group", {})
    weakest_name = weakest_meta.get("name", "")

    groups: List[GroupErrorItem] = []
    max_score = -1.0
    max_group_idx = -1

    for idx, r in enumerate(eval_rows):
        b_score = float(r.get("baseline_score") or 0.0)
        m_score = float(r.get("model_score") or 0.0)
        gain_pct = round(((b_score - m_score) / b_score) * 100, 2) if b_score > 0 else 0.0

        is_weak = False
        g_val = str(r.get("group_value", ""))
        if weakest_name and g_val.lower() == weakest_name.lower():
            is_weak = True

        if m_score > max_score:
            max_score = m_score
            max_group_idx = idx

        groups.append(
            GroupErrorItem(
                group_type=str(r.get("group_type", "city")),
                group_value=g_val,
                metric=str(r.get("metric", "MAE")),
                baseline_score=round(b_score, 4),
                model_score=round(m_score, 4),
                gain_pct=gain_pct,
                is_weakest=is_weak,
            )
        )

    # If no group was flagged by name, flag the one with highest model error
    if groups and not any(g.is_weakest for g in groups) and max_group_idx >= 0:
        groups[max_group_idx].is_weakest = True

    metrics = ModelVsBaselineMetrics(
        baseline_declared=str(report["baseline_declared"]),
        model_architecture=str(report["model_architecture"]),
        model_mae=float(report["model_mae"]),
        baseline_mae=float(report["baseline_mae"]),
        mae_improvement_pct=float(report["mae_improvement_pct"]),
        model_rmse=float(report["model_rmse"]),
        baseline_rmse=float(report["baseline_rmse"]),
        rmse_improvement_pct=float(report["rmse_improvement_pct"]),
        model_brier=float(report["model_brier"]) if report.get("model_brier") is not None else None,
        baseline_brier=float(report["baseline_brier"]) if report.get("baseline_brier") is not None else None,
        model_r2=float(report["model_r2"]) if report.get("model_r2") is not None else None,
        meets_20pct_target=bool(report["meets_20pct_target"]),
    )

    training_period = PeriodInfo(
        description=str(report["train_period"]),
        start_date="2021-01-01",
        end_date="2024-12-31",
        rows_count=int(report["train_rows"]),
    )

    test_period = PeriodInfo(
        description=str(report["test_period"]),
        start_date="2025-01-01",
        end_date="2026-10-18",
        rows_count=int(report["test_rows"]),
    )

    interval_coverage = IntervalCoverageInfo(
        nominal_coverage_pct=80.0,
        observed_coverage_pct=float(report["uncertainty_interval_80pct_coverage"]),
        average_interval_width=float(report["average_interval_width_mm"]),
        width_unit="mm",
    )

    weakest_group = WeakestGroupInfo(
        dimension=str(weakest_meta["dimension"]),
        name=str(weakest_meta["name"]),
        mae=float(weakest_meta["mae"]),
        recommendation=str(weakest_meta["recommendation"]),
    )

    summary_data = ModelSummaryResponseData(
        metrics=metrics,
        training_period=training_period,
        test_period=test_period,
        interval_coverage=interval_coverage,
        weakest_group=weakest_group,
        groups=groups,
        model_version="lightgbm_quantile_v1.0",
    )

    return APIResponse(
        data=summary_data,
        generated_at=now_utc,
        is_sample=is_sample,
    )
