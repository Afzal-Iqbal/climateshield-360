from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from climateshield.config import (
    CLEANED_DIR,
    PROCESSED_DIR,
    QUALITY_LOGS_PATH,
    QUALITY_REPORT_PATH,
    RAW_DATASETS,
    WAREHOUSE_PATH,
    ZIP_ARCHIVE,
)
from climateshield.io_utils import sha256_file


def test_zip_archive_is_present() -> None:
    assert ZIP_ARCHIVE.exists()


def test_make_data_rebuilds_layers() -> None:
    if not ZIP_ARCHIVE.exists():
        pytest.skip("source zip missing")
    raw_before = {
        path.relative_to(RAW_DATASETS).as_posix(): sha256_file(path)
        for path in RAW_DATASETS.rglob("*")
        if path.is_file()
    } if RAW_DATASETS.exists() else {}

    from climateshield.pipeline.run import make_data

    report = make_data()
    assert report["raw_files_unchanged"] is True
    assert report["gold_tables"]["weather_hourly_rows"] >= 500_000
    assert report["gold_tables"]["district_snapshot_rows"] == 160
    assert QUALITY_REPORT_PATH.exists()
    assert QUALITY_LOGS_PATH.exists()
    assert (PROCESSED_DIR / "weather_hourly.parquet").exists()
    assert (PROCESSED_DIR / "district_snapshot.csv").exists()
    assert (CLEANED_DIR / "01_open_meteo_heat_rainfall" / "weather_hourly.parquet").exists()

    raw_after = {
        path.relative_to(RAW_DATASETS).as_posix(): sha256_file(path)
        for path in RAW_DATASETS.rglob("*")
        if path.is_file()
    }
    if raw_before:
        assert raw_after == raw_before

    logs = pd.read_csv(QUALITY_LOGS_PATH)
    assert set(["timestamp_utc", "dataset", "rule_id", "action", "n_rows", "reason"]).issubset(logs.columns)
    assert "fill" in set(logs["action"].unique())
    fill_rows = logs[logs["action"] == "fill"]
    assert (fill_rows["n_rows"] == 0).all()
    assert report["quality_agent"]["tool"] == "pandera"
    assert report["quality_agent"]["tables_checked"] >= 4
    assert any(item["check_id"] == "hourly_short_gap" for item in report["quality_agent"]["findings"])
    assert any(
        item["check_id"] == "crop_flood_all_zero" and item["action"] == "flag"
        for item in report["quality_agent"]["findings"]
    )

    weather = pd.read_parquet(PROCESSED_DIR / "weather_hourly.parquet", columns=["city", "timestamp_utc", "temperature_2m_c", "quality_flags"])
    peshawar = weather[weather["city"] == "Peshawar"]
    assert peshawar["timestamp_utc"].min() >= pd.Timestamp("2023-01-01", tz="UTC")
    assert (weather["temperature_2m_c"] >= 40).any()
    assert not weather.loc[weather["temperature_2m_c"] >= 40, "quality_flags"].str.contains("removed").any()

    flood = pd.read_csv(PROCESSED_DIR / "osm_flood_exposure.csv")
    assert not any("crops" in c for c in flood.columns)
    assert "crop_flood_layer_all_zero_source_unavailable" in ";".join(flood["quality_flags"].astype(str))
    excluded = pd.read_csv(PROCESSED_DIR / "excluded_columns.csv")
    assert excluded["column"].str.contains("crops").any()

    district = pd.read_csv(PROCESSED_DIR / "district_snapshot.csv")
    assert "pbs_total_pop" in district.columns
    assert not any("crops" in c for c in district.columns)
    assert district["row_id"].is_unique

    assert WAREHOUSE_PATH.exists()
    import duckdb

    con = duckdb.connect(str(WAREHOUSE_PATH), read_only=True)
    try:
        weather_n = con.execute("SELECT COUNT(*) FROM weather_hourly").fetchone()[0]
        district_n = con.execute("SELECT COUNT(*) FROM district_snapshot").fetchone()[0]
        assert weather_n == report["gold_tables"]["weather_hourly_rows"]
        assert district_n == 160
        assert "row_id" in [row[0] for row in con.execute("DESCRIBE weather_hourly").fetchall()]
    finally:
        con.close()
    assert report["warehouse"]["engine"] == "duckdb"


def test_quality_artifacts_exist_at_repo_root() -> None:
    rep = Path("quality_report.json") if Path("quality_report.json").exists() else Path("pipeline/quality_report.json")
    if not rep.exists():
        pytest.skip("pipeline has not been run in this environment")
    logs = Path("quality_logs.csv") if Path("quality_logs.csv").exists() else Path("pipeline/quality_logs.csv")
    assert logs.exists()
