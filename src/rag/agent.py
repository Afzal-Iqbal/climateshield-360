"""
Retrieval and answer templates for the climate assistant.

`answer()` formats numbers it is given. It does not query DuckDB and it does
not invent a figure. A document is cited only when a sentence of the answer is
drawn from that section.
"""

from __future__ import annotations

from typing import Optional

RELEVANCE_THRESHOLD = 0.75

_SAFETY_PHRASES = (
    "heat stroke",
    "heatstroke",
    "heat-stroke",
    "flood danger",
    "injury",
    "injured",
)


def section_from_catalog_row(row: dict) -> dict:
    """Turn one catalog row into a section. The text is the catalog fact, not the PDF."""
    title = str(row.get("title") or row.get("filename") or "Untitled document")
    doc_type = str(row.get("doc_type") or "")
    blob = f"{title} {doc_type} {row.get('filename') or ''}".lower()
    if any(word in blob for word in ("anticipatory", "contingency", "strategy")):
        kind = "contingency"
    elif "heat" in blob or "weather advisory" in blob or doc_type == "weather_advisory":
        kind = "heat"
    elif any(word in blob for word in ("flood", "rain", "river")):
        kind = "rain"
    else:
        kind = "other"
    return {
        "title": title,
        "section": "Catalog entry",
        "kind": kind,
        "row_id": str(row.get("row_id") or ""),
        "text": (
            f"The catalog lists {title}. "
            "The PDF was not parsed, so no figure is quoted from that section."
        ),
    }


def classify(question: str) -> str:
    """Route a question. Heat-health and today's weather are checked before generic heat."""
    text = question.lower()
    if any(phrase in text for phrase in _SAFETY_PHRASES):
        return "heat_health"
    if any(word in text for word in ("emergency", "pdma", "rescue", "1122", "1736", "helpline")):
        return "emergency"
    if any(word in text for word in ("document", "pdf", "ndma", "parsed", "strategy", "bulletin")):
        return "documents"
    if any(word in text for word in ("mae", "baseline", "brier", "accuracy", "model eval", "evaluation")):
        return "model"
    if any(
        word in text
        for word in (
            "impact area",
            "eight impact",
            "agriculture",
            "economic",
            "infrastructure",
            "which forecast",
            "forecast coverage",
        )
    ):
        return "coverage"
    if "weather" in text and not any(word in text for word in ("rain", "rainfall", "forecast")):
        return "weather"
    if any(word in text for word in ("temperature", "heat", "hot", "celsius", "wbgt")) and "rain" not in text:
        return "heat"
    if any(word in text for word in ("rain", "rainfall", "precipitation", "shower")) or "forecast" in text:
        return "rain"
    if any(word in text for word in ("ingest", "pipeline", "fresh", "hourly", "last run", "stale", "update")):
        return "pipeline"
    if "model" in text:
        return "model"
    if "health" in text or "hospital" in text:
        return "coverage"
    return "unknown"


def _score(section: dict, family: str) -> float:
    """High score only when the section kind matches the question topic."""
    kind = section.get("kind")
    if family == "heat_health" and kind == "heat":
        return 1.0
    if family == "heat_health" and kind in {"rain", "contingency", "other"}:
        return 0.0
    if family == "documents" and kind == "contingency":
        return 1.0
    if family == "documents" and kind == "heat":
        return 0.8
    return 0.0


def retrieve(question: str, sections: list[dict], family: str) -> list[dict]:
    """Return sections at or above the relevance threshold, best first."""
    if family in {"weather", "unknown", "heat", "rain", "pipeline", "model", "coverage", "emergency"}:
        return []
    ranked = [(_score(section, family), section) for section in sections]
    ranked = [item for item in ranked if item[0] >= RELEVANCE_THRESHOLD]
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [section for _, section in ranked]


def _heat_band(temp_c: float) -> str:
    if temp_c >= 45:
        return "at or above the 45°C severe monitoring threshold"
    if temp_c >= 40:
        return "at or above the 40°C danger monitoring threshold"
    if temp_c >= 35:
        return "at or above the 35°C caution monitoring threshold"
    return "below the 35°C caution monitoring threshold"


def _fmt_number(value: float, digits: int) -> str:
    return f"{value:.{digits}f}"


