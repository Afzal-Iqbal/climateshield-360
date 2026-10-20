"""
Grounded insight assistant.

Answers only from warehouse rows already loaded by the API: hourly weather,
the saved rainfall predictions, pipeline runs, model evaluation, the document
catalog, and the declared forecast-coverage list. It does not call a language
model and it does not invent a number when a table has no row.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException

from db import is_sample_database, safe_query
from forecasting.coverage import impact_forecast_coverage
from schemas import APIResponse, InsightAnswer, InsightCitation, InsightQuestion

router = APIRouter(prefix="/insight", tags=["Insight Agent"])

_TIME_WORDS = {
    "tomorrow",
    "today",
    "tonight",
    "next",
    "hour",
    "this",
    "the",
    "a",
    "an",
    "now",
    "later",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _fmt_pkt(value) -> str:
    dt = _as_utc(value)
    if dt is None:
        return "an unknown time"
    pkt = dt.astimezone(timezone(timedelta(hours=5)))
    return pkt.strftime("%d %b %Y %H:%M PKT")


def _envelope(answer: InsightAnswer) -> APIResponse[InsightAnswer]:
    return APIResponse(
        data=answer,
        generated_at=_now(),
        is_sample=is_sample_database(),
    )


def _cities() -> list[str]:
    rows = safe_query("SELECT DISTINCT city FROM weather_hourly WHERE city IS NOT NULL")
    return sorted({str(row["city"]) for row in rows if row.get("city")})


def _city_from_question(question: str, cities: list[str]) -> tuple[Optional[str], Optional[str]]:
    """Return (city, unknown_place). Default city is Karachi when no place is named."""
    lowered = {city.lower(): city for city in cities}
    mentioned = [city for city in cities if city.lower() in question]
    if mentioned:
        mentioned.sort(key=lambda city: question.find(city.lower()))
        return mentioned[0], None
    match = re.search(r"\b(?:in|for|at)\s+([a-z][a-z\-]+)", question)
    if match:
        token = match.group(1)
        if token not in _TIME_WORDS and token not in lowered:
            return None, token
    if "karachi" in lowered:
        return lowered["karachi"], None
    if cities:
        return cities[0], None
    return None, None


def _latest_weather(city: str) -> Optional[dict]:
    rows = safe_query(
        """
        SELECT timestamp_utc, temperature_2m_c, precipitation_mm, rain_mm
        FROM weather_hourly
        WHERE lower(city) = lower(?)
        ORDER BY timestamp_utc DESC
        LIMIT 1
        """,
        [city],
    )
    return rows[0] if rows else None


def _heat_band(temp_c: float) -> str:
    if temp_c >= 45:
        return "at or above the 45°C severe monitoring threshold"
    if temp_c >= 40:
        return "at or above the 40°C danger monitoring threshold"
    if temp_c >= 35:
        return "at or above the 35°C caution monitoring threshold"
    return "below the 35°C caution monitoring threshold"


def _answer_heat(question: str, city: str) -> InsightAnswer:
    row = _latest_weather(city)
    temp = None if row is None else row.get("temperature_2m_c")
    if temp is None:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer=f"No observed temperature is stored for {city}. Heat is not given a model forecast.",
            limitations="Heat is compared with monitoring thresholds. There is no heat prediction model.",
        )
    when = _fmt_pkt(row.get("timestamp_utc"))
    value = float(temp)
    return InsightAnswer(
        question=question,
        status="answered",
        answer=(
            f"The latest observed air temperature in {city} is {value:.1f}°C at {when}. "
            f"That reading is {_heat_band(value)}. "
            "This is an observation from hourly weather, not a heat forecast."
        ),
        citations=[
            InsightCitation(
                source="weather_hourly",
                detail=f"{city} temperature_2m_c at {when}",
            )
        ],
        limitations="Heat is observed against 35/40/45°C thresholds and is not ML-predicted.",
    )


def _answer_rain(question: str, city: str) -> InsightAnswer:
    weather = _latest_weather(city)
    preds = safe_query(
        """
        SELECT city, forecast_time, probability, interval_low, interval_high,
               baseline_value, median, model_version, generated_at
        FROM predictions
        WHERE lower(city) = lower(?) AND hazard_type = 'heavy_rain'
        ORDER BY forecast_time DESC
        LIMIT 1
        """,
        [city],
    )
    parts: list[str] = []
    citations: list[InsightCitation] = []
    if weather is not None and (weather.get("precipitation_mm") is not None or weather.get("rain_mm") is not None):
        raw = weather.get("precipitation_mm")
        if raw is None:
            raw = weather.get("rain_mm")
        when = _fmt_pkt(weather.get("timestamp_utc"))
        parts.append(
            f"The latest observed precipitation in {city} is {float(raw):.2f} mm at {when}."
        )
        citations.append(InsightCitation(source="weather_hourly", detail=f"{city} precipitation at {when}"))
    if preds:
        pred = preds[0]
        issued = _fmt_pkt(pred.get("generated_at"))
        valid = _fmt_pkt(pred.get("forecast_time"))
        median = 0.0 if pred.get("median") is None else float(pred.get("median"))
        low = 0.0 if pred.get("interval_low") is None else float(pred.get("interval_low"))
        high = 0.0 if pred.get("interval_high") is None else float(pred.get("interval_high"))
        probability = None if pred.get("probability") is None else float(pred.get("probability"))
        forecast_at = _as_utc(pred.get("forecast_time"))
        stale = forecast_at is not None and forecast_at < _now()
        prob_text = "unavailable" if probability is None else f"{probability:.4f}"
        parts.append(
            f"The saved rainfall model for {city} gives a 1-hour median of {median:.3f} mm/h "
            f"(interval {low:.3f} to {high:.3f} mm/h) and P(rain >= 2.5 mm/h) of {prob_text}. "
            f"Issued {issued}. Forecast time {valid}."
            + (" This model row is stale because that forecast time has passed." if stale else "")
        )
        citations.append(
            InsightCitation(
                source="predictions",
                detail=f"{city} heavy_rain {pred.get('model_version') or 'saved model'} issued {issued}",
            )
        )
    if not parts:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer=f"No observed precipitation and no rainfall model row are stored for {city}.",
            limitations="This assistant does not estimate rainfall when both tables are empty.",
        )
    return InsightAnswer(
        question=question,
        status="answered",
        answer=" ".join(parts),
        citations=citations,
        limitations=(
            "The model horizon is 1 hour. A 24-hour or 7-day rainfall series is not stored. "
            "Observed millimetres and the model median are different quantities."
        ),
    )


def _answer_pipeline(question: str) -> InsightAnswer:
    rows = safe_query(
        """
        SELECT started_at, status
        FROM run_status
        WHERE lower(status) = 'success'
        ORDER BY started_at DESC
        LIMIT 1
        """
    )
    if not rows:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer="No successful pipeline run is stored, so the hourly countdown has no anchor time.",
            limitations="A missing run is not reported as a successful update.",
        )
    started = rows[0].get("started_at")
    started_utc = _as_utc(started)
    if started_utc is None:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer="The latest successful run has no readable start time.",
        )
    age_min = (_now() - started_utc).total_seconds() / 60.0
    state = "late (more than 90 minutes)" if age_min > 90 else "within the 90-minute on-time window"
    return InsightAnswer(
        question=question,
        status="answered",
        answer=(
            f"The last successful ingest started at {_fmt_pkt(started)} "
            f"({age_min:.0f} minutes ago) and is {state}. "
            "The weather ingest is configured on a 60-minute cycle from that run."
        ),
        citations=[InsightCitation(source="run_status", detail=f"latest success at {_fmt_pkt(started)}")],
        limitations="The countdown is the next 60-minute slot. It is not proof that a new fetch has started.",
    )


def _answer_model(question: str, city: Optional[str]) -> InsightAnswer:
    rows = safe_query(
        """
        SELECT group_type, group_value, metric, baseline_score, model_score
        FROM model_eval
        """
    )
    if not rows:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer="No model evaluation rows are stored.",
            limitations="A missing evaluation is not replaced with a remembered score.",
        )
    overall = next((row for row in rows if str(row.get("group_type")) == "overall"), None)
    parts: list[str] = []
    citations: list[InsightCitation] = []
    if overall is not None:
        base = float(overall["baseline_score"])
        model = float(overall["model_score"])
        change = ((base - model) / base * 100.0) if base else None
        change_text = f" That is a {change:.1f}% MAE change versus the stored baseline." if change is not None else ""
        parts.append(
            f"The stored overall {overall.get('metric')} is baseline {base:.4f} and model {model:.4f}.{change_text}"
        )
        citations.append(InsightCitation(source="model_eval", detail="overall row"))
    if city:
        city_row = next(
            (
                row
                for row in rows
                if str(row.get("group_type")) != "overall" and str(row.get("group_value", "")).lower() == city.lower()
            ),
            None,
        )
        if city_row is not None:
            parts.append(
                f"For {city_row.get('group_value')}, {city_row.get('metric')} is "
                f"baseline {float(city_row['baseline_score']):.4f} and model {float(city_row['model_score']):.4f}."
            )
            citations.append(
                InsightCitation(source="model_eval", detail=f"{city_row.get('group_value')} subgroup")
            )
    if not parts:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer="Model evaluation rows exist, but none match an overall or requested city group.",
        )
    parts.append("These are test-set scores, not a live forecast.")
    return InsightAnswer(
        question=question,
        status="answered",
        answer=" ".join(parts),
        citations=citations,
        limitations="Subgroup error can be worse than the overall score. Brier skill is a separate metric and is not implied by MAE.",
    )


def _answer_documents(question: str) -> InsightAnswer:
    docs = safe_query(
        "SELECT title, publisher, filename, quality_flags FROM document_catalog"
    )
    if not docs:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer="The document catalog is empty, so no official PDF can be quoted.",
        )
    matched = []
    for doc in docs:
        title = str(doc.get("title") or "")
        tokens = [token for token in re.split(r"[^a-z0-9]+", title.lower()) if len(token) > 3]
        if tokens and any(token in question for token in tokens):
            matched.append(doc)
    flags = sorted({str(doc.get("quality_flags") or "unspecified") for doc in docs})
    if matched:
        names = "; ".join(str(doc.get("title")) for doc in matched[:3])
        answer = (
            f"The catalog lists {names}. "
            f"Quality flag: {', '.join(flags)}. "
            "The files were not parsed, so this assistant will not quote a figure from them."
        )
    else:
        answer = (
            f"The catalog has {len(docs)} documents from "
            f"{', '.join(sorted({str(doc.get('publisher') or 'unknown') for doc in docs}))}. "
            f"Quality flag: {', '.join(flags)}. "
            "Text was not extracted, so this assistant cannot answer from those PDFs."
        )
    return InsightAnswer(
        question=question,
        status="answered",
        answer=answer,
        citations=[
            InsightCitation(
                source="document_catalog",
                detail=f"{len(docs)} rows; flags {', '.join(flags)}",
            )
        ],
        limitations="Unparsed documents are listed by title only. No page, table, or loss figure is inferred.",
    )


def _answer_coverage(question: str) -> InsightAnswer:
    items = impact_forecast_coverage()
    if not items:
        return InsightAnswer(
            question=question,
            status="unavailable",
            answer="Forecast coverage has not been declared.",
        )
    working = [item["impact_area"] for item in items if item["status"] == "working"]
    partial = [item["impact_area"] for item in items if item["status"] == "partial"]
    unsupported = [item["impact_area"] for item in items if item["status"] == "unsupported"]
    return InsightAnswer(
        question=question,
        status="answered",
        answer=(
            f"Working forecasts: {', '.join(working) if working else 'none'}. "
            f"Partial: {', '.join(partial) if partial else 'none'}. "
            f"Unsupported with the current data: {', '.join(unsupported)}."
        ),
        citations=[
            InsightCitation(source="forecast coverage", detail="declared status list, not a prediction")
        ],
        limitations="A partial rainfall model does not imply forecasts for health, agriculture, money, or infrastructure.",
    )


def _answer_emergency(question: str) -> InsightAnswer:
    return InsightAnswer(
        question=question,
        status="answered",
        answer=(
            "For an emergency, contact Sindh PDMA on 1736 and Rescue 1122. "
            "This assistant does not dispatch crews or turn a weather row into an evacuation order."
        ),
        citations=[
            InsightCitation(
                source="dashboard official notice",
                detail="Sindh PDMA 1736 and Rescue 1122, also listed on the methodology page",
            )
        ],
        limitations="These are published contact numbers, not a forecast.",
    )


def _classify(question: str) -> str:
    if any(word in question for word in ("emergency", "pdma", "rescue", "1122", "1736", "helpline")):
        return "emergency"
    if any(word in question for word in ("document", "pdf", "ndma", "parsed", "strategy", "bulletin")):
        return "documents"
    if any(word in question for word in ("mae", "baseline", "brier", "accuracy", "model eval", "evaluation")):
        return "model"
    if any(word in question for word in ("impact area", "eight impact", "agriculture", "economic", "infrastructure", "which forecast", "forecast coverage")):
        return "coverage"
    if any(word in question for word in ("temperature", "heat", "hot", "celsius", "wbgt")) and "rain" not in question:
        return "heat"
    if any(word in question for word in ("rain", "rainfall", "precipitation", "shower")) or "forecast" in question:
        return "rain"
    if any(word in question for word in ("ingest", "pipeline", "fresh", "hourly", "last run", "stale", "update")):
        return "pipeline"
    if "model" in question:
        return "model"
    if "health" in question or "hospital" in question:
        return "coverage"
    return "unknown"


@router.post("/ask", response_model=APIResponse[InsightAnswer])
def ask_insight(body: InsightQuestion) -> APIResponse[InsightAnswer]:
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is empty.")
    if len(question) > 500:
        raise HTTPException(status_code=400, detail="Question is longer than 500 characters.")

    kind = _classify(question.lower())
    if kind == "unknown":
        return _envelope(
            InsightAnswer(
                question=question,
                status="unknown",
                answer=(
                    "I can only answer from hourly weather, the rainfall model, pipeline runs, "
                    "model evaluation, the document catalog, and the declared forecast coverage. "
                    "That question is outside those tables, so I will not estimate a number."
                ),
                limitations="An unsupported question gets no guessed value.",
            )
        )

    if kind == "emergency":
        return _envelope(_answer_emergency(question))
    if kind == "documents":
        return _envelope(_answer_documents(question.lower()))
    if kind == "coverage":
        return _envelope(_answer_coverage(question))

    cities = _cities()
    city, unknown = _city_from_question(question.lower(), cities)
    if kind in {"heat", "rain"} and unknown:
        return _envelope(
            InsightAnswer(
                question=question,
                status="unavailable",
                answer=f"No weather rows are stored for {unknown}. Nothing was substituted from another city.",
                limitations="City names have to match weather_hourly.",
            )
        )
    if kind == "heat":
        return _envelope(_answer_heat(question, city or "Karachi"))
    if kind == "rain":
        return _envelope(_answer_rain(question, city or "Karachi"))
    if kind == "pipeline":
        return _envelope(_answer_pipeline(question))
    return _envelope(_answer_model(question, city if unknown is None else None))
