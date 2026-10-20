"""
src/rag/agent.py - Hybrid RAG Agent for ClimateShield 360 Karachi.

VIVA & EXAM TECHNICAL DEFENSE:
==============================
1. Hybrid RAG Architecture:
   - Unstructured Domain Knowledge: Official NDMA, PDMA Sindh, PMD, and WHO advisories
     are indexed in ChromaDB and retrieved via dense semantic vector search (cosine distance).
   - Structured Warehouse Gold Records: Live measurements, risk indexes, and model forecasts
     are retrieved from DuckDB tables ('predictions', 'exposure_index', 'district_snapshot')
     in read-only mode (AGENT_RULES.md Rule 11).
   - Hybrid Fusion: Synthesizes qualitative emergency advisories with verified quantitative data.

2. Zero-Hallucination Numeric Slot-Filling (Placeholder Contract):
   - Problem: Generative LLMs frequently hallucinate floating-point metrics, casualty counts,
     and false dates when answering disaster queries.
   - Solution: The LLM is strictly prohibited from generating raw digits. It is prompted to use
     slot-filling placeholders ({n1}, {n2}, ...).
   - Deterministic Binding: Python code binds the exact verified numbers from the gold database
     rows into these slots and tracks their source row_ids.
   - Guardrail Validation: A regex validator scans the final output. If ANY number appears that
     did not originate from the retrieved gold rows, the response is rejected (supported=False).

3. Fail-Closed Fallback & Truthfulness:
   - If the semantic distance exceeds the confidence threshold AND no warehouse rows match,
     or if the user presents false premises (e.g. "confirm that X killed 500 people"), the agent
     refuses to speculate, returning supported=False and identifying missing facts.

4. Public Safety Guardrail (Rule 6):
   - Health or life-safety queries automatically mandate the inclusion of official emergency
     contact information (Rescue 1122 / NDMA) and standard non-advisory disclaimers.

5. API Key Security & Caching (Rule 7):
   - API keys are read exclusively from environment variables (GEMINI_API_KEY / OPENAI_API_KEY).
   - A thread-safe caching layer (SHA-256 prompt hash) deduplicates LLM calls to prevent rate limits
     and redundant cloud compute.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import duckdb
import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv

# Load local environment variables from .env file if present
load_dotenv()

# Repository and data paths
import sys
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

CHROMA_DIR = PROJECT_ROOT / "data" / "chroma_db"
COLLECTION_NAME = "climateshield_library"
REAL_DB_PATH = PROJECT_ROOT / "pipeline" / "data" / "processed" / "climateshield.duckdb"
SAMPLE_DB_PATH = PROJECT_ROOT / "warehouse" / "sample.duckdb"

# Thresholds and Limits
# In Chroma cosine space (1 - cosine_similarity):
# Values <= 0.50 indicate high semantic relevance; > 0.50 indicates weak or unrelated queries.
DEFAULT_DISTANCE_THRESHOLD = 0.50

DISCLAIMER_ONLY = "Information only, not professional advice."
EMERGENCY_FOOTER = (
    "Information only, not professional advice. In an emergency contact official services: "
    "Rescue 1122 or the National Disaster Management Authority (NDMA)."
)
HEALTH_EMERGENCY_POINTER = (
    "Health & Safety Advisory: For acute heat exhaustion, heatstroke, or medical emergencies, "
    "immediately contact Rescue 1122 or proceed to the nearest emergency healthcare facility."
)

# Number extraction regex
NUMBER_REGEX = re.compile(r"\b\d+(?:\.\d+)?\b")

# Health / Emergency detection keywords
HEALTH_KEYWORDS = {
    "heatstroke",
    "heat stroke",
    "exhaustion",
    "dehydration",
    "hospital",
    "patient",
    "casualty",
    "health",
    "medical",
    "illness",
    "symptom",
    "fever",
    "emergency",
    "ambulance",
    "rescue",
    "flood danger",
    "flash flood",
    "injury",
    "drowning",
    "safety",
}

# Misleading casualty / unverified loss query triggers
UNVERIFIED_CLAIM_REGEX = re.compile(
    r"\b(died|deaths|killed|fatalit|casualt|kill|dead|murdered)\b",
    re.IGNORECASE,
)

# Conversational Greeting & Help intent regex
GREETING_REGEX = re.compile(
    r"^\s*(hi|hello|hey|heya|howdy|salam|a?salaam|assalam\s*o?\s*alaikum|good\s*(morning|afternoon|evening|day)|help|who\s*are\s*you|what\s*can\s*you\s*do|what\s*is\s*this)[\s\?!.]*$",
    re.IGNORECASE,
)

# Thread-safe in-memory LLM cache
_CACHE_LOCK = threading.Lock()
_LLM_CACHE: Dict[str, str] = {}


def retrieve_observed_weather(target_zone: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Retrieve latest observed weather row from weather_hourly for observed-data answers.
    Viva point: Fulfills Requirement 12 - answers weather queries from observed warehouse facts.
    """
    city_lookup = "Karachi"
    if target_zone:
        if "karachi" in target_zone.lower() or target_zone.upper().startswith("KHI"):
            city_lookup = "Karachi"
        else:
            city_lookup = target_zone

    try:
        conn = get_duckdb_connection()
        row = conn.execute(
            """
            SELECT city, timestamp_pkt, temperature_2m_c, relative_humidity_pct, rain_mm, row_id
            FROM weather_hourly
            WHERE UPPER(city) = UPPER(?)
            ORDER BY timestamp_pkt DESC
            LIMIT 1;
            """,
            [city_lookup],
        ).fetchone()
        conn.close()
        if row:
            city_name, ts, temp, humidity, rain, row_id = row
            return {
                "city": city_name,
                "timestamp_pkt": ts,
                "temperature": round(float(temp), 1) if temp is not None else None,
                "humidity": round(float(humidity), 1) if humidity is not None else None,
                "rain_mm": round(float(rain), 1) if rain is not None else 0.0,
                "row_id": str(row_id),
            }
    except Exception as exc:
        print(f"[RAG Agent] Database weather query notice: {exc}")
    return None