def _weather_bits(context: dict) -> tuple[list[str], list[dict], Optional[str]]:
    """Format stored weather numbers once. Missing fields are named, not filled in."""
    bits: list[str] = []
    facts: list[dict] = []
    if context.get("temperature_c") is not None:
        shown = _fmt_number(float(context["temperature_c"]), 1)
        bits.append(f"{shown}°C")
        facts.append({"label": "Temperature", "value": shown, "unit": "°C"})
    else:
        bits.append("temperature is missing")
    if context.get("humidity_pct") is not None:
        shown = _fmt_number(float(context["humidity_pct"]), 1)
        bits.append(f"{shown}% humidity")
        facts.append({"label": "Humidity", "value": shown, "unit": "%"})
    else:
        bits.append("humidity is missing")
    if context.get("precipitation_mm") is not None:
        shown = _fmt_number(float(context["precipitation_mm"]), 2)
        bits.append(f"{shown} mm rainfall")
        facts.append({"label": "Rainfall", "value": shown, "unit": "mm"})
    else:
        bits.append("rainfall is missing")
    return bits, facts, context.get("row_id") or None


def _prediction_facts(city: str, context: dict) -> tuple[str, list[dict], str]:
    """One short sentence naming each number once. Model name is returned separately."""
    median = _fmt_number(float(context["median"]), 3)
    low = _fmt_number(float(context["interval_low"]), 3)
    high = _fmt_number(float(context["interval_high"]), 3)
    probability = context.get("probability")
    prob_text = "unavailable" if probability is None else _fmt_number(float(probability), 4)
    issued = context.get("issued_at") or "an unknown time"
    valid = context.get("forecast_time") or "an unknown time"
    stale = " This model row is stale because that forecast time has passed." if context.get("stale") else ""
    sentence = (
        f"1-hour median {median} mm/h, interval {low} to {high} mm/h, "
        f"P(rain >= 2.5 mm/h) {prob_text}. Issued {issued}. Forecast time {valid}.{stale}"
    )
    facts = [
        {"label": "Median rainfall", "value": median, "unit": "mm/h"},
        {"label": "Interval low", "value": low, "unit": "mm/h"},
        {"label": "Interval high", "value": high, "unit": "mm/h"},
    ]
    if probability is not None:
        facts.append({"label": "P(rain >= 2.5 mm/h)", "value": prob_text, "unit": "probability"})
    if context.get("baseline_value") is not None:
        baseline = _fmt_number(float(context["baseline_value"]), 3)
        facts.append({"label": "24h persistence baseline", "value": baseline, "unit": "mm/h"})
    label = f"Predictive Hazard Model - {city} - heavy_rain"
    return sentence, facts, label


