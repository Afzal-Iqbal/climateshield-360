"""
Pipeline & Freshness router for ClimateShield 360.
Implements:
- GET /api/status: Latest run, is_late (>90m), latest quality summary counts (fix/fill/flag)
- GET /api/freshness: Source freshness with computed SLA status (Fresh <=1x, Late <=3x, Stale >3x)
- GET /api/runs: Run execution history for the last N hours (default 24h)
- GET /api/model-eval: Model vs baseline evaluation with weakest group flagged
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Query

from db import is_sample_database, safe_query
from schemas import (
    APIResponse,
    FreshnessResponseData,
    FreshnessSummary,
    ModelEvalExtended,
    ModelEvalResponseData,
    PipelineStatusData,
    QualitySummaryCounts,
    RunStatusExtended,
    SourceFreshnessComputed,
)

router = APIRouter(tags=["Pipeline & Freshness"])


def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Ensure datetime has UTC timezone."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.get("/status", response_model=APIResponse[PipelineStatusData])
def get_pipeline_status() -> APIResponse[PipelineStatusData]:
    """
    GET /api/status
    Returns latest successful run, whether it is late (>90m),
    and quality summary counts (fix/fill/flag) from the newest quality_log batch.
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    # 1. Fetch latest successful run
    succ_rows = safe_query(
        "SELECT run_id, started_at, finished_at, status, notes "
        "FROM run_status WHERE status = 'success' "
        "ORDER BY started_at DESC LIMIT 1;"
    )

    # 2. Fetch absolute latest run (could be failed or running)
    latest_rows = safe_query(
        "SELECT run_id, started_at, finished_at, status, notes "
        "FROM run_status ORDER BY started_at DESC LIMIT 1;"
    )

    latest_succ_run: Optional[RunStatusExtended] = None
    minutes_since_success: Optional[float] = None
    is_late = True

    if succ_rows:
        r = succ_rows[0]
        start_dt = _ensure_utc(r.get("started_at"))
        finish_dt = _ensure_utc(r.get("finished_at"))
        dur = (finish_dt - start_dt).total_seconds() if finish_dt and start_dt else None

        latest_succ_run = RunStatusExtended(
            run_id=r["run_id"],
            started_at=start_dt,
            finished_at=finish_dt,
            status=r["status"],
            duration_seconds=dur,
            notes=r.get("notes"),
            is_latest=True,
        )

        if start_dt:
            diff_sec = (now_utc - start_dt).total_seconds()
            minutes_since_success = max(0.0, diff_sec / 60.0)
            is_late = minutes_since_success > 90.0

    latest_run: Optional[RunStatusExtended] = None
    if latest_rows:
        r = latest_rows[0]
        start_dt = _ensure_utc(r.get("started_at"))
        finish_dt = _ensure_utc(r.get("finished_at"))
        dur = (finish_dt - start_dt).total_seconds() if finish_dt and start_dt else None

        latest_run = RunStatusExtended(
            run_id=r["run_id"],
            started_at=start_dt,
            finished_at=finish_dt,
            status=r["status"],
            duration_seconds=dur,
            notes=r.get("notes"),
            is_latest=True,
        )

    # Determine overall status indicator
    if not latest_succ_run or (latest_run and latest_run.status == "failed"):
        status_indicator = "failed"
    elif is_late:
        status_indicator = "late"
    else:
        status_indicator = "ok"

    # 3. Fetch quality summary counts from newest quality_log batch
    max_batch = safe_query("SELECT MAX(logged_at) as latest_time FROM quality_log;")
    quality_summary = QualitySummaryCounts()

    if max_batch and max_batch[0].get("latest_time"):
        latest_batch_time = max_batch[0]["latest_time"]
        counts_rows = safe_query(
            "SELECT action, SUM(rows_affected) as total_rows, COUNT(*) as rule_count "
            "FROM quality_log WHERE logged_at = ? GROUP BY action;",
            [latest_batch_time],
        )

        total_rules = 0
        total_actions = 0
        for cr in counts_rows:
            action = (cr.get("action") or "").lower()
            rows_aff = int(cr.get("total_rows") or 0)
            rules_cnt = int(cr.get("rule_count") or 0)
            total_rules += rules_cnt
            total_actions += rows_aff

            if action == "fix":
                quality_summary.fix = rows_aff
            elif action == "fill":
                quality_summary.fill = rows_aff
            elif action == "flag":
                quality_summary.flag = rows_aff

        quality_summary.total_actions = total_actions
        quality_summary.rules_audited = total_rules

    data = PipelineStatusData(
        latest_successful_run=latest_succ_run,
        latest_run=latest_run,
        is_late=is_late,
        minutes_since_last_success=round(minutes_since_success, 1) if minutes_since_success is not None else None,
        status_indicator=status_indicator,
        quality_summary=quality_summary,
    )

    return APIResponse(
        data=data,
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/freshness", response_model=APIResponse[FreshnessResponseData])
def get_source_freshness() -> APIResponse[FreshnessResponseData]:
    """
    GET /api/freshness
    Returns source_freshness rows with dynamically computed status:
    - Fresh: <= 1.0x expected_every_minutes
    - Late:  <= 3.0x expected_every_minutes
    - Stale: >  3.0x expected_every_minutes
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    rows = safe_query(
        "SELECT source_name, publisher, licence, last_fetched_at, expected_every_minutes, status "
        "FROM source_freshness ORDER BY last_fetched_at DESC;"
    )

    sources: List[SourceFreshnessComputed] = []
    fresh_cnt = 0
    late_cnt = 0
    stale_cnt = 0

    for r in rows:
        last_dt = _ensure_utc(r.get("last_fetched_at"))
        expected_min = max(1, int(r.get("expected_every_minutes") or 60))

        if last_dt:
            mins_since = max(0.0, (now_utc - last_dt).total_seconds() / 60.0)
        else:
            mins_since = 999999.0

        ratio = mins_since / expected_min
        delay_min = max(0.0, mins_since - expected_min)

        if ratio <= 1.0:
            comp_status = "Fresh"
            fresh_cnt += 1
        elif ratio <= 3.0:
            comp_status = "Late"
            late_cnt += 1
        else:
            comp_status = "Stale"
            stale_cnt += 1

        sources.append(
            SourceFreshnessComputed(
                source_name=r["source_name"],
                publisher=r["publisher"],
                licence=r["licence"],
                last_fetched_at=last_dt or now_utc,
                expected_every_minutes=expected_min,
                stored_status=r.get("status", "unknown"),
                computed_status=comp_status,
                minutes_since_fetch=round(mins_since, 1),
                ratio=round(ratio, 2),
                delay_minutes=round(delay_min, 1),
            )
        )

    total = len(sources)
    avail_pct = round((fresh_cnt / total * 100.0), 1) if total > 0 else 0.0

    return APIResponse(
        data=FreshnessResponseData(
            sources=sources,
            summary=FreshnessSummary(
                total=total,
                fresh=fresh_cnt,
                late=late_cnt,
                stale=stale_cnt,
                availability_pct=avail_pct,
            ),
        ),
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/runs", response_model=APIResponse[List[RunStatusExtended]])
def get_recent_runs(
    hours: int = Query(24, ge=1, le=168, description="History window in hours")
) -> APIResponse[List[RunStatusExtended]]:
    """
    GET /api/runs?hours=24
    Returns run_status rows for the last N hours chronologically.
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()
    cutoff_naive = (now_utc - timedelta(hours=hours)).replace(tzinfo=None)

    rows = safe_query(
        "SELECT run_id, started_at, finished_at, status, notes "
        "FROM run_status WHERE started_at >= ? "
        "ORDER BY started_at ASC;",
        [cutoff_naive],
    )

    runs: List[RunStatusExtended] = []
    total_rows = len(rows)

    for idx, r in enumerate(rows):
        start_dt = _ensure_utc(r.get("started_at"))
        finish_dt = _ensure_utc(r.get("finished_at"))
        dur = (finish_dt - start_dt).total_seconds() if finish_dt and start_dt else None

        runs.append(
            RunStatusExtended(
                run_id=r["run_id"],
                started_at=start_dt,
                finished_at=finish_dt,
                status=r["status"],
                duration_seconds=dur,
                notes=r.get("notes"),
                is_latest=(idx == total_rows - 1),
            )
        )

    return APIResponse(
        data=runs,
        generated_at=now_utc,
        is_sample=is_sample,
    )


@router.get("/model-eval", response_model=APIResponse[ModelEvalResponseData])
def get_model_evaluation() -> APIResponse[ModelEvalResponseData]:
    """
    GET /api/model-eval
    Returns model_eval rows with error reduction vs baseline,
    and flags the weakest group (largest model error).
    """
    now_utc = datetime.now(timezone.utc)
    is_sample = is_sample_database()

    rows = safe_query(
        "SELECT group_type, group_value, metric, baseline_score, model_score "
        "FROM model_eval ORDER BY group_type, model_score DESC;"
    )

    evaluations: List[ModelEvalExtended] = []
    overall_baseline: Optional[float] = None
    overall_model: Optional[float] = None

    # Identify the weakest group (highest model error among segmented groups)
    max_error = -1.0
    weakest_idx = -1

    for idx, r in enumerate(rows):
        base_s = float(r["baseline_score"])
        mod_s = float(r["model_score"])
        group_type = r.get("group_type", "")
        group_val = r.get("group_value", "")

        reduction = None
        if base_s > 0:
            reduction = round(((base_s - mod_s) / base_s) * 100.0, 1)

        if group_type == "overall":
            overall_baseline = base_s
            overall_model = mod_s

        # Candidate for weakest group (ignore overall row to find sub-group)
        if group_type != "overall" and "MAE" in r.get("metric", ""):
            if mod_s > max_error:
                max_error = mod_s
                weakest_idx = idx

        evaluations.append(
            ModelEvalExtended(
                group_type=group_type,
                group_value=group_val,
                metric=r["metric"],
                baseline_score=base_s,
                model_score=mod_s,
                error_reduction_pct=reduction,
                is_weakest=False,
            )
        )

    # Flag weakest group
    weakest_obj: Optional[ModelEvalExtended] = None
    if weakest_idx >= 0 and weakest_idx < len(evaluations):
        evaluations[weakest_idx].is_weakest = True
        weakest_obj = evaluations[weakest_idx]

    overall_reduction = None
    if overall_baseline and overall_baseline > 0 and overall_model is not None:
        overall_reduction = round(((overall_baseline - overall_model) / overall_baseline) * 100.0, 1)

    return APIResponse(
        data=ModelEvalResponseData(
            evaluations=evaluations,
            weakest_group=weakest_obj,
            overall_baseline_mae=overall_baseline,
            overall_model_mae=overall_model,
            overall_reduction_pct=overall_reduction,
        ),
        generated_at=now_utc,
        is_sample=is_sample,
    )
