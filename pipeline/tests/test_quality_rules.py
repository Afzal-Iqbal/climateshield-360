from __future__ import annotations

from climateshield.quality.rules import RULES, rules_payload


def test_rules_cover_fix_fill_flag_keep() -> None:
    actions = {rule["action"] for rule in RULES}
    assert "fix" in actions
    assert "fill" in actions
    assert "flag" in actions
    assert "keep" in actions


def test_only_short_smooth_gaps_are_filled() -> None:
    weather_fills = [
        rule
        for rule in RULES
        if rule["dataset"] == "01_open_meteo_heat_rainfall" and rule["action"] == "fill"
    ]
    assert [rule["rule_id"] for rule in weather_fills] == ["WX.SHORT_GAP_FILL"]


def test_peshawar_is_flagged_not_filled() -> None:
    rule = next(r for r in RULES if r["rule_id"] == "WX.PESHAWAR_COVERAGE")
    assert rule["action"] == "flag"


def test_crop_flood_zeros_are_flagged() -> None:
    rule = next(r for r in RULES if r["rule_id"] == "OSM.CROP_FLOOD_ALL_ZERO")
    assert rule["action"] == "flag"


def test_extremes_are_kept() -> None:
    rule = next(r for r in RULES if r["rule_id"] == "GLOBAL.NO_EXTREME_DISCARD")
    assert rule["action"] == "keep"


def test_rules_payload_is_serialisable() -> None:
    payload = rules_payload()
    assert payload["rules"]
    assert "Fix only certain" in payload["principle"]
