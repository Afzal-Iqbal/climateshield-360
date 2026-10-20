"""Compose an Insight Agent reply.

Numbers in the answer sentence are inserted from caller-supplied facts.
Retrieved text has already had digits removed, except that gold row identifiers
are kept out of the sentence and returned in ``row_ids``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import duckdb

from climateshield.config import PROCESSED_DIR, WAREHOUSE_PATH
from climateshield.insight.corpus import INDEX_PATH, build_index, strip_figures
from climateshield.insight.retrieve import search

CITIES = (
    "Rawalpindi",
    "Faisalabad",
    "Islamabad",
    "Hyderabad",
    "Peshawar",
    "Karachi",
    "Lahore",
    "Multan",
    "Quetta",
    "Sukkur",
    "Gwadar",
    "Gilgit",
)

URDU_TO_ENGLISH = {
    "بارش": " rain ",
    "گرمی": " heat ",
    "سیلاب": " flood ",
    "دریا": " river ",
    "ہسپتال": " hospital ",
}

UNSUPPORTED = (
    (re.compile(r"died|deaths|killed|mortality|casualt", re.I), "mortality or casualty counts"),
    (re.compile(r"\bgdp\b|stock price|rupee|inflation|crop yield|economic loss|money damage", re.I), "economic or crop-loss figures"),
    (re.compile(r"patient|admission|heatstroke cases|cases of", re.I), "clinical case counts"),
)

LIMITS = (
    "Information only, not professional advice. In an emergency contact Rescue 1122 or the National Disaster Management Authority."
)
SCORE_FLOOR = 0.05
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def normalize_question(question: str) -> str:
    text = question or ""
    for source, replacement in URDU_TO_ENGLISH.items():
        text = text.replace(source, replacement)
    return " ".join(text.split())


def detect_city(question: str) -> str | None:
    lowered = question.lower()
    for city in CITIES:
        if city.lower() in lowered:
            return city
    return None


def _unsupported(question: str) -> str | None:
    for pattern, missing in UNSUPPORTED:
        if pattern.search(question):
            return missing
    return None


def _fmt(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return f"{value:.4f}".rstrip("0").rstrip(".")
    text = str(value).strip()
    if text == "" or text.lower() == "none":
        return None
    return text


def _fact(table: str, row_id: str, label: str, fields: dict[str, Any]) -> dict:
    clean = {key: _fmt(value) for key, value in fields.items()}
    clean = {key: value for key, value in clean.items() if value is not None}
    return {"table": table, "row_id": row_id, "label": label, "fields": clean}


def lookup_facts(question: str, warehouse: Path | None = None) -> list[dict]:
    """Read-only gold lookup. Returns no facts when the warehouse is absent."""
    path = warehouse or WAREHOUSE_PATH
    if not path.is_file():
        return []
    text = normalize_question(question)
    city = detect_city(text)
    wants_river = bool(re.search(r"flood|river|cusec|barrage|stage", text, re.I))
    wants_hospital = bool(re.search(r"hospital|healthcare|clinic", text, re.I))
    wants_quality = bool(re.search(r"quality|flag|fill|missing|gap", text, re.I))
    wants_weather = bool(re.search(r"rain|heat|temperature|weather|forecast|monsoon", text, re.I)) or (
        city is not None and not wants_river and not wants_hospital and not wants_quality
    )
    facts: list[dict] = []
    connection = duckdb.connect(str(path), read_only=True)
    try:
        def _rows(sql: str, params: list | None = None):
            try:
                return connection.execute(sql, params or []).fetchall()
            except Exception:
                return []

        if city and wants_weather:
            stats_rows = _rows(
                """
                SELECT row_id, city, max_temperature_c, total_rainfall_mm,
                       rainy_hours_count, extreme_heat_hours_ge_40c
                FROM weather_city_stats
                WHERE city = ?
                """,
                [city],
            )
            stats = stats_rows[0] if stats_rows else None
            if stats:
                facts.append(
                    _fact(
                        "weather_city_stats",
                        str(stats[0]),
                        f"{city} weather statistics",
                        {
                            "maximum_temperature_c": stats[2],
                            "total_rainfall_mm": stats[3],
                            "rainy_hours": stats[4],
                            "hours_at_or_above_40c": stats[5],
                        },
                    )
                )
            latest_rows = _rows(
                """
                SELECT row_id, temperature_2m_c, precipitation_mm
                FROM weather_hourly
                WHERE city = ?
                ORDER BY timestamp_utc DESC
                LIMIT 1
                """,
                [city],
            )
            latest = latest_rows[0] if latest_rows else None
            if latest:
                facts.append(
                    _fact(
                        "weather_hourly",
                        str(latest[0]),
                        f"The latest stored hour for {city}",
                        {"temperature_c": latest[1], "precipitation_mm": latest[2]},
                    )
                )
        if wants_river:
            rows = _rows(
                """
                SELECT row_id, river_basin, station_name, high_flood_cusecs
                FROM pmd_river_danger_levels
                """
            )
            lowered = text.lower()
            matched = [
                row for row in rows
                if row[2] and str(row[2]).lower() in lowered or str(row[1]).lower() in lowered
            ]
            for row in (matched or [])[:2]:
                facts.append(
                    _fact(
                        "pmd_river_danger_levels",
                        str(row[0]),
                        f"{row[2]} on the {row[1]}",
                        {"high_flood_stage_cusecs": row[3]},
                    )
                )
        if wants_hospital:
            rows = _rows(
                """
                SELECT row_id, region_name, access_pop_hospitals_30min
                FROM osm_hospital_access
                """
            )
            lowered = text.lower()
            matched = [row for row in rows if row[1] and str(row[1]).lower() in lowered]
            for row in matched[:2]:
                facts.append(
                    _fact(
                        "osm_hospital_access",
                        str(row[0]),
                        f"hospital access in {row[1]}",
                        {"people_within_30_minutes_of_a_hospital": row[2]},
                    )
                )
        if wants_quality:
            rows = _rows(
                """
                SELECT rule_id, action, n_rows, reason
                FROM quality_logs
                """
            )
            tokens = set(re.findall(r"[a-z]{4,}", text.lower()))
            ranked = []
            for row in rows:
                blob = f"{row[0]} {row[3]}".lower()
                overlap = sum(1 for token in tokens if token in blob)
                if overlap:
                    ranked.append((overlap, row))
            ranked.sort(key=lambda item: item[0], reverse=True)
            for _, row in ranked[:2]:
                facts.append(
                    _fact(
                        "quality_logs",
                        f"quality_log|{row[0]}",
                        f"quality rule {row[0]}",
                        {"action": row[1], "rows_affected": row[2]},
                    )
                )
    finally:
        connection.close()
    return facts


def _dont_know(missing: str, citations: list[dict] | None = None) -> dict:
    return {
        "knows": False,
        "answer": f"I don't know. The indexed documents and gold tables do not support this. Missing: {missing}.",
        "citations": citations or [],
        "row_ids": [],
        "numbers": [],
        "limits": LIMITS,
        "retriever": "tfidf-cosine",
    }


def _numbers_in(fields: dict[str, str]) -> list[str]:
    found = []
    for value in fields.values():
        found.extend(NUMBER.findall(value))
    return found


def _matching_publisher(question: str) -> str | None:
    if re.search(r"\bwho\b|world health", question, re.I):
        return "WHO"
    if re.search(r"\bpdma\b", question, re.I):
        return "PDMA"
    if re.search(r"\bndma\b", question, re.I):
        return "NDMA"
    if re.search(r"\bpmd\b|flood bulletin|meteorological", question, re.I):
        return "PMD"
    return None


def _advice_rank(section: dict) -> int:
    lowered = section.get("text", "").lower()
    markers = (
        "stay well-hydrated",
        "avoid direct exposure",
        "heatstroke",
        "call for emergency",
        "hydrological",
        "major rivers",
        "normal flow",
        "meteorological outlook",
        "below normal",
        "above normal",
    )
    return sum(marker in lowered for marker in markers)


def compose_answer(question: str, sections: list[dict], facts: list[dict]) -> dict:
    """Build one reply. ``sections`` may already include a ``score``."""
    text = normalize_question(question).strip()
    if not text:
        return _dont_know("the question is empty")
    missing = _unsupported(text)
    if missing:
        return _dont_know(missing)

    asks_for_pdf = bool(
        re.search(r"\bpdf\b|what did the|according to the (advisory|bulletin|strategy|pdf)", text, re.I)
    )
    catalog_only = [
        section for section in sections
        if not section.get("parsed") and float(section.get("score") or 0) >= SCORE_FLOOR
    ]
    official_parsed = [
        section for section in sections
        if section.get("kind") == "official_document"
        and section.get("parsed")
        and float(section.get("score") or 0) >= SCORE_FLOOR
    ]
    if asks_for_pdf and catalog_only and not official_parsed:
        return _dont_know(
            "that official PDF is catalogued and its text was not parsed, so no statement from it can be quoted",
            citations=[
                {
                    "section_id": section["section_id"],
                    "title": section["title"],
                    "publisher": section["publisher"],
                    "excerpt": section["text"][:280],
                }
                for section in catalog_only[:1]
            ],
        )

    strong = [section for section in sections if float(section.get("score") or 0) >= SCORE_FLOOR][:3]
    if not facts and not strong:
        return _dont_know("no matching section and no gold-table row for this question")

    sentences: list[str] = []
    numbers: list[str] = []
    row_ids: list[str] = []
    for fact in facts:
        fields = fact["fields"]
        numbers.extend(_numbers_in(fields))
        row_ids.append(fact["row_id"])
        if "maximum_temperature_c" in fields:
            sentences.append(
                f"{fact['label']} record a maximum temperature of {fields['maximum_temperature_c']} C, "
                f"total rainfall of {fields['total_rainfall_mm']} mm, "
                f"{fields['rainy_hours']} rainy hours, and {fields['hours_at_or_above_40c']} extreme-heat hours."
            )
        elif "precipitation_mm" in fields and "temperature_c" in fields:
            sentences.append(
                f"{fact['label']} shows temperature {fields['temperature_c']} C and precipitation {fields['precipitation_mm']} mm."
            )
        elif "high_flood_stage_cusecs" in fields:
            sentences.append(
                f"PMD stage limits for {fact['label']} put the high-flood stage at {fields['high_flood_stage_cusecs']} cusecs. "
                "These are thresholds, not a measured discharge."
            )
        elif "people_within_30_minutes_of_a_hospital" in fields:
            sentences.append(
                f"{fact['label']} lists {fields['people_within_30_minutes_of_a_hospital']} people inside the short hospital-access buffer "
                "under ordinary road conditions. This is not a count of patients."
            )
        elif "rows_affected" in fields:
            sentences.append(
                f"{fact['label']} chose action {fields.get('action', 'flag')} and recorded {fields['rows_affected']} rows affected."
            )
        else:
            pairs = ", ".join(f"{key.replace('_', ' ')} {value}" for key, value in fields.items())
            sentences.append(f"{fact['label']}: {pairs}.")

    official = [
        section for section in sections
        if section.get("kind") == "official_document"
        and section.get("parsed")
        and float(section.get("score") or 0) >= SCORE_FLOOR
    ]
    named = _matching_publisher(text)
    if named:
        same_publisher = [section for section in official if named in section.get("publisher", "").upper()]
        if same_publisher:
            official = same_publisher
    if official:
        official = sorted(official, key=_advice_rank, reverse=True)
        top = official[0]
        sentences.append(
            f"From {top['publisher']}, {strip_figures(top['title'])}: {strip_figures(top.get('text', ''))[:360]}"
        )
        sentences.append("This is information from that document, not a new instruction.")
    elif strong:
        sentences.append("Matching source notes are cited below. This reply does not add a recommendation beyond those notes.")
    elif facts:
        sentences.append("No matching official advisory section was retrieved, so this reply states the stored measurements only.")

    if NUMBER.search(text):
        sentences.append("Figures typed in the question are not used.")

    answer = " ".join(sentences)
    allowed = set(numbers)
    leaked = [token for token in NUMBER.findall(answer) if token not in allowed]
    if leaked:
        return _dont_know("a draft answer contained a number that was not in a gold row")

    citations = [
        {
            "section_id": section["section_id"],
            "title": section["title"],
            "publisher": section["publisher"],
            "excerpt": section.get("text", "")[:280],
        }
        for section in strong
    ]
    for citation in citations:
        if NUMBER.search(citation["excerpt"]):
            citation["excerpt"] = "Excerpt withheld because it still contained a digit."
    return {
        "knows": True,
        "answer": answer,
        "citations": citations,
        "row_ids": row_ids,
        "numbers": numbers,
        "limits": LIMITS,
        "retriever": "tfidf-cosine",
    }


def load_index(path: Path | None = None) -> dict:
    destination = path or INDEX_PATH
    if not destination.is_file():
        build_index(destination)
    return json.loads(destination.read_text(encoding="utf-8"))


def ask(question: str, index_path: Path | None = None, warehouse: Path | None = None) -> dict:
    payload = load_index(index_path)
    sections = search(question, payload.get("sections") or [], payload, limit=12)
    official = [
        section for section in sections
        if section.get("kind") == "official_document" and section.get("parsed")
    ]
    other = [section for section in sections if section not in official]
    sections = official[:3] + other[:2]
    facts = lookup_facts(question, warehouse)
    reply = compose_answer(question, sections, facts)
    reply["index_sections"] = len(payload.get("sections") or [])
    return reply
