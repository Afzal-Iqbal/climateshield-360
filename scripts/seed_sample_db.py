"""
Seed script for ClimateShield 360 Karachi sample warehouse database.
Creates warehouse/sample.duckdb with all table contract schemas,
clearly labelled sample data, and the _is_sample marker table.

Rule 2: No synthetic data presented as real. Sample data comes only from
this script; the API reports is_sample=true.
Rule 3: Store time in UTC; display in PKT (UTC+5).
Rule 11: The API is read-only. Never write to the warehouse from API code.
"""

from datetime import datetime, timezone, timedelta
from pathlib import Path
import json
import duckdb

# Determine project root and output path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
WAREHOUSE_DIR = PROJECT_ROOT / "warehouse"
SAMPLE_DB_PATH = WAREHOUSE_DIR / "sample.duckdb"


def seed_database(db_path: Path = SAMPLE_DB_PATH):
    """Seed DuckDB with schema contract and verified sample data."""
    WAREHOUSE_DIR.mkdir(parents=True, exist_ok=True)

    # Remove existing sample db to ensure clean deterministic state
    if db_path.exists():
        db_path.unlink()

    conn = duckdb.connect(str(db_path))
    print(f"[seed_sample_db] Connected to {db_path}")

    now_utc = datetime.now(timezone.utc)

    # 1. _is_sample table (Internal flag)
    conn.execute(
        """
        CREATE TABLE _is_sample (
            is_sample BOOLEAN NOT NULL,
            created_at TIMESTAMP NOT NULL,
            note VARCHAR NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO _is_sample VALUES (
            TRUE,
            ?,
            'Synthetic demo sample data for ClimateShield 360 Karachi. For testing and demonstration only.'
        );
        """,
        [now_utc],
    )

    # 2. run_status(run_id, started_at, finished_at, status, notes)
    conn.execute(
        """
        CREATE TABLE run_status (
            run_id VARCHAR PRIMARY KEY,
            started_at TIMESTAMP NOT NULL,
            finished_at TIMESTAMP,
            status VARCHAR NOT NULL,
            notes VARCHAR
        );
        """
    )
    conn.execute(
        """
        INSERT INTO run_status VALUES
        (
            'RUN-20261019-01',
            ?,
            ?,
            'success',
            'Sample scheduled run: Ingested PMD Karachi Met, GFS 0.25, and Sindh PDMA feeder streams. All 18 zones evaluated.'
        ),
        (
            'RUN-20261018-02',
            ?,
            ?,
            'success',
            'Sample evening validation run completed with zero schema violations.'
        );
        """,
        [
            now_utc - timedelta(minutes=25),
            now_utc - timedelta(minutes=20),
            now_utc - timedelta(hours=14),
            now_utc - timedelta(hours=13, minutes=55),
        ],
    )

    # 3. source_freshness(source_name, publisher, licence, last_fetched_at, expected_every_minutes, status)
    conn.execute(
        """
        CREATE TABLE source_freshness (
            source_name VARCHAR PRIMARY KEY,
            publisher VARCHAR NOT NULL,
            licence VARCHAR NOT NULL,
            last_fetched_at TIMESTAMP NOT NULL,
            expected_every_minutes INTEGER NOT NULL,
            status VARCHAR NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO source_freshness VALUES
        ('PMD Karachi Met Station', 'Pakistan Meteorological Department', 'Government Open Data', ?, 30, 'fresh'),
        ('NOAA GFS 0.25 Atmosphere', 'NOAA NCEP', 'Public Domain (US Gov)', ?, 360, 'fresh'),
        ('ECMWF Open Data IFS', 'ECMWF', 'CC-BY-4.0', ?, 360, 'fresh'),
        ('Sindh PDMA Water Gauges', 'Sindh Disaster Management Authority', 'Institutional MOU', ?, 60, 'delayed'),
        ('K-Electric Grid Feeder Telemetry', 'K-Electric SCADA Cell', 'Restricted Operational', ?, 15, 'fresh'),
        ('Karachi Urban Drainage Sluices', 'Karachi Metropolitan Corporation', 'Municipal Public Record', ?, 120, 'stale');
        """,
        [
            now_utc - timedelta(minutes=14),
            now_utc - timedelta(hours=2, minutes=10),
            now_utc - timedelta(hours=3, minutes=45),
            now_utc - timedelta(minutes=85),
            now_utc - timedelta(minutes=7),
            now_utc - timedelta(hours=6, minutes=20),
        ],
    )

    # 4. quality_log(logged_at, source_name, rule, action[fix|fill|flag], rows_affected, explanation)
    conn.execute(
        """
        CREATE TABLE quality_log (
            logged_at TIMESTAMP NOT NULL,
            source_name VARCHAR NOT NULL,
            rule VARCHAR NOT NULL,
            action VARCHAR NOT NULL,
            rows_affected INTEGER NOT NULL,
            explanation VARCHAR NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO quality_log VALUES
        (?, 'PMD Karachi Met Station', 'Temperature Physical Bounds [-5C, 55C]', 'fix', 1, 'Sensor spike of 68.2C clamped to previous 15-min rolling mean of 42.1C'),
        (?, 'Sindh PDMA Water Gauges', 'Missing Sensor Timestamp Imputation', 'fill', 3, 'Linear interpolation on Malir River gauge depth during 10-minute packet loss'),
        (?, 'K-Electric Grid Feeder Telemetry', 'Rapid Voltage Drop Outlier Detection', 'flag', 4, 'Flagged 4 distribution feeders in Lyari showing atypical high variance load'),
        (?, 'NOAA GFS 0.25 Atmosphere', 'Geographic Bounding Box Karachi [24-26N, 66-68E]', 'fix', 0, 'Bounding box validation passed with zero out-of-boundary records');
        """,
        [
            now_utc - timedelta(minutes=22),
            now_utc - timedelta(minutes=45),
            now_utc - timedelta(hours=1, minutes=15),
            now_utc - timedelta(hours=3),
        ],
    )

    # 5. zones(zone_id, name, geometry_geojson)
    conn.execute(
        """
        CREATE TABLE zones (
            zone_id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            geometry_geojson TEXT NOT NULL
        );
        """
    )

    # Realistic GeoJSON features for major Karachi zones
    karachi_zones = [
        ("KHI-EAST", "Karachi East (Gulshan / Jamshed)", [[67.06, 24.89], [67.12, 24.89], [67.12, 24.94], [67.06, 24.94], [67.06, 24.89]]),
        ("KHI-SOUTH", "Karachi South (Saddar / Lyari / Clifton)", [[66.98, 24.80], [67.05, 24.80], [67.05, 24.87], [66.98, 24.87], [66.98, 24.80]]),
        ("KHI-CENTRAL", "Karachi Central (Nazimabad / Liaquatabad)", [[67.01, 24.90], [67.08, 24.90], [67.08, 24.98], [67.01, 24.98], [67.01, 24.90]]),
        ("KHI-KORANGI", "Korangi Industrial / Landhi", [[67.11, 24.79], [67.22, 24.79], [67.22, 24.86], [67.11, 24.86], [67.11, 24.79]]),
        ("KHI-MALIR", "Malir Basin / Gadap", [[67.15, 24.88], [67.35, 24.88], [67.35, 25.08], [67.15, 25.08], [67.15, 24.88]]),
        ("KHI-WEST", "Karachi West (Orangi / Site / Manghopir)", [[66.95, 24.91], [67.03, 24.91], [67.03, 25.02], [66.95, 25.02], [66.95, 24.91]]),
        ("KHI-KEAMARI", "Keamari & Karachi Port Coastline", [[66.90, 24.76], [67.02, 24.76], [67.02, 24.84], [66.90, 24.84], [66.90, 24.76]]),
    ]

    for zid, zname, coords in karachi_zones:
        geojson = json.dumps({
            "type": "Feature",
            "properties": {"zone_id": zid, "name": zname},
            "geometry": {"type": "Polygon", "coordinates": [coords]}
        })
        conn.execute(
            "INSERT INTO zones VALUES (?, ?, ?);",
            [zid, zname, geojson]
        )

    # 6. facilities(facility_id, type, name, zone_id, lat, lon)
    conn.execute(
        """
        CREATE TABLE facilities (
            facility_id VARCHAR PRIMARY KEY,
            type VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            zone_id VARCHAR NOT NULL,
            lat DOUBLE NOT NULL,
            lon DOUBLE NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO facilities VALUES
        ('FAC-HOSP-01', 'hospital', 'Jinnah Postgraduate Medical Centre (JPMC)', 'KHI-EAST', 24.8523, 67.0494),
        ('FAC-HOSP-02', 'hospital', 'Dr. Ruth K. M. Pfau Civil Hospital', 'KHI-SOUTH', 24.8587, 67.0097),
        ('FAC-HOSP-03', 'hospital', 'Abbasi Shaheed Hospital', 'KHI-CENTRAL', 24.9221, 67.0315),
        ('FAC-HOSP-04', 'hospital', 'Indus Hospital & Health Network', 'KHI-KORANGI', 24.8291, 67.1265),
        ('FAC-HOSP-05', 'hospital', 'Lyari General Hospital', 'KHI-SOUTH', 24.8690, 66.9940),
        ('FAC-GRID-01', 'power_substation', 'K-Electric Korangi Southern Grid', 'KHI-KORANGI', 24.8150, 67.1420),
        ('FAC-DRAIN-01', 'drainage_culvert', 'Lyari River Spillway Regulator', 'KHI-SOUTH', 24.8710, 66.9850),
        ('FAC-DRAIN-02', 'drainage_culvert', 'Malir River Causeway Outlet', 'KHI-MALIR', 24.8410, 67.1120),
        ('FAC-PORT-01', 'port_terminal', 'Karachi Port Trust Berth 5-10', 'KHI-KEAMARI', 24.8210, 66.9740);
        """
    )

    # 7. predictions(zone_id, forecast_time, hazard_type, probability, interval_low, interval_high, baseline_value)
    # Rule 5: Always show uncertainty intervals and baseline comparison where predictions appear.
    conn.execute(
        """
        CREATE TABLE predictions (
            zone_id VARCHAR NOT NULL,
            forecast_time TIMESTAMP NOT NULL,
            hazard_type VARCHAR NOT NULL,
            probability DOUBLE NOT NULL,
            interval_low DOUBLE NOT NULL,
            interval_high DOUBLE NOT NULL,
            baseline_value DOUBLE NOT NULL
        );
        """
    )

    # Forecast for next 6h, 12h, 24h, 48h
    time_horizons = [6, 12, 24, 48]
    for hours in time_horizons:
        f_time = now_utc + timedelta(hours=hours)
        conn.execute(
            """
            INSERT INTO predictions VALUES
            -- Heat hazard (Feels like / WBGT in °C, baseline normal is 35.5C)
            ('KHI-EAST', ?, 'heat', 0.88, 41.2, 45.8, 35.5),
            ('KHI-SOUTH', ?, 'heat', 0.76, 38.5, 43.1, 34.8),
            ('KHI-CENTRAL', ?, 'heat', 0.91, 42.0, 46.4, 35.8),
            ('KHI-KORANGI', ?, 'heat', 0.84, 40.5, 45.0, 35.2),
            ('KHI-MALIR', ?, 'heat', 0.94, 43.1, 47.5, 36.0),
            ('KHI-WEST', ?, 'heat', 0.82, 39.8, 44.5, 35.0),
            ('KHI-KEAMARI', ?, 'heat', 0.65, 36.2, 40.8, 33.5),

            -- Heavy rain hazard (Accumulated precipitation in mm, baseline normal is 5.0mm)
            ('KHI-EAST', ?, 'heavy_rain', 0.62, 18.0, 52.0, 5.0),
            ('KHI-SOUTH', ?, 'heavy_rain', 0.79, 32.0, 78.0, 6.0),
            ('KHI-CENTRAL', ?, 'heavy_rain', 0.58, 14.0, 46.0, 4.5),
            ('KHI-KORANGI', ?, 'heavy_rain', 0.85, 40.0, 95.0, 7.5),
            ('KHI-MALIR', ?, 'heavy_rain', 0.88, 48.0, 110.0, 8.0),
            ('KHI-WEST', ?, 'heavy_rain', 0.68, 22.0, 60.0, 5.2),
            ('KHI-KEAMARI', ?, 'heavy_rain', 0.72, 28.0, 70.0, 6.5);
            """,
            [f_time] * 14,
        )

    # 8. model_eval(group_type, group_value, metric, baseline_score, model_score)
    conn.execute(
        """
        CREATE TABLE model_eval (
            group_type VARCHAR NOT NULL,
            group_value VARCHAR NOT NULL,
            metric VARCHAR NOT NULL,
            baseline_score DOUBLE NOT NULL,
            model_score DOUBLE NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO model_eval VALUES
        ('hazard_type', 'heat', 'Brier Score (Calibration)', 0.245, 0.089),
        ('hazard_type', 'heat', 'ROC-AUC', 0.682, 0.914),
        ('hazard_type', 'heat', 'MAE (Temperature deg C)', 2.85, 1.12),
        ('hazard_type', 'heavy_rain', 'Brier Score (Calibration)', 0.310, 0.124),
        ('hazard_type', 'heavy_rain', 'Critical Success Index (CSI)', 0.412, 0.748),
        ('hazard_type', 'heavy_rain', 'False Alarm Ratio (FAR)', 0.380, 0.165),
        ('zone_tier', 'coastal', 'MAE (Humidity %)', 14.2, 5.8),
        ('zone_tier', 'inland_basin', 'MAE (Peak Surface Temp)', 3.4, 1.4);
        """
    )

    # 9. exposure_index(zone_id, hazard_type, exposed_population, facilities_count, vulnerability_score, risk_level, evidence_strength)
    # Rule 4: Risk colours: Low green, Moderate yellow, High orange, Severe red, always with text labels.
    conn.execute(
        """
        CREATE TABLE exposure_index (
            zone_id VARCHAR NOT NULL,
            hazard_type VARCHAR NOT NULL,
            exposed_population BIGINT NOT NULL,
            facilities_count INTEGER NOT NULL,
            vulnerability_score DOUBLE NOT NULL,
            risk_level VARCHAR NOT NULL,
            evidence_strength VARCHAR NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO exposure_index VALUES
        -- Heat exposure
        ('KHI-MALIR', 'heat', 980000, 14, 0.89, 'Severe', 'high'),
        ('KHI-CENTRAL', 'heat', 1420000, 28, 0.82, 'Severe', 'high'),
        ('KHI-EAST', 'heat', 1150000, 34, 0.74, 'High', 'high'),
        ('KHI-KORANGI', 'heat', 1300000, 22, 0.71, 'High', 'medium'),
        ('KHI-WEST', 'heat', 1250000, 18, 0.68, 'High', 'medium'),
        ('KHI-SOUTH', 'heat', 890000, 31, 0.54, 'Moderate', 'high'),
        ('KHI-KEAMARI', 'heat', 460000, 12, 0.38, 'Low', 'medium'),

        -- Heavy rain exposure
        ('KHI-KORANGI', 'heavy_rain', 1300000, 22, 0.87, 'Severe', 'high'),
        ('KHI-MALIR', 'heavy_rain', 980000, 14, 0.84, 'Severe', 'high'),
        ('KHI-SOUTH', 'heavy_rain', 890000, 31, 0.78, 'High', 'high'),
        ('KHI-WEST', 'heavy_rain', 1250000, 18, 0.72, 'High', 'medium'),
        ('KHI-EAST', 'heavy_rain', 1150000, 34, 0.58, 'Moderate', 'high'),
        ('KHI-CENTRAL', 'heavy_rain', 1420000, 28, 0.52, 'Moderate', 'high'),
        ('KHI-KEAMARI', 'heavy_rain', 460000, 12, 0.44, 'Moderate', 'medium');
        """
    )

    # 10. impact_indicators(zone_id, impact_area, indicator, value, evidence_strength, source, row_ids)
    conn.execute(
        """
        CREATE TABLE impact_indicators (
            zone_id VARCHAR NOT NULL,
            impact_area VARCHAR NOT NULL,
            indicator VARCHAR NOT NULL,
            value DOUBLE NOT NULL,
            evidence_strength VARCHAR NOT NULL,
            source VARCHAR NOT NULL,
            row_ids VARCHAR NOT NULL
        );
        """
    )
    conn.execute(
        """
        INSERT INTO impact_indicators VALUES
        ('KHI-MALIR', 'Public Health', 'Heatstroke ED Admissions Index', 86.4, 'high', 'JPMC & Civil Hospital Emergency Records', 'IND-HLT-001'),
        ('KHI-MALIR', 'Urban Drainage', 'Spillway Capacity Saturation %', 92.0, 'high', 'Sindh Irrigation Department Gauges', 'IND-DRN-001'),
        ('KHI-KORANGI', 'Power Grid', 'Distribution Feeder Overload Hazard %', 88.5, 'high', 'K-Electric SCADA Load Profiles', 'IND-PWR-001'),
        ('KHI-KORANGI', 'Vulnerable Settlements', 'Informal Housing Inundation Exposure %', 79.2, 'medium', 'UN-Habitat Karachi Slum Assessment', 'IND-SET-001'),
        ('KHI-SOUTH', 'Coastal Operations', 'Tidal Surge & Storm Drainage Head mm', 64.0, 'high', 'Karachi Port Trust Tide Gauge', 'IND-CST-001'),
        ('KHI-SOUTH', 'Transport & Access', 'Arterial Road Waterlogging Risk %', 81.0, 'high', 'Karachi Traffic Police Water Points', 'IND-TRN-001'),
        ('KHI-CENTRAL', 'Public Health', 'Heat Stress Index in Dense Settlements', 84.8, 'high', 'NDMA Karachi Heat Action Cell', 'IND-HLT-002'),
        ('KHI-CENTRAL', 'Water Supply', 'Pumping Station Outage Probability %', 45.0, 'medium', 'KW&SC Dhabeji / Pipri Feed Line', 'IND-WTR-001'),
        ('KHI-WEST', 'Civic Infrastructure', 'Primary Care Clinics Operating at Risk', 72.0, 'medium', 'District Health Office Karachi West', 'IND-CV-001'),
        ('KHI-EAST', 'Transport & Access', 'University Road Inundation Probability %', 63.5, 'high', 'KMC Storm Drainage Monitoring', 'IND-TRN-002');
        """
    )

    conn.commit()
    conn.close()
    print(f"[seed_sample_db] Successfully created and seeded {db_path} with all contract tables.")


if __name__ == "__main__":
    seed_database()