def is_general_weather_query(question: str) -> bool:
    """
    Detect if user is asking for daily/current weather (temperature, humidity, weather today)
    that the policy/hazard library cannot answer.
    """
    q = question.lower()
    if any(k in q for k in ["guideline", "sop", "plan", "vulnerab", "exposure", "contingency", "first responder", "hajj", "advisory", "hazard"]):
        return False
    weather_patterns = [
        r"\bweather\b",
        r"\bhow('s| is) the weather\b",
        r"\bwhat('s| is) the weather\b",
        r"\bcurrent weather\b",
        r"\btoday'?s weather\b",
        r"\bcurrent temperature\b",
        r"\btemperature today\b",
        r"\btemperature right now\b",
        r"\bwhat('s| is) the temperature\b",
    ]
    return any(re.search(pat, q) for pat in weather_patterns)


def is_section_topically_relevant(question: str, section: Dict[str, Any]) -> bool:
    """
    Check if a retrieved section is topically relevant to the question.
    Prevents citing NDMA contingency plans for general weather or unrelated queries.
    """
    q = question.lower()
    doc = (section.get("document") or "").lower()
    sec_title = (section.get("section") or "").lower()
    text = (section.get("text") or "").lower()

    # Off-topic keywords
    if any(k in q for k in ["stock", "market", "nintendo", "tokyo", "apple", "nasdaq", "cricket", "president", "election", "football", "bitcoin"]):
        return False

    is_q_heat = any(k in q for k in ["heat", "heatstroke", "heatwave", "sunstroke", "hyperthermia", "exhaustion", "dehydration"])
    is_doc_heat = any(k in doc or k in sec_title for k in ["heat", "heatwave", "who_signs", "who_public_health", "pdma_sindh_heatwave"])

    is_q_flood = any(k in q for k in ["flood", "rain", "monsoon", "river", "chenab", "indus", "inundation", "drainage"])
    is_doc_flood = any(k in doc or k in sec_title for k in ["flood", "monsoon", "pmd_flood"])

    if is_q_heat and not is_doc_heat and not any(k in text[:300] for k in ["heat", "heatstroke", "heatwave", "temperature"]):
        return False

    if is_q_flood and not is_doc_flood and not any(k in text[:300] for k in ["flood", "monsoon", "river"]):
        return False

    # Check term overlap
    q_words = set(re.findall(r"\b[a-zA-Z]{4,}\b", q)) - {
        "what", "whats", "where", "which", "about", "today", "official", "latest", "karachi", "tell", "does", "have"
    }
    if not q_words:
        return True

    overlap = [w for w in q_words if w in doc or w in sec_title or w in text[:300]]
    return len(overlap) >= 1



def get_duckdb_connection() -> duckdb.DuckDBPyConnection:
    """
    Connect to DuckDB in read-only mode to comply with AGENT_RULES.md Rule 11.
    Tries processed real DB first, then sample DB. Cross-attaches secondary if available.
    """
    db_path = REAL_DB_PATH if REAL_DB_PATH.exists() else SAMPLE_DB_PATH
    if not db_path.exists():
        raise FileNotFoundError(f"Neither {REAL_DB_PATH} nor {SAMPLE_DB_PATH} exists.")

    conn = duckdb.connect(str(db_path), read_only=True)
    if db_path == REAL_DB_PATH and SAMPLE_DB_PATH.exists():
        try:
            conn.execute(f"ATTACH '{SAMPLE_DB_PATH}' AS sample_db (READ_ONLY);")
        except Exception:
            pass
    elif db_path == SAMPLE_DB_PATH and REAL_DB_PATH.exists():
        try:
            conn.execute(f"ATTACH '{REAL_DB_PATH}' AS real_db (READ_ONLY);")
        except Exception:
            pass
    return conn


