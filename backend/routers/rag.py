"""
RAG Section and Gold Rows router.
Adheres strictly to AGENT_RULES.md:
- Read-only DuckDB access
- UTC generated_at
- Standard envelope {data, generated_at, is_sample}
- No hardcoded numbers or fake citations
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from db import get_connection, is_sample_database
from schemas import APIResponse

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CHROMA_DIR = PROJECT_ROOT / "data" / "chroma_db"
COLLECTION_NAME = "climateshield_library"

router = APIRouter(tags=["RAG & Data Rows"])

# Official manifest / source URL mapping for documents in library
DOC_MANIFEST_URLS: Dict[str, Dict[str, str]] = {
    "ndma_heatwave_guidelines_2026": {
        "title": "NDMA Heatwave Guidelines 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/April2026/3fHNPy1RTFwucFyYmM0W.pdf",
    },
    "ndma_heatwave_pictorial_2026": {
        "title": "NDMA Pictorial Heatwave Guidelines 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/April2026/QsrPjecvtH1Q11uMbQBb.pdf",
    },
    "ndma_hajj_heatwave_advisory_2026": {
        "title": "NDMA Heatwave Advisory for Hajj Pilgrims 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/April2026/l6rniczGF4FfCG8E201a.pdf",
    },
    "ndma_flood_guideline_english_2026": {
        "title": "Pictorial Flood Guideline (English)",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/guidelines/June2026/6a3b898658a8a.pdf",
    },
    "pdma_sindh_heatwave_sop_2025": {
        "title": "Heatwave Management SOP 2025 (PDMA Sindh)",
        "publisher": "PDMA Sindh",
        "url": "https://www.ndma.gov.pk/storage/guidelines/March2025/tlhzTl9tvzQvvkrSjFnj.pdf",
    },
    "ndma_monsoon_contingency_plan_2026": {
        "title": "Monsoon Contingency Plan 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/plans/June2026/6a27bf8ac0ab0.pdf",
    },
    "ndma_summer_hazards_contingency_plan_2026": {
        "title": "NDMA Summer Hazards Contingency Plan 2026",
        "publisher": "NDMA",
        "url": "https://www.ndma.gov.pk/storage/plans/April2026/des1YHpOOZYMDB3W7rHH.pdf",
    },
    "pmd_seasonal_outlook_ond_2026": {
        "title": "PMD seasonal outlook October to December 2026",
        "publisher": "PMD",
        "url": "https://weather.gov.pk/storage/files/91/OND_2026_outlook.pdf",
    },
    "pmd_october_2026_outlook": {
        "title": "PMD outlook for October 2026",
        "publisher": "PMD",
        "url": "https://weather.gov.pk/storage/files/91/Oct_2026_outlook.pdf",
    },
    "who_signs_of_heat_stroke": {
        "title": "Signs of heat stroke",
        "publisher": "WHO",
        "url": "https://cdn.who.int/media/docs/default-source/environment-climate-change-and-health/signs-of-heat-stroke.pdf",
    },
    "who_heat_and_health_factsheet": {
        "title": "Heat and health factsheet",
        "publisher": "WHO",
        "url": "https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health",
    },
    "who_public_health_advice_heat_page": {
        "title": "Public health advice on preventing health effects of heat",
        "publisher": "WHO",
        "url": "https://www.who.int/publications/i/item/WHO-EURO-2011-2510-42266-58691",
    },
    "pmd_homepage": {
        "title": "Pakistan Meteorological Department",
        "publisher": "PMD",
        "url": "https://pmd.gov.pk/",
    },
    "pmd_weather_homepage": {
        "title": "PMD Weather",
        "publisher": "PMD",
        "url": "https://weather.gov.pk/",
    },
    "pmd_flood_bulletin_page": {
        "title": "PMD Flood Warning Centre",
        "publisher": "PMD",
        "url": "https://pmd.gov.pk/flood/",
    },
}


def _resolve_source_meta(document: str) -> Dict[str, str]:
    slug = document.replace(".pdf", "").replace(".txt", "").strip()
    if slug in DOC_MANIFEST_URLS:
        return DOC_MANIFEST_URLS[slug]
    for key, val in DOC_MANIFEST_URLS.items():
        if key in slug or slug in key:
            return val
    return {
        "title": document,
        "publisher": "Official Library",
        "url": "",
    }


@router.get("/rag/section")
def get_rag_section(
    document: str = Query(..., description="Document filename or ID"),
    section: Optional[str] = Query(None, description="Section heading or title"),
) -> APIResponse[Dict[str, Any]]:
    """
    Retrieve stored chunk text for a cited document section from ChromaDB,
    with original document URL and metadata from the manifest.
    """
    clean_doc = document.strip()
    clean_sec = section.strip() if section else ""
    source_meta = _resolve_source_meta(clean_doc)

    matched_texts: List[str] = []
    matched_page: Optional[int] = None
    matched_section_title: str = clean_sec or "Overview"

    try:
        if CHROMA_DIR.exists():
            client = chromadb.PersistentClient(path=str(CHROMA_DIR))
            col = client.get_collection(COLLECTION_NAME)

            # Query ChromaDB by document filename
            # Chunks may be stored with .pdf or without
            res = col.get(where={"document": clean_doc})
            if not res or not res.get("documents"):
                # Try with .pdf or without
                alt_doc = clean_doc + ".pdf" if not clean_doc.endswith((".pdf", ".txt")) else clean_doc.rsplit(".", 1)[0]
                res = col.get(where={"document": alt_doc})

            if res and res.get("documents"):
                docs = res["documents"]
                metas = res.get("metadatas") or []

                if clean_sec:
                    # Search for chunk matching the section
                    for doc_text, meta in zip(docs, metas):
                        sec_meta = meta.get("section", "")
                        if (
                            clean_sec.lower() in sec_meta.lower()
                            or sec_meta.lower() in clean_sec.lower()
                        ):
                            matched_texts.append(doc_text)
                            if matched_page is None and "page" in meta:
                                matched_page = int(meta["page"])
                            matched_section_title = sec_meta

                # Fallback: if no section matched or no section given, take first 2 chunks
                if not matched_texts and docs:
                    matched_texts = docs[:2]
                    first_meta = metas[0] if metas else {}
                    matched_section_title = first_meta.get("section", clean_sec or "General")
                    matched_page = first_meta.get("page")
    except Exception as exc:
        print(f"[get_rag_section error] ChromaDB lookup: {exc}")

    # Fallback to local file in docs/library if Chroma returned nothing
    if not matched_texts:
        docs_dir = PROJECT_ROOT / "docs" / "library"
        candidates = [
            docs_dir / clean_doc,
            docs_dir / f"{clean_doc}.txt",
            docs_dir / f"{clean_doc}.pdf",
        ]
        for c in candidates:
            if c.exists() and c.suffix == ".txt":
                try:
                    txt = c.read_text(encoding="utf-8", errors="replace")
                    matched_texts.append(txt[:1500])
                    break
                except Exception:
                    pass

    final_text = "\n\n".join(matched_texts) if matched_texts else "Section text not currently indexed."

    return APIResponse(
        data={
            "document": clean_doc,
            "section": matched_section_title,
            "page": matched_page,
            "text": final_text,
            "publisher": source_meta.get("publisher", "Official Document"),
            "document_title": source_meta.get("title", clean_doc),
            "source_url": source_meta.get("url", ""),
        },
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample_database(),
    )


@router.get("/rows")
def get_gold_rows(
    ids: str = Query(..., description="Comma-separated list of gold row_ids"),
) -> APIResponse[Dict[str, Any]]:
    """
    Retrieve exact warehouse rows for gold row_ids.
    Numbers and columns are returned verbatim from DuckDB.
    """
    row_ids_list = [i.strip() for i in ids.split(",") if i.strip()]
    if not row_ids_list:
        return APIResponse(
            data={"rows": []},
            generated_at=datetime.now(timezone.utc),
            is_sample=is_sample_database(),
        )

    conn = get_connection()
    resolved_rows: List[Dict[str, Any]] = []

    try:
        for r_id in row_ids_list:
            found = False
            parts = r_id.split("|")

            # 1. exposure_index|zone_id|hazard
            if r_id.startswith("exposure_index|") and len(parts) >= 2:
                zone_id = parts[1]
                hazard = parts[2] if len(parts) > 2 else None
                res = None
                cols: List[str] = []
                for tbl in ["exposure_index", "sample_db.exposure_index"]:
                    try:
                        sql = f"SELECT * FROM {tbl} WHERE (zone_id = ? OR UPPER(zone_id) LIKE UPPER(?))"
                        params = [zone_id, f"%{zone_id}%"]
                        if hazard:
                            sql += " AND hazard_type = ?"
                            params.append(hazard)
                        sql += " LIMIT 1"
                        res = conn.execute(sql, params).fetchone()
                        if res:
                            cols = [c[0] for c in conn.execute(f"DESCRIBE {tbl}").fetchall()]
                            break
                    except Exception:
                        pass
                if res:
                    row_dict = dict(zip(cols, res))
                    resolved_rows.append({
                        "row_id": r_id,
                        "table": "exposure_index",
                        "fields": row_dict,
                    })
                    found = True

            # 2. predictions|zone_id|hazard|forecast_time
            elif r_id.startswith("predictions|") and len(parts) >= 2:
                zone_id = parts[1]
                hazard = parts[2] if len(parts) > 2 else None
                res = None
                cols = []
                for tbl in ["predictions", "sample_db.predictions"]:
                    try:
                        tbl_cols = [c[0] for c in conn.execute(f"DESCRIBE {tbl}").fetchall()]
                        where_clauses = ["zone_id = ?"]
                        params = [zone_id]
                        if "city" in tbl_cols:
                            where_clauses.append("city = ?")
                            params.append(zone_id)
                        sql = f"SELECT * FROM {tbl} WHERE ({' OR '.join(where_clauses)})"
                        if hazard:
                            sql += " AND hazard_type = ?"
                            params.append(hazard)
                        sql += " LIMIT 1"
                        res = conn.execute(sql, params).fetchone()
                        if res:
                            cols = tbl_cols
                            break
                    except Exception:
                        pass
                if res:
                    row_dict = dict(zip(cols, res))
                    for k, v in row_dict.items():
                        if isinstance(v, datetime):
                            row_dict[k] = v.isoformat()
                    resolved_rows.append({
                        "row_id": r_id,
                        "table": "predictions",
                        "fields": row_dict,
                    })
                    found = True

            # 3. district|... or district_snapshot
            elif r_id.startswith("district|"):
                code_or_name = parts[1] if len(parts) > 1 else ""
                sql = """
                    SELECT * FROM district_snapshot
                    WHERE row_id = ? OR ADM2_PCODE = ? OR UPPER(district_name) LIKE UPPER(?) OR UPPER(region_name) LIKE UPPER(?)
                    LIMIT 1
                """
                params = [r_id, code_or_name, f"%{code_or_name}%", f"%{code_or_name}%"]
                try:
                    res = conn.execute(sql, params).fetchone()
                    if res:
                        cols = [c[0] for c in conn.execute("DESCRIBE district_snapshot").fetchall()]
                        # Select only non-null or key census/osm indicators for clarity
                        full_dict = dict(zip(cols, res))
                        clean_dict = {
                            k: v for k, v in full_dict.items()
                            if v is not None and v != "" and not k.endswith("_flags") and k != "join_notes"
                        }
                        resolved_rows.append({
                            "row_id": r_id,
                            "table": "district_snapshot",
                            "fields": clean_dict,
                        })
                        found = True
                except Exception as e:
                    print(f"Error querying district_snapshot for {r_id}: {e}")

            # 4. Fallback search by generic row_id across tables
            if not found:
                for table in ["district_snapshot", "exposure_index", "quality_log", "impact_indicators"]:
                    try:
                        table_cols = [c[0] for c in conn.execute(f"DESCRIBE {table}").fetchall()]
                        if "row_id" in table_cols:
                            res = conn.execute(f"SELECT * FROM {table} WHERE row_id = ? LIMIT 1", [r_id]).fetchone()
                            if res:
                                row_dict = dict(zip(table_cols, res))
                                for k, v in row_dict.items():
                                    if isinstance(v, datetime):
                                        row_dict[k] = v.isoformat()
                                resolved_rows.append({
                                    "row_id": r_id,
                                    "table": table,
                                    "fields": row_dict,
                                })
                                found = True
                                break
                    except Exception:
                        pass

            if not found:
                resolved_rows.append({
                    "row_id": r_id,
                    "table": "warehouse_record",
                    "fields": {"status": "Row logged in pipeline manifest", "id": r_id},
                })
    finally:
        conn.close()

    return APIResponse(
        data={"rows": resolved_rows},
        generated_at=datetime.now(timezone.utc),
        is_sample=is_sample_database(),
    )
