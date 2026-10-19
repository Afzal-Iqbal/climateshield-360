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

    # Rule 3: Store time in UTC. DuckDB TIMESTAMP stores naive datetime in UTC.
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

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

    # Seed 24 hourly runs over the last 24 hours
    # 22 success, 1 failed/retried at -10h, 1 running/lag at -1h, latest at -18m
    durations = [11.2, 9.8, 10.4, 12.1, 8.9, 11.6, 10.0, 14.2, 9.1, 10.7, 11.0, 8.4, 9.6, 15.2, 9.9, 11.5, 12.3, 13.0, 10.1, 9.5, 10.3, 11.8, 14.5, 8.4]
    
    for i in range(24):
        # hour offset from 23 hours ago down to 0 (current hour)
        hour_offset = 23 - i
        run_start = now_utc - timedelta(hours=hour_offset, minutes=18)
        dur = durations[i]
        run_finish = run_start + timedelta(seconds=dur)
        run_id = f"RUN-{run_start.strftime('%Y%m%d-%H%M')}"

        if hour_offset == 10:
            # Simulated retry / partition failover
            status = "failed"
            notes = "Scheduled DB partition failover triggered retries. Auto-recovered on retry."
        elif hour_offset == 1:
            status = "success"
            notes = "Upstream KE Feeder SCADA delayed; used forward fill fallback."
        elif hour_offset == 0:
            status = "success"
            notes = "Nominal scheduled run: Ingested PMD Karachi Met, GFS 0.25, and Sindh PDMA feeder streams. All 18 zones evaluated."
        else:
            status = "success"
            notes = "Nominal micro-batch execution completed cleanly."

        conn.execute(
            """
            INSERT INTO run_status VALUES (?, ?, ?, ?, ?);
            """,
            [run_id, run_start, run_finish, status, notes],
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
        ('Regional Doppler Weather Radar', 'Pakistan Meteorological Dept (PMD)', 'Gov MoA / Level-1 Feed', ?, 10, 'fresh'),
        ('ECMWF Integrated Forecasting System (IFS)', 'European Centre for Medium-Range Weather', 'WMO GTS Exchange', ?, 360, 'fresh'),
        ('NOAA GFS 0.25 Gridded Atmosphere', 'NOAA NCEP', 'Public Domain (US Gov)', ?, 360, 'fresh'),
        ('K-Electric Distribution Feeder SCADA', 'K-Electric Grid Operating Centre', 'Critical Infra SLA', ?, 15, 'delayed'),
        ('SBCA Active Excavation Permits', 'Sindh Building Control Authority', 'Provincial Public Record', ?, 1440, 'stale'),
        ('Sentinel-2 Surface Reflectance (UHI)', 'ESA Copernicus Open Access Hub', 'CC-BY-SA 3.0 IGO', ?, 7200, 'fresh');
        """,
        [
            now_utc - timedelta(minutes=4),       # 4m ago (expected 10m -> Fresh: 0.4x)
            now_utc - timedelta(hours=1, minutes=42), # 102m ago (expected 360m -> Fresh: 0.28x)
            now_utc - timedelta(hours=2, minutes=10), # 130m ago (expected 360m -> Fresh: 0.36x)
            now_utc - timedelta(minutes=35),      # 35m ago (expected 15m -> Late: 2.33x)
            now_utc - timedelta(hours=74),        # 74h ago (expected 24h -> Stale: 3.08x)
            now_utc - timedelta(hours=28),        # 28h ago (expected 120h -> Fresh: 0.23x)
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

    # Seed rich multi-day audit records across the last 7 days (naive UTC)
    quality_records = [
        # Today (Day 0) - Latest micro-batch (18 mins ago)
        (now_utc - timedelta(minutes=18), 'PMD AWS #04 Kemari Port', 'RULE-QC-08: Stale Temperature Plateau', 'flag', 12, 'Thermistor stuck at 36.4°C during rapid barometric drop. Flagged as suspected hardware freeze; decoupled from live ensemble.'),
        (now_utc - timedelta(minutes=18), 'K-Electric Feeder Telemetry', 'RULE-QC-03: Null Packet Imputation', 'fill', 4, 'Upstream transmission jitter caused 3 null packet intervals. Replaced with forward-fill from 15m moving median.'),
        (now_utc - timedelta(minutes=18), 'Karachi Urban Drainage Sluices', 'RULE-QC-14: Acoustic Water Level Spike', 'fix', 1, 'Ultrasonic echo artifact on Gujjar Nullah gauge jumped to 14.8m. Clamped to channel brim limit of 5.2m.'),
        (now_utc - timedelta(minutes=18), 'Regional Doppler Weather Radar', 'RULE-QC-01: Temperature Physical Bounds [-5C, 55C]', 'fix', 1, 'Sensor spike of 68.2C clamped to previous 15-min rolling mean of 42.1C.'),
        (now_utc - timedelta(minutes=18), 'K-Electric Distribution Feeder SCADA', 'RULE-QC-05: Rapid Voltage Drop Outlier Detection', 'flag', 4, 'Flagged 4 distribution feeders in Lyari showing atypical high variance load.'),
        (now_utc - timedelta(minutes=18), 'Sindh PDMA Water Gauges', 'RULE-QC-09: Missing Sensor Timestamp Imputation', 'fill', 3, 'Linear interpolation on Malir River gauge depth during 10-minute packet loss.'),
        (now_utc - timedelta(hours=3), 'NOAA GFS 0.25 Gridded Atmosphere', 'RULE-QC-02: Bounding Box Coordinate Validation', 'fix', 6, 'Bounding box validation passed; clamped 6 border grid cells to Karachi municipal limits.'),

        # Yesterday (Day 1)
        (now_utc - timedelta(days=1, hours=2), 'KPT Manora Tide Gauge', 'RULE-QC-21: Astronomical Tide Variance Check', 'flag', 3, 'Observed surge gauge at +3.28m CD exceeded 3-sigma statistical envelope vs astronomical tide.'),
        (now_utc - timedelta(days=1, hours=5), 'PMD Karachi Met Station', 'RULE-QC-11: Relative Humidity Ceiling Check', 'fix', 2, 'Super-saturation reading of 104% RH clamped to physical limit of 100%.'),
        (now_utc - timedelta(days=1, hours=9), 'Sindh PDMA Water Gauges', 'RULE-QC-07: Sluice Flow Rate Imputation', 'fill', 6, 'Downstream sluice gate telemetry gap filled using upstream weir differential.'),
        (now_utc - timedelta(days=1, hours=14), 'Regional Doppler Weather Radar', 'RULE-QC-04: Ground Clutter Radar Reflection Filter', 'fix', 15, 'Ground clutter echoes over Karachi Ridge filtered out via dual-polarization correlation.'),

        # Day 2
        (now_utc - timedelta(days=2, hours=3), 'K-Electric Distribution Feeder SCADA', 'RULE-QC-03: Substation Telemetry Imputation', 'fill', 12, 'Fiber optic link drop at Korangi grid filled from secondary radio RTU.'),
        (now_utc - timedelta(days=2, hours=7), 'SBCA Active Excavation Permits', 'RULE-QC-18: Expired Permit Invalidation', 'flag', 5, 'Trench permits in District East flagged due to missing municipal clearance stamp.'),
        (now_utc - timedelta(days=2, hours=11), 'Regional Doppler Weather Radar', 'RULE-QC-01: Noise Spike Suppression', 'fix', 22, 'Suppressed 22 transient noise spikes in radial velocity gates.'),

        # Day 3
        (now_utc - timedelta(days=3, hours=4), 'Civil Hospital Karachi AWS', 'RULE-QC-01: Timestamp Offset Normalization', 'fix', 86, 'Clock drift of +4 minutes on local data logger synchronized with NTP time server.'),
        (now_utc - timedelta(days=3, hours=8), 'Sindh PDMA Water Gauges', 'RULE-QC-09: Missing Depth Data Interpolation', 'fill', 8, 'Interpolated 8 depth intervals on Hub Dam feeder canal.'),
        (now_utc - timedelta(days=3, hours=13), 'KPT Manora Tide Gauge', 'RULE-QC-22: Wave Buoy Communication Timeout', 'flag', 2, 'Offshore wave buoy telemetry timeout flagged for coastal patrol check.'),

        # Day 4
        (now_utc - timedelta(days=4, hours=2), 'Regional Doppler Weather Radar', 'RULE-QC-06: Beam Blockage Attenuation Correction', 'fix', 19, 'Partial beam blockage over high-rise clusters in Clifton normalized using azimuthal interpolation.'),
        (now_utc - timedelta(days=4, hours=6), 'K-Electric Distribution Feeder SCADA', 'RULE-QC-03: Grid 11-A Imputation', 'fill', 15, 'Synthetic forward-fill for 15 feeder telemetry intervals.'),
        (now_utc - timedelta(days=4, hours=10), 'Karachi Urban Drainage Sluices', 'RULE-QC-14: Sensor Drift Flag', 'flag', 4, 'Malir Causeway pressure transducer drifted by 0.8m over 12 hours; flagged for recalibration.'),

        # Day 5
        (now_utc - timedelta(days=5, hours=3), 'PMD Karachi Met Station', 'RULE-QC-10: Barometric Pressure Discontinuity', 'fix', 5, 'Sudden pressure jump of 12 hPa in 10 minutes smoothed via spline filter.'),
        (now_utc - timedelta(days=5, hours=7), 'Sindh PDMA Water Gauges', 'RULE-QC-09: Null Packet Imputation', 'fill', 11, 'Filled missing river discharge intervals using hydrological recession curve.'),
        (now_utc - timedelta(days=5, hours=12), 'SBCA Active Excavation Permits', 'RULE-QC-19: Duplicate Geo-Coordinates Flag', 'flag', 3, 'Identical excavation coordinates submitted for two separate municipal works.'),

        # Day 6
        (now_utc - timedelta(days=6, hours=4), 'Regional Doppler Weather Radar', 'RULE-QC-01: Velocity Dealiasing Correction', 'fix', 42, 'Doppler radial velocity folds exceeding Nyquist velocity corrected using 4DVar dealiasing.'),
        (now_utc - timedelta(days=6, hours=8), 'K-Electric Feeder Telemetry', 'RULE-QC-03: SCADA Backup Imputation', 'fill', 9, 'Primary SCADA packet drop synthesized using secondary substation RTU.'),
        (now_utc - timedelta(days=6, hours=15), 'KPT Manora Tide Gauge', 'RULE-QC-20: Marine Sensor Noise Flag', 'flag', 7, 'High frequency boat wash noise flagged and isolated from tidal surge envelope.'),
    ]

    for rec in quality_records:
        conn.execute("INSERT INTO quality_log VALUES (?, ?, ?, ?, ?, ?);", list(rec))

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
        ('FAC-SCH-01', 'school', 'DJ Sindh Government Science College', 'KHI-SOUTH', 24.8550, 67.0175),
        ('FAC-SCH-02', 'school', 'Habib Public School', 'KHI-SOUTH', 24.8412, 67.0384),
        ('FAC-SCH-03', 'school', 'Karachi Grammar School', 'KHI-SOUTH', 24.8320, 67.0330),
        ('FAC-SCH-04', 'school', 'Government Degree College Malir Cantt', 'KHI-MALIR', 24.9080, 67.1850),
        ('FAC-SCH-05', 'school', 'Sir Syed Government Girls College', 'KHI-CENTRAL', 24.9195, 67.0280),
        ('FAC-SCH-06', 'school', 'Government National College', 'KHI-EAST', 24.8820, 67.0680),
        ('FAC-SHLT-01', 'shelter', 'Lyari Community Emergency Relief Centre', 'KHI-SOUTH', 24.8650, 66.9910),
        ('FAC-SHLT-02', 'shelter', 'Gabol Park Disaster Shelter Hall', 'KHI-SOUTH', 24.8720, 66.9970),
        ('FAC-SHLT-03', 'shelter', 'Gulshan Civic Emergency Relief Camp', 'KHI-EAST', 24.9210, 67.0950),
        ('FAC-SHLT-04', 'shelter', 'Korangi Sector 48 Relief Facility', 'KHI-KORANGI', 24.8380, 67.1350),
        ('FAC-SHLT-05', 'shelter', 'Gadap Disaster Welfare & Relief Shelter', 'KHI-MALIR', 24.9650, 67.2400),
        ('FAC-SHLT-06', 'shelter', 'Orangi Sector 5 Multi-Purpose Shelter', 'KHI-WEST', 24.9530, 66.9880),
        ('FAC-SHLT-07', 'shelter', 'Keamari Port Welfare Shelter Complex', 'KHI-KEAMARI', 24.8150, 66.9820),
        ('FAC-GRID-01', 'power_substation', 'K-Electric Korangi Southern Grid', 'KHI-KORANGI', 24.8150, 67.1420),
        ('FAC-DRAIN-01', 'drainage_culvert', 'Lyari River Spillway Regulator', 'KHI-SOUTH', 24.8710, 66.9850),
        ('FAC-DRAIN-02', 'drainage_culvert', 'Malir River Causeway Outlet', 'KHI-MALIR', 24.8410, 67.1120),
        ('FAC-PORT-01', 'port_terminal', 'Karachi Port Trust Berth 5-10', 'KHI-KEAMARI', 24.8210, 66.9740);
        """
    )


    # 7. predictions(zone_id, forecast_time, hazard_type, probability, interval_low, interval_high, baseline_value)
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

    # Granular forecast horizons spanning 24h, 48h, and 7 days (168h)
    horizons_24h = [3, 6, 9, 12, 15, 18, 21, 24]
    horizons_48h = [27, 30, 33, 36, 39, 42, 45, 48]
    horizons_7d = [60, 72, 84, 96, 108, 120, 132, 144, 156, 168]
    all_horizons = horizons_24h + horizons_48h + horizons_7d

    zone_heat_multipliers = {
        "KHI-MALIR": 1.08,
        "KHI-CENTRAL": 1.05,
        "KHI-EAST": 1.00,
        "KHI-KORANGI": 0.98,
        "KHI-WEST": 0.96,
        "KHI-SOUTH": 0.88,
        "KHI-KEAMARI": 0.78,
    }

    zone_rain_multipliers = {
        "KHI-KORANGI": 1.10,
        "KHI-MALIR": 1.08,
        "KHI-SOUTH": 1.02,
        "KHI-WEST": 0.94,
        "KHI-EAST": 0.88,
        "KHI-CENTRAL": 0.82,
        "KHI-KEAMARI": 0.75,
    }

    for h in all_horizons:
        f_time = now_utc + timedelta(hours=h)

        # Diurnal thermal curve: peaks around 15h-18h (local afternoon heat)
        # Periodic diurnal wave + slight general escalation
        phase = ((h + 10) % 24) / 24.0  # 0 to 1 daily cycle
        import math
        diurnal_factor = 0.5 + 0.5 * math.sin(phase * 2 * math.pi - math.pi / 2)  # 0 at night, 1 at peak afternoon
        
        # Base probability for heat
        base_heat_prob = 0.52 + 0.38 * diurnal_factor
        # Monsoon rain system arrives at +12h, peaks +18h to +24h, then gradually dissipates
        if h <= 9:
            base_rain_prob = 0.35 + (h / 9.0) * 0.25
        elif h <= 24:
            base_rain_prob = 0.60 + 0.28 * math.sin(((h - 9) / 15.0) * math.pi)
        elif h <= 48:
            base_rain_prob = 0.70 - ((h - 24) / 24.0) * 0.32
        else:
            base_rain_prob = 0.30 + 0.15 * math.sin((h / 48.0) * math.pi)

        # Baseline climatological normal risk in Karachi
        baseline_heat = 0.22
        baseline_rain = 0.15

        # Uncertainty widens with lead time
        spread_factor = 0.08 + (h / 168.0) * 0.12

        for zid, h_mult in zone_heat_multipliers.items():
            prob = min(0.96, max(0.20, round(base_heat_prob * h_mult, 3)))
            low = max(0.05, round(prob - spread_factor, 3))
            high = min(0.99, round(prob + spread_factor * 0.9, 3))
            conn.execute(
                "INSERT INTO predictions VALUES (?, ?, 'heat', ?, ?, ?, ?);",
                [zid, f_time, prob, low, high, baseline_heat]
            )

        for zid, r_mult in zone_rain_multipliers.items():
            prob = min(0.95, max(0.15, round(base_rain_prob * r_mult, 3)))
            low = max(0.04, round(prob - spread_factor * 1.1, 3))
            high = min(0.99, round(prob + spread_factor * 1.0, 3))
            conn.execute(
                "INSERT INTO predictions VALUES (?, ?, 'heavy_rain', ?, ?, ?, ?);",
                [zid, f_time, prob, low, high, baseline_rain]
            )

    # 8. model_eval(group_type, group_value, metric, baseline_score, model_score)
    # Stratified model evaluation with groups matching DESIGN.md:
    # Karachi Coastal Fringe has highest MAE (1.48C) -> Weakest group!
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
        ('overall', 'Karachi Division Overall', 'MAE (Temperature deg C)', 1.94, 0.82),
        ('spatial_cluster', 'Karachi Coastal Fringe (Kemari, Clifton)', 'MAE (Temperature deg C)', 2.15, 1.48),
        ('spatial_cluster', 'Inland High-Density Core (Lyari, Orangi)', 'MAE (Temperature deg C)', 1.88, 0.61),
        ('spatial_cluster', 'Suburban Plain & Semi-Arid (Gadap, Malir)', 'MAE (Temperature deg C)', 1.92, 0.74),
        ('hazard_type', 'Heat Hazard (WBGT)', 'Brier Score', 0.245, 0.089),
        ('hazard_type', 'Heavy Rain Precipitation', 'Brier Score', 0.310, 0.124);
        """
    )

    # 9. exposure_index(zone_id, hazard_type, exposed_population, facilities_count, vulnerability_score, risk_level, evidence_strength)
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
        ('KHI-MALIR', 'heat', 980000, 14, 0.89, 'Severe', 'high'),
        ('KHI-CENTRAL', 'heat', 1420000, 28, 0.82, 'Severe', 'high'),
        ('KHI-EAST', 'heat', 1150000, 34, 0.74, 'High', 'high'),
        ('KHI-KORANGI', 'heat', 1300000, 22, 0.71, 'High', 'medium'),
        ('KHI-WEST', 'heat', 1250000, 18, 0.68, 'High', 'medium'),
        ('KHI-SOUTH', 'heat', 890000, 31, 0.54, 'Moderate', 'high'),
        ('KHI-KEAMARI', 'heat', 460000, 12, 0.38, 'Low', 'medium'),

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