def detect_target_zone_or_city(question: str, explicit_zone: Optional[str] = None) -> Optional[str]:
    """
    Extract relevant zone_id or city name from the question if not explicitly provided.
    Viva point: Normalizes multi-dialect and district names into canonical identifiers.
    Returns None if no specific geographical target is identified.
    """
    if explicit_zone and explicit_zone.strip() and explicit_zone.strip().lower() != "all":
        return explicit_zone.strip()

    lowered = question.lower()
    known_districts = {
        "malir": "KHI-MALIR",
        "korangi": "KHI-KORANGI",
        "central": "Central Karachi",
        "east": "East Karachi",
        "west": "West Karachi",
        "south": "South Karachi",
        "keamari": "Keamari",
        "karachi": "Karachi",
        "lahore": "Lahore",
        "rawalpindi": "Rawalpindi",
        "islamabad": "Islamabad",
        "faisalabad": "Faisalabad",
        "multan": "Multan",
        "peshawar": "Peshawar",
        "quetta": "Quetta",
        "hyderabad": "Hyderabad",
        "sukkur": "Sukkur",
        "gwadar": "Gwadar",
        "gilgit": "Gilgit",
    }
    for name, canonical in known_districts.items():
        if name in lowered:
            return canonical
    return None


def retrieve_gold_rows(target_zone: Optional[str], question: str) -> List[Dict[str, Any]]:
    """
    Retrieve matching rows from predictions, exposure_index, and district_snapshot.
    Viva point: Strictly read-only queries with fallback across attached schemas.
    Topically scoped to the user question so irrelevant tables/hazards are not retrieved.
    """
    if not target_zone:
        return []

    q_lower = question.lower()

    # 1. Qualitative Advisory Queries: If user is asking for guidance, symptoms, SOPs,
    #    and not asking for numbers/statistics/probabilities, do not pull database predictions.
    is_guidance_query = any(k in q_lower for k in [
        "guideline", "sop", "advice", "what should", "symptom", "sign",
        "who say", "ndma say", "pmd say", "precaution", "measure", "protocol",
        "first responder", "dehydration", "treatment", "protect", "bulletin"
    ])
    asks_for_numbers = any(k in q_lower for k in [
        "probability", "percent", "population", "forecast", "vulnerability",
        "rate", "score", "risk level", "risk levels", "numbers", "data", "table",
        "census", "hospital", "how many", "what is the risk", "exposure",
        "statistics", "metric", "chance"
    ])
    if is_guidance_query and not asks_for_numbers:
        return []

    # 2. Hazard filtering
    is_heat_query = any(k in q_lower for k in ["heat", "heatwave", "temperature", "sunstroke", "hyperthermia", "exhaustion"])
    is_rain_query = any(k in q_lower for k in ["rain", "flood", "monsoon", "precipitation", "drainage", "river", "inundation", "heavy_rain"])

    hazard_filter: Optional[str] = None
    if is_heat_query and not is_rain_query:
        hazard_filter = "heat"
    elif is_rain_query and not is_heat_query:
        hazard_filter = "heavy_rain"

    # 3. Infrastructure / Census filtering
    asks_about_infra = any(k in q_lower for k in [
        "population", "census", "hospital", "facilities", "infrastructure",
        "snapshot", "demographic", "people", "residents"
    ])

    facts: List[Dict[str, Any]] = []
    try:
        conn = get_duckdb_connection()
    except Exception as exc:
        print(f"[RAG Agent] Database connection failed: {exc}")
        return facts

    try:
        def safe_fetch(sql: str, params: list) -> list:
            try:
                return conn.execute(sql, params).fetchall()
            except Exception:
                return []

        # 1. Query 'exposure_index' (e.g. from sample_db or main)
        if hazard_filter:
            exp_sql = """
            SELECT zone_id, hazard_type, exposed_population, facilities_count,
                   vulnerability_score, risk_level, evidence_strength
            FROM (
                SELECT * FROM exposure_index
                UNION ALL
                SELECT * FROM sample_db.exposure_index
            )
            WHERE (UPPER(zone_id) LIKE UPPER(?) OR UPPER(?) LIKE '%' || UPPER(zone_id) || '%')
              AND LOWER(hazard_type) = LOWER(?)
            LIMIT 2;
            """
            exp_params = [f"%{target_zone}%", target_zone, hazard_filter]
        else:
            exp_sql = """
            SELECT zone_id, hazard_type, exposed_population, facilities_count,
                   vulnerability_score, risk_level, evidence_strength
            FROM (
                SELECT * FROM exposure_index
                UNION ALL
                SELECT * FROM sample_db.exposure_index
            )
            WHERE UPPER(zone_id) LIKE UPPER(?) OR UPPER(?) LIKE '%' || UPPER(zone_id) || '%'
            LIMIT 2;
            """
            exp_params = [f"%{target_zone}%", target_zone]

        exposure_rows = safe_fetch(exp_sql, exp_params)
        if not exposure_rows and ("karachi" in target_zone.lower() or target_zone.startswith("KHI")):
            if hazard_filter:
                exposure_rows = safe_fetch(
                    """
                    SELECT zone_id, hazard_type, exposed_population, facilities_count,
                           vulnerability_score, risk_level, evidence_strength
                    FROM exposure_index
                    WHERE LOWER(hazard_type) = LOWER(?)
                    LIMIT 2;
                    """,
                    [hazard_filter],
                )
            else:
                exposure_rows = safe_fetch(
                    """
                    SELECT zone_id, hazard_type, exposed_population, facilities_count,
                           vulnerability_score, risk_level, evidence_strength
                    FROM exposure_index
                    LIMIT 2;
                    """,
                    [],
                )

        for row in exposure_rows:
            zone_id, hazard, exposed_pop, facilities, vuln_score, risk_level, evidence = row
            row_id = f"exposure_index|{zone_id}|{hazard}"
            facts.append({
                "table": "exposure_index",
                "row_id": row_id,
                "label": f"Exposure and Vulnerability ({zone_id} - {hazard})",
                "fields": {
                    "zone_id": zone_id,
                    "hazard_type": hazard,
                    "exposed_population": exposed_pop,
                    "facilities_count": facilities,
                    "vulnerability_score": round(float(vuln_score), 4) if vuln_score is not None else None,
                    "risk_level": risk_level,
                    "evidence_strength": evidence,
                },
            })

        # 2. Query 'predictions'
        if hazard_filter:
            pred_sql = """
            SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR) as forecast_time
            FROM (
                SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR) as forecast_time FROM predictions
                UNION ALL
                SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR) as forecast_time FROM sample_db.predictions
            )
            WHERE (UPPER(zone_id) LIKE UPPER(?) OR UPPER(?) LIKE '%' || UPPER(zone_id) || '%')
              AND LOWER(hazard_type) = LOWER(?)
            LIMIT 2;
            """
            pred_params = [f"%{target_zone}%", target_zone, hazard_filter]
        else:
            pred_sql = """
            SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR) as forecast_time
            FROM (
                SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR) as forecast_time FROM predictions
                UNION ALL
                SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR) as forecast_time FROM sample_db.predictions
            )
            WHERE UPPER(zone_id) LIKE UPPER(?) OR UPPER(?) LIKE '%' || UPPER(zone_id) || '%'
            LIMIT 2;
            """
            pred_params = [f"%{target_zone}%", target_zone]

        pred_rows = safe_fetch(pred_sql, pred_params)
        if not pred_rows and ("karachi" in target_zone.lower() or target_zone.startswith("KHI")):
            if hazard_filter:
                pred_rows = safe_fetch(
                    """
                    SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR)
                    FROM predictions
                    WHERE LOWER(hazard_type) = LOWER(?)
                    LIMIT 2;
                    """,
                    [hazard_filter],
                )
            else:
                pred_rows = safe_fetch(
                    """
                    SELECT zone_id, hazard_type, probability, interval_low, interval_high, baseline_value, CAST(forecast_time AS VARCHAR)
                    FROM predictions
                    LIMIT 2;
                    """,
                    [],
                )

        for row in pred_rows:
            zone_id, hazard, prob, low, high, base, f_time = row
            row_id = f"predictions|{zone_id}|{hazard}|{f_time}"
            facts.append({
                "table": "predictions",
                "row_id": row_id,
                "label": f"Predictive Hazard Model ({zone_id} - {hazard})",
                "fields": {
                    "hazard_type": hazard,
                    "probability": round(float(prob), 4) if prob is not None else None,
                    "interval_low": round(float(low), 4) if low is not None else None,
                    "interval_high": round(float(high), 4) if high is not None else None,
                    "baseline_value": round(float(base), 4) if base is not None else None,
                },
            })

        # 3. Query 'district_snapshot' only if the user specifically asked for infrastructure/population/census
        if asks_about_infra:
            district_rows = safe_fetch(
                """
                SELECT region_name, district_name, pbs_total_pop, osm_hospitals_count,
                       osm_access_pop_hospitals_30min, row_id
                FROM district_snapshot
                WHERE UPPER(region_name) LIKE UPPER(?) OR UPPER(district_name) LIKE UPPER(?)
                LIMIT 2;
                """,
                [f"%{target_zone}%", f"%{target_zone}%"],
            )
            for row in district_rows:
                region, district, pop, hosp_count, hosp_access, r_id = row
                facts.append({
                    "table": "district_snapshot",
                    "row_id": str(r_id or f"district|{district or region}"),
                    "label": f"District Census & Infrastructure ({district or region})",
                    "fields": {
                        "total_population": pop,
                        "hospitals_count": hosp_count,
                        "population_within_30min_hospital": hosp_access,
                    },
                })

    finally:
        conn.close()

    return facts


