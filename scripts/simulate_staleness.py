#!/usr/bin/env python3
"""
scripts/simulate_staleness.py - Near-Real-Time Freshness Simulation Tool
========================================================================

TEST TOOL ONLY: This script NEVER modifies or writes to real database tables.
It runs the system's freshness classification logic against in-memory fixture timestamps
to demonstrate Fresh (<= 1x SLA), Late (<= 3x SLA), and Stale (> 3x SLA) states.

Usage:
    python scripts/simulate_staleness.py
    python scripts/simulate_staleness.py --scenario [all|fresh|late|stale|mixed]
"""

import sys
import argparse
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

# Ensure repository root is on sys.path
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


# Import freshness evaluation logic directly from backend
from backend.db import evaluate_freshness_status


def create_fixture_scenario(scenario_name: str, ref_time: datetime) -> List[Dict[str, Any]]:
    """Generate in-memory synthetic fixture source freshness records without touching any DB."""
    
    if scenario_name == "fresh":
        # All critical sources are updated within 1x expected interval (60 mins)
        return [
            {
                "source_name": "open_meteo_hourly",
                "publisher": "Open-Meteo",
                "licence": "CC-BY 4.0",
                "last_fetched_at": (ref_time - timedelta(minutes=15)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=15)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_pmd",
                "publisher": "Pakistan Meteorological Department",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=20)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=20)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_ndma",
                "publisher": "National Disaster Management Authority",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=20)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=20)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
        ]

    elif scenario_name == "late":
        # Sources delayed past 1x SLA (60m) but under 3x SLA (180m)
        return [
            {
                "source_name": "open_meteo_hourly",
                "publisher": "Open-Meteo",
                "licence": "CC-BY 4.0",
                "last_fetched_at": (ref_time - timedelta(minutes=110)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=110)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_pmd",
                "publisher": "Pakistan Meteorological Department",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=95)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=95)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_ndma",
                "publisher": "National Disaster Management Authority",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=125)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=125)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
        ]

    elif scenario_name == "stale":
        # Critical sources delayed well past 3x SLA (> 180m)
        return [
            {
                "source_name": "open_meteo_hourly",
                "publisher": "Open-Meteo",
                "licence": "CC-BY 4.0",
                "last_fetched_at": (ref_time - timedelta(minutes=300)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=300)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_pmd",
                "publisher": "Pakistan Meteorological Department",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=240)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=240)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "failed",
            },
            {
                "source_name": "advisories_ndma",
                "publisher": "National Disaster Management Authority",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=480)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=480)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "failed",
            },
        ]

    else:  # mixed: one fresh, one late, one stale
        return [
            {
                "source_name": "open_meteo_hourly",
                "publisher": "Open-Meteo",
                "licence": "CC-BY 4.0",
                "last_fetched_at": (ref_time - timedelta(minutes=25)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=25)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_pmd",
                "publisher": "Pakistan Meteorological Department",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=135)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=135)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "success",
            },
            {
                "source_name": "advisories_ndma",
                "publisher": "National Disaster Management Authority",
                "licence": "Public Domain (Official Government Portal)",
                "last_fetched_at": (ref_time - timedelta(minutes=260)).isoformat(),
                "last_data_timestamp": (ref_time - timedelta(minutes=260)).isoformat(),
                "expected_every_minutes": 60,
                "recorded_status": "failed",
            },
        ]


def run_scenario(name: str, sources_fixture: List[Dict[str, Any]], ref_time: datetime):
    print(f"\n{'='*75}")
    print(f"SCENARIO: {name.upper()} (Simulation at UTC: {ref_time.strftime('%Y-%m-%d %H:%M:%S UTC')})")
    print(f"{'='*75}")
    print("NOTE: Real warehouse and serving databases are untouched.")
    print("-" * 75)
    print(f"{'Source Name':<22} | {'Expected':<9} | {'Age (min)':<10} | {'Calculated Status':<18} | {'Pill Color'}")
    print("-" * 75)

    all_fresh = True
    critical_sources = ["open_meteo_hourly", "advisories_pmd", "advisories_ndma"]

    for src in sources_fixture:
        fetched_dt = datetime.fromisoformat(src["last_fetched_at"])
        age_minutes = round((ref_time - fetched_dt).total_seconds() / 60.0, 1)
        expected = src["expected_every_minutes"]
        
        # Freshness evaluation using backend logic
        eval_status = evaluate_freshness_status(age_minutes, expected, src.get("recorded_status"))
        
        if src["source_name"] in critical_sources and eval_status != "Fresh":
            all_fresh = False

        if eval_status == "Fresh":
            color = "\033[92m[GREEN - LIVE]\033[0m"
        elif eval_status == "Late":
            color = "\033[93m[AMBER - LATE]\033[0m"
        else:
            color = "\033[91m[RED - STALE]\033[0m"

        print(f"{src['source_name']:<22} | {expected:>6}m   | {age_minutes:>8}m  | {eval_status:<18} | {color}")

    print("-" * 75)
    is_live = all_fresh
    if is_live:
        print(f"GLOBAL STATUS: \033[92m LIVE \033[0m (is_live = True)")
        print("  -> UI displays Green 'Live' badge")
    else:
        # Determine highest severity for badge
        has_stale = any(evaluate_freshness_status(
            round((ref_time - datetime.fromisoformat(s['last_fetched_at'])).total_seconds() / 60.0, 1),
            s['expected_every_minutes'],
            s.get('recorded_status')
        ) == "Stale" for s in sources_fixture)
        
        if has_stale:
            print(f"GLOBAL STATUS: \033[91m STALE \033[0m (is_live = False)")
            print("  -> UI displays Red 'Stale' badge with age and source tooltip")
        else:
            print(f"GLOBAL STATUS: \033[93m LATE \033[0m (is_live = False)")
            print("  -> UI displays Amber 'Late' badge with age and source tooltip")


def main():
    parser = argparse.ArgumentParser(
        description="ClimateShield 360 - Staleness Simulation Tool (Tests logic against fixture timestamps without touching real tables)"
    )
    parser.add_argument(
        "--scenario",
        choices=["all", "fresh", "late", "stale", "mixed"],
        default="all",
        help="Simulation scenario to run (default: all)",
    )
    args = parser.parse_args()

    ref_time = datetime.now(timezone.utc)
    scenarios = ["fresh", "late", "stale", "mixed"] if args.scenario == "all" else [args.scenario]

    print("\n" + "#" * 75)
    print(" CLIMATESHIELD 360 - NEAR-REAL-TIME STALENESS SIMULATOR")
    print(" (Fixture-driven verification tool - Zero database side effects)")
    print("#" * 75)

    for sc in scenarios:
        fixtures = create_fixture_scenario(sc, ref_time)
        run_scenario(sc, fixtures, ref_time)

    print("\n[OK] Simulation completed. Verify that:")
    print("  1. Age <= 1x SLA (60m)  -> Fresh (Live)")
    print("  2. Age <= 3x SLA (180m) -> Late")
    print("  3. Age >  3x SLA (180m) -> Stale")
    print("  4. Global is_live is True ONLY when all critical sources are Fresh.\n")


if __name__ == "__main__":
    main()