def answer(question: str, context: Optional[dict] = None) -> dict:
    """
    Build one short answer from `context`.

    Numeric fields are formatted once from the values supplied by the caller.
    """
    context = context or {}
    family = context.get("family") or classify(question)
    city = context.get("city") or "Karachi"
    sections = list(context.get("sections") or [])
    hits = retrieve(question, sections, family)
    used = hits[:1]
    supported = bool(used)
    citations: list[dict] = []
    facts: list[dict] = []
    data_rows: list[dict] = []
    model_label = None
    zone = context.get("zone") or (city if context.get("city") else None)
    safety = family == "heat_health" or any(phrase in question.lower() for phrase in _SAFETY_PHRASES)
    status = "answered"
    limitations = None
    parts: list[str] = []

    for section in used:
        parts.append(section["text"])
        citations.append(
            {
                "source": "document_catalog",
                "detail": section["text"],
                "title": section["title"],
                "section": section["section"],
            }
        )

    if family == "unknown":
        status = "unknown"
        supported = False
        parts = [
            "I can only answer from hourly weather, the rainfall model, pipeline runs, "
            "model evaluation, the document catalog, and the declared forecast coverage. "
            "That question is outside those tables, so I will not estimate a number."
        ]
        limitations = "An unsupported question gets no guessed value."
        zone = None
    elif family == "weather":
        supported = False
        citations = []
        if context.get("has_weather"):
            bits, facts, row_id = _weather_bits(context)
            when = context.get("observed_at") or "an unknown time"
            parts = [
                f"Latest observed temperature, humidity and rainfall for {city} from the weather table: "
                + ", ".join(bits)
                + f" at {when}. This is an observation from the weather table, not a document forecast."
            ]
            if row_id:
                data_rows.append(
                    {"label": f"weather_hourly - {city} - {when}", "row_id": row_id}
                )
            limitations = (
                "The document library has no section that answers today's weather, "
                "so this uses the stored weather row only."
            )
        else:
            status = "unavailable"
            parts = [
                f"No gold weather row is stored for {city}, so temperature, humidity and rainfall are missing."
            ]
            limitations = "A missing weather row is not replaced with a document."
    elif family == "heat":
        supported = False
        if context.get("temperature_c") is None:
            status = "unavailable"
            parts = [f"No observed temperature is stored for {city}. Heat is not given a model forecast."]
            limitations = "Heat is compared with monitoring thresholds. There is no heat prediction model."
        else:
            value = float(context["temperature_c"])
            shown = _fmt_number(value, 1)
            when = context.get("observed_at") or "an unknown time"
            parts = [
                f"The latest observed air temperature in {city} is {shown}°C at {when}. "
                f"That reading is {_heat_band(value)}. "
                "This is an observation from hourly weather, not a heat forecast."
            ]
            facts.append({"label": "Temperature", "value": shown, "unit": "°C"})
            citations = [
                {
                    "source": "weather_hourly",
                    "detail": f"{city} temperature_2m_c at {when}",
                    "title": None,
                    "section": None,
                }
            ]
            if context.get("row_id"):
                data_rows.append(
                    {"label": f"weather_hourly - {city} - {when}", "row_id": context["row_id"]}
                )
            limitations = "Heat is observed against 35/40/45°C thresholds and is not ML-predicted."
    elif family == "heat_health":
        if context.get("temperature_c") is not None:
            value = float(context["temperature_c"])
            shown = _fmt_number(value, 1)
            when = context.get("observed_at") or "an unknown time"
            parts.append(
                f"The latest observed air temperature in {city} is {shown}°C at {when}. "
                f"That reading is {_heat_band(value)}. "
                "This is an observation from hourly weather, not a heat forecast."
            )
            facts.append({"label": "Temperature", "value": shown, "unit": "°C"})
            if context.get("row_id"):
                data_rows.append(
                    {"label": f"weather_hourly - {city} - {when}", "row_id": context["row_id"]}
                )
        elif not used:
            status = "unavailable"
            parts = [f"No heat document and no observed temperature are stored for {city}."]
        limitations = "In an emergency contact Sindh PDMA on 1736 and Rescue 1122."
        if not used:
            supported = False
    elif family == "rain":
        supported = False
        if context.get("precipitation_mm") is not None:
            shown = _fmt_number(float(context["precipitation_mm"]), 2)
            when = context.get("observed_at") or "an unknown time"
            parts.append(f"The latest observed precipitation in {city} is {shown} mm at {when}.")
            facts.append({"label": "Observed precipitation", "value": shown, "unit": "mm"})
            citations.append(
                {
                    "source": "weather_hourly",
                    "detail": f"{city} precipitation at {when}",
                    "title": None,
                    "section": None,
                }
            )
            if context.get("row_id"):
                data_rows.append(
                    {"label": f"weather_hourly - {city} - {when}", "row_id": context["row_id"]}
                )
        if context.get("median") is not None:
            sentence, pred_facts, model_label = _prediction_facts(city, context)
            parts.append(sentence)
            facts.extend(pred_facts)
            when_pred = context.get("forecast_time") or "unknown time"
            citations.append(
                {
                    "source": "predictions",
                    "detail": (
                        f"{city} heavy_rain {context.get('model_version') or 'saved model'} "
                        f"issued {context.get('issued_at') or 'an unknown time'}"
                    ),
                    "title": None,
                    "section": None,
                }
            )
            data_rows.append(
                {
                    "label": f"predictions - {city} - heavy_rain - {when_pred}",
                    "row_id": context.get("prediction_key")
                    or f"predictions|{city}|heavy_rain|{when_pred}",
                }
            )
        if not parts:
            status = "unavailable"
            parts = [f"No observed precipitation and no rainfall model row are stored for {city}."]
            limitations = "This assistant does not estimate rainfall when both tables are empty."
        else:
            limitations = (
                "The model horizon is 1 hour. A 24-hour or 7-day rainfall series is not stored. "
                "Observed millimetres and the model median are different quantities."
            )
    else:
        status = "unknown"
        supported = False
        parts = [
            "I can only answer from hourly weather, the rainfall model, pipeline runs, "
            "model evaluation, the document catalog, and the declared forecast coverage. "
            "That question is outside those tables, so I will not estimate a number."
        ]
        limitations = "An unsupported question gets no guessed value."

    text = " ".join(part.strip() for part in parts if part and part.strip())
    return {
        "question": question,
        "status": status,
        "answer": text.strip(),
        "citations": citations,
        "limitations": limitations,
        "supported": supported,
        "facts": facts,
        "data_rows": data_rows,
        "model_label": model_label,
        "zone": zone,
        "safety_related": safety,
    }