def retrieve_library_sections(question: str, top_k: int = 3) -> Tuple[List[Dict[str, Any]], float]:
    """
    Retrieve top-k relevant sections from persistent ChromaDB collection.
    Returns: (sections, best_distance)
    Viva point: Uses cosine distance. Lower distance means higher semantic match.
    """
    if not CHROMA_DIR.exists():
        return [], 1.0

    try:
        client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        from src.rag.build_index import get_multilingual_embedding_function
        embed_fn = get_multilingual_embedding_function()

        try:
            collection = client.get_collection(
                name=COLLECTION_NAME, embedding_function=embed_fn
            )
        except Exception:
            collection = client.get_collection(name=COLLECTION_NAME)

        results = collection.query(
            query_texts=[question],
            n_results=top_k,
        )

        sections: List[Dict[str, Any]] = []
        best_distance = 1.0

        if results and results.get("documents") and results["documents"][0]:
            docs = results["documents"][0]
            metas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(docs)
            distances = results["distances"][0] if results.get("distances") else [0.0] * len(docs)

            for doc_text, meta, dist in zip(docs, metas, distances):
                sections.append({
                    "document": meta.get("document", "Unknown Official Document"),
                    "section": meta.get("section", "General Advisory"),
                    "page": meta.get("page", 1),
                    "text": doc_text,
                    "distance": float(dist),
                })
            best_distance = min(distances) if distances else 1.0

        return sections, best_distance

    except Exception as exc:
        print(f"[RAG Agent] Chroma retrieval error: {exc}")
        return [], 1.0


