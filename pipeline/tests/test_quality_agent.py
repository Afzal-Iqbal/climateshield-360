from __future__ import annotations

import pandas as pd
from pandera.pandas import Check, Column, DataFrameSchema

from climateshield.quality.agent import DataQualityAgent, Finding, choose_action
from climateshield.quality.logger import QualityLogger
from climateshield.quality.rules import RULES


def _agent() -> DataQualityAgent:
    return DataQualityAgent(QualityLogger())


def test_choose_action_matrix() -> None:
    assert choose_action(Finding("wx", "weather_hourly", "hourly_short_gap", "temperature_2m_c", 2, False, "gap")) == "fill"
    assert choose_action(Finding("wx", "weather_hourly", "dtype", "timestamp_utc", 1, False, "cast")) == "fix"
    assert choose_action(Finding("wx", "weather_hourly", "greater_than_or_equal_to", "precipitation_mm", 3, False, "neg")) == "flag"
    assert choose_action(Finding("wx", "weather_hourly", "schema", "", 10, True, "ok")) == "keep"


def test_short_gap_rule_is_fill() -> None:
    rule = next(r for r in RULES if r["rule_id"] == "WX.SHORT_GAP_FILL")
    assert rule["action"] == "fill"


def test_fill_short_hourly_gaps_marks_and_skips_rain() -> None:
    stamps = pd.date_range("2021-01-01", periods=8, freq="h", tz="UTC")
    frame = pd.DataFrame(
        {
            "city": ["Multan"] * 8,
            "timestamp_utc": stamps,
            "temperature_2m_c": [20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0],
            "precipitation_mm": [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            "relative_humidity_pct": [40.0] * 8,
            "quality_flags": [""] * 8,
        }
    )
    gappy = frame.drop(index=[3, 4]).reset_index(drop=True)
    agent = _agent()
    filled = agent.fill_short_hourly_gaps(gappy, dataset="01_open_meteo_heat_rainfall")
    assert len(filled) == 8
    new_rows = filled[filled["value_was_filled"] == True]  # noqa: E712
    assert len(new_rows) == 2
    assert new_rows["temperature_2m_c"].notna().all()
    assert new_rows["precipitation_mm"].isna().all()
    assert new_rows["quality_flags"].str.contains("filled_short_gap").all()
    fill_logs = [d for d in agent.logger.decisions if d.action == "fill"]
    assert fill_logs
    assert fill_logs[0].n_rows == 2


def test_long_gap_is_flagged_not_filled() -> None:
    stamps = pd.date_range("2021-01-01", periods=20, freq="h", tz="UTC")
    frame = pd.DataFrame(
        {
            "city": ["Karachi"] * 20,
            "timestamp_utc": stamps,
            "temperature_2m_c": list(range(20)),
            "precipitation_mm": [0.0] * 20,
            "quality_flags": [""] * 20,
        }
    )
    gappy = frame.drop(index=list(range(5, 16))).reset_index(drop=True)
    agent = _agent()
    out = agent.fill_short_hourly_gaps(gappy, dataset="01_open_meteo_heat_rainfall")
    assert len(out) == len(gappy)
    assert not bool(out["value_was_filled"].any())
    actions = {d.rule_id: d.action for d in agent.logger.decisions}
    assert actions["PANDERA.hourly_short_gap"] == "fill"
    assert agent.logger.decisions[0].n_rows == 0
    assert actions["PANDERA.hourly_long_gap"] == "flag"


def test_run_schema_flags_negative_precip() -> None:
    schema = DataFrameSchema(
        {"precipitation_mm": Column(float, Check.ge(0), nullable=True, coerce=True)},
        coerce=True,
        strict=False,
    )
    frame = pd.DataFrame({"precipitation_mm": [0.0, -1.0, 2.0]})
    agent = _agent()
    ok = agent.run_schema(frame, schema, dataset="wx", table="weather_hourly")
    assert ok is False
    assert any(d.action == "flag" and d.n_rows >= 1 for d in agent.logger.decisions)


def test_audit_gold_flags_crop_all_zero() -> None:
    weather = pd.DataFrame(
        {
            "row_id": ["Multan|2023-01-01T00:00:00Z"],
            "city": ["Multan"],
            "timestamp_utc": [pd.Timestamp("2023-01-01", tz="UTC")],
            "temperature_2m_c": [41.0],
            "precipitation_mm": [0.0],
            "relative_humidity_pct": [20.0],
            "quality_flags": [""],
        }
    )
    district = pd.DataFrame(
        {
            "row_id": ["district|PK601"],
            "ADM2_PCODE": ["PK601"],
            "region_name": ["Punjab"],
            "pbs_total_pop": [1000],
        }
    )
    flood = pd.DataFrame(
        {
            "ADM2_PCODE": ["PK601"],
            "RP10_crops_30cm": [0.0],
            "RP50_crops_30cm": [0.0],
        }
    )
    agent = _agent()
    summary = agent.audit_gold(
        {
            "weather_hourly": weather,
            "district_snapshot": district,
            "osm_flood_exposure": flood,
        }
    )
    assert summary["tool"] == "pandera"
    assert summary["tables_checked"] >= 2
    crop = next(f for f in summary["findings"] if f["check_id"] == "crop_flood_all_zero")
    assert crop["action"] == "flag"
    heat = next(f for f in summary["findings"] if f["check_id"] == "extreme_heat_kept")
    assert heat["action"] == "keep"
    pesh = [f for f in summary["findings"] if f["check_id"] == "peshawar_coverage"]
    assert pesh == []