def extract_slot_mappings(facts: List[Dict[str, Any]]) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    """
    Build numerical slot mappings for generation:
    Returns:
    - placeholder_to_value: {"{n1}": "0.89", "{n2}": "980000", ...}
    - placeholder_to_row_id: {"{n1}": "exposure_index|KHI-MALIR|heat", ...}
    - placeholder_to_desc: {"{n1}": "KHI-MALIR vulnerability score", ...}
    Viva point: Guarantees every slot is traced back to a specific table row_id.
    """
    placeholder_to_value: Dict[str, str] = {}
    placeholder_to_row_id: Dict[str, str] = {}
    placeholder_to_desc: Dict[str, str] = {}

    slot_counter = 1
    for fact in facts:
        row_id = fact["row_id"]
        label = fact["label"]
        for field_name, value in fact["fields"].items():
            if value is None:
                continue
            val_str = str(value).strip()
            if re.match(r"^-?\d+(?:\.\d+)?$", val_str):
                token = f"{{n{slot_counter}}}"
                placeholder_to_value[token] = val_str
                placeholder_to_row_id[token] = row_id
                placeholder_to_desc[token] = f"{label} :: {field_name.replace('_', ' ')}"
                slot_counter += 1

    return placeholder_to_value, placeholder_to_row_id, placeholder_to_desc


def call_llm_with_cache(prompt: str, temperature: float = 0.0) -> str:
    """
    Invoke LLM for wording only, using caching to prevent duplicate API costs.
    API keys are loaded ONLY via environment variables (AGENT_RULES.md Rule 7).
    Viva point:
    - Temperature 0.0 ensures deterministic, reproducible decision-support outputs.
    - If no API key is provided, or in offline/test environments,
      uses a verified template generator that respects the placeholder contract.
    """
    cache_key = f"{prompt}|temp={temperature}"
    prompt_hash = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()

    with _CACHE_LOCK:
        if prompt_hash in _LLM_CACHE:
            return _LLM_CACHE[prompt_hash]

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("CLIMATESHIELD_LLM_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    wording = None

    if gemini_key:
        try:
            from google import genai
            from google.genai import types

            model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
            client = genai.Client(
                api_key=gemini_key,
                http_options=types.HttpOptions(timeout=10000),  # 10s timeout (Google GenAI min)
            )
            config = types.GenerateContentConfig(
                temperature=float(temperature),
                system_instruction=(
                    "You are the ClimateShield 360 Insight Agent providing extreme-weather decision support for Karachi. "
                    "Write authoritative, articulate, and fluent domain phrasing based on official advisories. "
                    "CRITICAL PROVENANCE RULE: You are STRICTLY FORBIDDEN from typing any literal digits (0-9). "
                    "You must use the provided slot placeholders like {n1}, {n2} for every metric, probability, and count."
                ),
            )
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            )
            if response and response.text:
                wording = response.text.strip()
        except Exception as exc:
            print(f"[RAG Agent] Live LLM notice ({exc}). Using deterministic synthesizer.")

    elif openai_key:
        try:
            import openai
            client = openai.OpenAI(api_key=openai_key)
            model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are the ClimateShield 360 Insight Agent providing extreme-weather decision support for Karachi. "
                            "Write authoritative, articulate, and fluent domain phrasing based on official advisories. "
                            "CRITICAL PROVENANCE RULE: You are STRICTLY FORBIDDEN from typing any literal digits (0-9). "
                            "You must use the provided slot placeholders like {n1}, {n2} for every metric, probability, and count."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=float(temperature),
            )
            if response.choices and response.choices[0].message.content:
                wording = response.choices[0].message.content.strip()
        except Exception as exc:
            print(f"[RAG Agent] OpenAI API call notice ({exc}). Falling back to deterministic synthesizer.")

    # High-fidelity fallback synthesizer if API key is not configured or fails
    if not wording:
        wording = synthesize_safe_wording_from_prompt(prompt)

    with _CACHE_LOCK:
        _LLM_CACHE[prompt_hash] = wording

    return wording


def synthesize_safe_wording_from_prompt(prompt: str) -> str:
    """
    Deterministic synthesis for tests and offline Viva environments.
    Extracts placeholders from the prompt and constructs a grammatically sound,
    fully compliant draft stating each number and model label once (Requirement 13).
    """
    available_slots = re.findall(r"(\{n\d+\}):\s*([^\n]+)", prompt)
    if not available_slots:
        return "Based on verified records, this topic is acknowledged, but no specific numerical measurements match this query."

    # Group slots by model / table label
    # desc format is: "{label} :: {field_name}"
    groups: Dict[str, List[Tuple[str, str]]] = {}
    for token, desc in available_slots:
        if " :: " in desc:
            model_label, metric_name = desc.split(" :: ", 1)
        elif " - " in desc:
            model_label, metric_name = desc.rsplit(" - ", 1)
        else:
            model_label, metric_name = "Warehouse Metric", desc
        model_label = model_label.strip()
        metric_name = metric_name.strip()
        if model_label not in groups:
            groups[model_label] = []
        groups[model_label].append((token, metric_name))

    sentences = []
    for model_label, items in list(groups.items())[:2]:
        metrics_phrase = ", ".join([f"{metric} is {token}" for token, metric in items])
        sentences.append(f"{model_label}: {metrics_phrase}")

    return "Verified records indicate " + "; while ".join(sentences) + "."


def answer(
    question: str,
    zone_id: Optional[str] = None,
    distance_threshold: float = DEFAULT_DISTANCE_THRESHOLD,
    temperature: float = 0.0,
) -> Dict[str, Any]:
    """
    Main RAG Agent Question-Answering Function.
    Contract:
      answer(question: str, zone_id: str | None = None) -> dict
      returning {text, citations[{document, section}], row_ids, limits, supported}.

    Viva Step-by-Step Flow:
    1. Input Sanity & Guardrail Validation (reject empty, malicious, or false casualty claims).
    2. Observed Data Check: If question asks for daily weather that policy library cannot answer,
       answer with observed weather from weather_hourly gold row with supported=False (Req 12).
    3. Hybrid Retrieval:
       - Structured DuckDB query for gold rows from predictions, exposure_index, district_snapshot.
       - Vector search in ChromaDB for domain guidance (NDMA/PMD/PDMA/WHO).
    4. Fail-Closed Threshold & Topical Relevance: Require sections to be topically relevant.
    5. Numeric Placeholder Mapping ({n1}, {n2}, ...) stating each number once.
    6. Deterministic Slot-Filling and Strict Regex Number Verification.
    7. Citations capped at documents actually supporting a sentence (Req 14).
    8. Emergency protocol line only when health/safety related (Req 11).
    """
    clean_q = (question or "").strip()
    if not clean_q:
        return {
            "text": "I don't know. The question is empty.",
            "citations": [],
            "row_ids": [],
            "limits": DISCLAIMER_ONLY,
            "supported": False,
        }

    # Conversational Greeting & Help intent
    if GREETING_REGEX.match(clean_q):
        return {
            "text": (
                "Hello! I am the ClimateShield 360 AI Climate Assistant for Karachi.\n\n"
                "I provide evidence-based decision support using verified disaster guidelines "
                "(NDMA, PDMA Sindh, PMD, WHO) and DuckDB warehouse gold tables. Numbers are exact "
                "and citations link to official source manifests.\n\n"
                "You can ask me questions such as:\n"
                "• 'What should people do in a heatwave according to NDMA?'\n"
                "• 'What does the latest PMD flood bulletin say?'\n"
                "• 'What does WHO say about signs of heat stroke?'\n"
                "• 'What are the heat and rain risk levels for Malir?'\n"
                "• 'What is the current temperature and weather today in Karachi?'"
            ),
            "citations": [],
            "row_ids": [],
            "limits": DISCLAIMER_ONLY,
            "supported": True,
            "metrics": [],
        }

    # Guardrail: Check for misleading casualty/mortality claims (e.g. "confirm X killed 500 people")
    # AGENT_RULES.md Rule 2: "No synthetic data presented as real."
    has_unverified_mortality_query = bool(UNVERIFIED_CLAIM_REGEX.search(clean_q))
    if has_unverified_mortality_query:
        return {
            "text": (
                "I cannot confirm or validate casualty or mortality figures. Verified warehouse tables "
                "do not track clinical mortality counts, and synthetic casualty claims are strictly rejected."
            ),
            "citations": [],
            "row_ids": [],
            "limits": DISCLAIMER_ONLY,
            "supported": False,
        }

    # 1. Resolve Target Zone
    target_zone = detect_target_zone_or_city(clean_q, zone_id)

    # 2. Check for daily/current weather question (Requirement 12)
    # The policy library cannot answer daily weather; answer from weather_hourly if gold row exists
    if is_general_weather_query(clean_q):
        weather = retrieve_observed_weather(target_zone)
        if weather:
            city = weather["city"]
            temp = weather["temperature"]
            hum = weather["humidity"]
            rain = weather["rain_mm"]
            row_id = weather["row_id"]
            text = (
                f"Latest observed temperature, humidity and rainfall for {city} from the weather table: "
                f"{temp}°C, {hum}% humidity, and {rain} mm rainfall. "
                "Missing: daily weather forecast narrative in the official document library."
            )
            metrics = [
                {"group": f"Observed Weather · {city}", "label": "Temperature", "raw_value": temp, "formatted_value": f"{temp}°C", "unit": "°C"},
                {"group": f"Observed Weather · {city}", "label": "Relative Humidity", "raw_value": hum, "formatted_value": f"{hum}%", "unit": "%"},
                {"group": f"Observed Weather · {city}", "label": "Rainfall", "raw_value": rain, "formatted_value": f"{rain} mm", "unit": "mm"},
            ]
            return {
                "text": text,
                "citations": [],
                "row_ids": [row_id],
                "limits": DISCLAIMER_ONLY,
                "supported": False,
                "metrics": metrics,
            }
        else:
            return {
                "text": (
                    f"I don't know. No observed weather records found for '{target_zone or 'specified area'}'. "
                    "Missing: daily weather forecast narrative in official documents and observed weather table records."
                ),
                "citations": [],
                "row_ids": [],
                "limits": DISCLAIMER_ONLY,
                "supported": False,
            }

    # 3. Hybrid Retrieval: Gold rows + Document sections
    gold_rows = retrieve_gold_rows(target_zone, clean_q)
    sections, best_distance = retrieve_library_sections(clean_q, top_k=3)

    # Filter sections by relevance threshold and topical relevance (Requirement 12)
    relevant_sections = [
        s for s in sections
        if s.get("distance", 1.0) <= distance_threshold and is_section_topically_relevant(clean_q, s)
    ]
    is_retrieval_weak = len(relevant_sections) == 0

    # 4. Fail-Closed Threshold Validation (Requirement 4 & 12)
    if zone_id and not gold_rows:
        return {
            "text": (
                f"I don't know. The gold warehouse tables do not contain records for zone '{zone_id}'. "
                "Missing: verified predictions, exposure index, or district snapshot rows."
            ),
            "citations": [],
            "row_ids": [],
            "limits": DISCLAIMER_ONLY,
            "supported": False,
        }

    if is_retrieval_weak and not gold_rows:
        return {
            "text": (
                "I don't know. The best retrieval score is below the confidence threshold, "
                "and no matching warehouse rows were found. "
                "Missing: authoritative documentation in docs/library/ and matching gold table records for this query."
            ),
            "citations": [],
            "row_ids": [],
            "limits": DISCLAIMER_ONLY,
            "supported": False,
        }

    # 5. Extract Slot Mappings
    slot_to_val, slot_to_row, slot_to_desc = extract_slot_mappings(gold_rows)

    # 6. Build LLM Prompt
    context_blocks = "\n".join([
        f"- Document: {s['document']} | Section: {s['section']}\n  Excerpt: {s['text'][:350]}"
        for s in relevant_sections
    ])
    slots_block = "\n".join([f"{token}: {desc}" for token, desc in slot_to_desc.items()])

    prompt = f"""
You are the ClimateShield 360 AI Insight Agent providing extreme-weather decision support for Karachi, Pakistan.
Your goal is to provide a concise, factual answer stating each number and model name once.

CRITICAL NON-NEGOTIABLE PROVENANCE RULES:
1. YOU ARE STRICTLY FORBIDDEN FROM TYPING LITERAL DIGITS OR NUMBERS (0-9).
2. Whenever you mention any probability, population count, vulnerability score, threshold, ratio, or measurement, you MUST use one of the exact bracketed placeholders below:
{slots_block or 'No numerical placeholders available for this query.'}
3. State each model name once and list its metric placeholders together without repeating phrases.
4. Base your phrasing on the guidance excerpts below:
{context_blocks or 'No specific text excerpts retrieved.'}

User Question: {clean_q}

Provide an evidence-based answer adhering strictly to the placeholder contract:
""".strip()

    # 7. LLM Generation
    draft_wording = call_llm_with_cache(prompt, temperature=temperature)

    # 8. Slot-Filling & Regex Provenance Guardrail (Requirement 3)
    used_row_ids: Set[str] = set()
    filled_text = draft_wording

    for token, val in slot_to_val.items():
        if token in filled_text:
            filled_text = filled_text.replace(token, val)
            used_row_ids.add(slot_to_row[token])

    used_sections = []
    if not used_row_ids and relevant_sections:
        top_sec = relevant_sections[0]
        safe_excerpt = re.sub(r"\d+(?:\.\d+)?", "", top_sec["text"][:280]).strip()
        doc_label = re.sub(r"\d+", "", top_sec['document'].split('.')[0].replace('_', ' ')).strip()
        filled_text = f"Guidance from {doc_label}: {safe_excerpt}."
        used_sections.append(top_sec)
    elif relevant_sections and any(word in clean_q.lower() for word in ["guideline", "sop", "who", "ndma", "sign", "advice", "protocol", "symptom"]):
        top_sec = relevant_sections[0]
        safe_excerpt = re.sub(r"\d+(?:\.\d+)?", "", top_sec["text"][:200]).strip()
        doc_label = re.sub(r"\d+", "", top_sec['document'].split('.')[0].replace('_', ' ')).strip()
        filled_text = f"Guidance from {doc_label}: {safe_excerpt}. {filled_text}"
        used_sections.append(top_sec)

    # Strict Validation: Check every number in filled_text
    allowed_numbers = set(slot_to_val.values())
    present_numbers = NUMBER_REGEX.findall(filled_text)
    hallucinated_numbers = [num for num in present_numbers if num not in allowed_numbers]
    if hallucinated_numbers:
        return {
            "text": (
                "I don't know. The generated answer contained unverified numerical figures "
                f"({hallucinated_numbers}) not present in the gold warehouse tables."
            ),
            "citations": [],
            "row_ids": [],
            "limits": DISCLAIMER_ONLY,
            "supported": False,
        }

    # 9. Health & Safety Guardrail (Requirement 11)
    is_health_or_safety = any(k in clean_q.lower() or k in filled_text.lower() for k in HEALTH_KEYWORDS)
    if is_health_or_safety:
        filled_text = f"{filled_text}\n\n{HEALTH_EMERGENCY_POINTER}"
        limits_text = EMERGENCY_FOOTER
    else:
        limits_text = DISCLAIMER_ONLY

    # 10. Cap citations at the ones actually used in the text (Requirement 14)
    valid_citations = [
        {"document": s["document"], "section": s["section"]}
        for s in used_sections
    ][:2]

    # Build structured metrics for frontend presentation (Requirement 8 & 9)
    metrics = []
    for fact in gold_rows:
        if fact["row_id"] in used_row_ids:
            label = fact["label"]
            clean_group = label.replace("(", "· ").replace(")", "").replace(" - ", " · ")
            for k, v in fact["fields"].items():
                if v is None:
                    continue
                label_name = k.replace("_", " ").title()
                unit = ""
                if "prob" in k or "interval" in k or "base" in k:
                    unit = "%"
                    formatted = f"{round(float(v) * 100, 1)}%"
                elif "score" in k:
                    unit = "score"
                    formatted = str(v)
                elif "pop" in k:
                    unit = "people"
                    formatted = f"{int(v):,}"
                elif "count" in k or "facilit" in k or "hospital" in k:
                    unit = "count"
                    formatted = f"{int(v):,}"
                elif "temp" in k:
                    unit = "°C"
                    formatted = f"{v}°C"
                elif "humid" in k:
                    unit = "%"
                    formatted = f"{v}%"
                elif "rain" in k:
                    unit = "mm"
                    formatted = f"{v} mm"
                else:
                    formatted = str(v)
                metrics.append({
                    "group": clean_group,
                    "label": label_name,
                    "raw_value": v,
                    "formatted_value": formatted,
                    "unit": unit,
                })

    return {
        "text": filled_text,
        "citations": valid_citations,
        "row_ids": sorted(list(used_row_ids)),
        "limits": limits_text,
        "supported": True,
        "metrics": metrics,
    }


def main() -> None:
    """CLI Runner for live viva demonstrations and testing."""
    import sys
    print("=" * 70)
    print("ClimateShield 360 - RAG Decision Support Agent (Live Gemini 3.8 Flash)")
    print("=" * 70)

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        print(f"\n[Query]: {query}")
        print("Searching official library & querying warehouse...")
        res = answer(query)
        print("\n[Supported]:", res["supported"])
        print(f"\n[Response]:\n{res['text']}")
        print(f"\n[Citations]: {res['citations']}")
        print(f"[Row IDs]: {res['row_ids']}")
        return

    print("\nInteractive Mode: Type a question and press Enter (or 'quit' to exit).")
    print("Example questions you can try:")
    print("  1. What is the heat vulnerability and hazard probability in Malir?")
    print("  2. What should first responders do for severe heatstroke dehydration?")
    print("  3. What are the PMD flood warning levels on the Chenab river?")
    print("-" * 70)
    try:
        while True:
            user_input = input("\nAsk > ").strip()
            if not user_input:
                continue
            if user_input.lower() in {"quit", "exit", "q"}:
                break
            print("Searching official library & querying warehouse facts...")
            ans = answer(user_input)
            print(f"\n[Supported]: {ans['supported']}")
            print(f"\n[Response]:\n{ans['text']}")
            if ans["citations"]:
                print(f"\n[Citations]: {ans['citations']}")
            if ans["row_ids"]:
                print(f"[Row IDs]: {ans['row_ids']}")
            print("-" * 70)
    except (EOFError, KeyboardInterrupt):
        print("\nExiting.")


if __name__ == "__main__":
    main()
